import { DatabaseSync } from 'node:sqlite';
import { serviceSchema, serviceRecords, saveService } from '../backend/src/maintenance/service.ts';
import { selectedSchema, selectedRuns, saveSelected } from '../backend/src/predictive/selected.ts';
import { annualSchema, seedAnnualHistories, getAnnualHistory, evaluateAnnualHistory } from '../backend/src/predictive/annual-history.ts';
import { selectedWarningState, selectedFunctionLabels, warningPriority, isCurrentCondition } from '../shared/selected-warnings.ts';
import {journeysSchema,seedOwnerJourneys,getJourneys} from '../backend/src/vehicles/journeys.ts';
import {capabilitySchema,seedCapabilityBindings,saveSourceSettings,addFunctionObservation,functionInputs,sourceSettings,assertApplicable,vehicleConfiguration} from '../backend/src/vehicles/capability-data.ts';
import {capabilityCard,discloseCapabilities,capabilityHistory} from '../backend/src/vehicles/capabilities.ts';
import {functionApplicability} from '../shared/capabilities.ts';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateVehicle } from '../backend/src/core.ts';
import { prepareImport } from '../backend/src/imports/normalization.ts';
import { validateSettings } from '../backend/src/assessment/settings.ts';
import { validateScheduleFields, validateScheduleChange } from '../backend/src/maintenance/scheduling.ts';
import { saveVehicleProfile } from '../backend/src/vehicles/repository.ts';
import { saveInspection } from '../backend/src/maintenance/inspections.ts';
import { coolingSchema, getCoolingRuns, saveCoolingRun, readCoolingNotification } from '../backend/src/predictive/cooling.ts';
import { coolingMatchesSettings } from '../shared/cooling.ts';
import { lubricationSchema, getLubricationRuns, saveLubricationRun, readLubricationNotification } from '../backend/src/predictive/lubrication.ts';
import { lubricationMatchesSettings } from '../shared/lubrication.ts';

const schema = `
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS vehicles(id TEXT PRIMARY KEY, display_name TEXT NOT NULL, registration TEXT NOT NULL, profile TEXT NOT NULL, make_model TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observations(id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), parameter TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL, observed_at TEXT NOT NULL, imported_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS warnings(id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), source_type TEXT NOT NULL, source_ref TEXT NOT NULL, title TEXT NOT NULL, explanation TEXT NOT NULL, created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS warning_observations(warning_id TEXT NOT NULL REFERENCES warnings(id), observation_id INTEGER NOT NULL REFERENCES observations(id), PRIMARY KEY(warning_id, observation_id));
CREATE TABLE IF NOT EXISTS forecasts(id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), title TEXT NOT NULL, explanation TEXT NOT NULL, forecast_at TEXT NOT NULL, suggested_window TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS actions(id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), warning_id TEXT NOT NULL REFERENCES warnings(id), actor_profile TEXT NOT NULL, task TEXT NOT NULL, assigned_to TEXT, status TEXT NOT NULL, outcome TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS action_history(id INTEGER PRIMARY KEY AUTOINCREMENT, action_id INTEGER NOT NULL REFERENCES actions(id), status TEXT NOT NULL, note TEXT NOT NULL, changed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS import_rejections(id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, reason TEXT NOT NULL, rejected_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_locations(vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id), latitude REAL NOT NULL, longitude REAL NOT NULL, label TEXT NOT NULL, recorded_at TEXT NOT NULL, simulated INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS observation_sources(observation_id INTEGER PRIMARY KEY REFERENCES observations(id), original_value REAL NOT NULL, original_unit TEXT NOT NULL, original_observed_at TEXT NOT NULL, conversion TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assessment_settings(id INTEGER PRIMARY KEY CHECK(id=1), configuration TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS configuration_history(id INTEGER PRIMARY KEY AUTOINCREMENT, configuration TEXT NOT NULL, saved_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_details(vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id), model_year INTEGER NOT NULL, fuel_type TEXT NOT NULL, transmission TEXT NOT NULL, engine_cc INTEGER NOT NULL, colour TEXT NOT NULL, purchased_at TEXT NOT NULL, last_service_at TEXT NOT NULL, last_service_km INTEGER NOT NULL, photo_url TEXT, photo_description TEXT);
CREATE TABLE IF NOT EXISTS vehicle_equipment(vehicle_id TEXT NOT NULL REFERENCES vehicles(id), name TEXT NOT NULL, PRIMARY KEY(vehicle_id,name));
CREATE TABLE IF NOT EXISTS odometer_readings(id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), kilometres INTEGER NOT NULL CHECK(kilometres>=0), recorded_at TEXT NOT NULL, source TEXT NOT NULL, UNIQUE(vehicle_id,recorded_at));
CREATE TABLE IF NOT EXISTS vehicle_tyres(vehicle_id TEXT NOT NULL REFERENCES vehicles(id), position TEXT NOT NULL, brand TEXT NOT NULL, model TEXT NOT NULL, size TEXT NOT NULL, season TEXT NOT NULL, dot_code TEXT NOT NULL, installed_at TEXT NOT NULL, installed_km INTEGER NOT NULL, pressure_bar REAL NOT NULL, tread_mm REAL NOT NULL, measured_at TEXT NOT NULL, last_rotation_at TEXT NOT NULL, PRIMARY KEY(vehicle_id,position));
CREATE TABLE IF NOT EXISTS demo_extensions(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_profile_history(id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), section TEXT NOT NULL, note TEXT NOT NULL, changed_at TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS action_inspections(id INTEGER PRIMARY KEY AUTOINCREMENT, action_id INTEGER NOT NULL REFERENCES actions(id), result TEXT NOT NULL CHECK(result IN ('confirmed','not confirmed','further investigation')), inspected_at TEXT NOT NULL, reported_by TEXT NOT NULL, notes TEXT NOT NULL, recorded_at TEXT NOT NULL, actor_profile TEXT NOT NULL CHECK(actor_profile IN ('fleet','owner')));
CREATE INDEX IF NOT EXISTS action_inspections_action ON action_inspections(action_id,id);
`;

export class Store {
  constructor(dbPath, rootDir) {
    this.rootDir = rootDir;
    this.db = new DatabaseSync(dbPath);
    this.db.exec(schema);
    this.db.exec(serviceSchema);
    this.db.exec(selectedSchema);
    this.db.exec(annualSchema);
    this.db.exec(capabilitySchema);
    this.db.exec(journeysSchema);
    this.db.exec(coolingSchema);
    this.db.exec(lubricationSchema);
    // Additive, transactional migration: preserve legacy actions and history.
    this.db.exec('BEGIN');
    try {
      const actionColumns = new Set(this.db.prepare('PRAGMA table_info(actions)').all().map(row => row.name));
      const historyColumns = new Set(this.db.prepare('PRAGMA table_info(action_history)').all().map(row => row.name));
      if (!actionColumns.has('due_date')) this.db.exec('ALTER TABLE actions ADD COLUMN due_date TEXT');
      if (!actionColumns.has('priority')) this.db.exec("ALTER TABLE actions ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'");
      if (!historyColumns.has('due_date')) this.db.exec('ALTER TABLE action_history ADD COLUMN due_date TEXT');
      if (!historyColumns.has('priority')) this.db.exec('ALTER TABLE action_history ADD COLUMN priority TEXT');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
  }
  close() { this.db.close(); }
  seedCapabilitySupport(defaults){seedCapabilityBindings(this.db,this.getConfig(defaults).assessmentTime);}
  checkCapabilityVehicle(id,profile){if(!this.db.prepare('SELECT id FROM vehicles WHERE id=? AND profile=?').get(id,profile))throw new Error('Vehicle not found for selected profile.');}
  getCapabilityCard(id,profile,defaults,fail=false){this.checkCapabilityVehicle(id,profile);return capabilityCard(this.db,id,this.getConfig(defaults).assessmentTime,fail);}
  getCapabilityHistory(id,profile){this.checkCapabilityVehicle(id,profile);return capabilityHistory(this.db,id);}
  discloseCapabilities(id,profile,stage,defaults,fail=false){this.checkCapabilityVehicle(id,profile);return discloseCapabilities(this.db,id,stage,this.getConfig(defaults).assessmentTime,fail);}
  saveFunctionSource(id,profile,input,fail=false){this.checkCapabilityVehicle(id,profile);saveSourceSettings(this.db,id,input,fail);}
  addFunctionObservation(id,profile,input,defaults,fail=false){this.checkCapabilityVehicle(id,profile);return addFunctionObservation(this.db,id,input,this.getConfig(defaults).assessmentTime,fail);}
  getFunctionInputs(id,profile,fn,defaults){this.checkCapabilityVehicle(id,profile);return functionInputs(this.db,id,fn,this.getConfig(defaults).assessmentTime);}
  evaluateFunction(id,profile,fn,channelId,defaults,fail=false){
    const card=this.getCapabilityCard(id,profile,defaults),capability=card.functions.find(f=>f.functionId===fn);
    if(!capability?.canEvaluate)throw new Error(capability?.reason||'Unknown function.');
    const channel=capability.channels.find(c=>c.id===channelId);if(channel?.status!=='ready')throw new Error(channel?.reason||'Select an eligible source channel.');
    const source=this.getFunctionInputs(id,profile,fn,defaults).find(s=>s.id===channelId);if(!source)throw new Error('Source history not found.');
    return this.saveSelectedRun(id,profile,source.input,defaults,fail);
  }
  saveDailyPlan(id,profile,input,defaults,fail=false){
    this.checkCapabilityVehicle(id,profile);
    const config=this.getConfig(defaults),card=this.getCapabilityCard(id,profile,defaults),oil=card.functions.find(f=>f.functionId==='oil');
    if(!oil?.canEvaluate)throw new Error(oil?.reason||'Oil-service data are unavailable.');
    if(!input||typeof input!=='object'||!Number.isSafeInteger(input.forecastRunId))throw new Error('Select a saved oil-service estimate.');
    const run=this.getSelectedRuns(id,profile).find(r=>r.id===input.forecastRunId);
    if(!run||run.superseded||run.input.functionId!=='oil'||Date.parse(run.assessedAt)!==Date.parse(config.assessmentTime)||!['crossing estimate','provider estimate'].includes(run.result.status))throw new Error('The selected oil estimate is missing, historical or ineligible. Evaluate current data first.');
    const currentInputs=this.getFunctionInputs(id,profile,'oil',defaults);
    if(!currentInputs.some(s=>JSON.stringify(s.input)===JSON.stringify(run.input)))throw new Error('Source observations or settings have changed since this estimate. Evaluate the current stored data first.');
    const provider=run.input.providerEstimate;
    const plan={planId:typeof input.planId==='string'&&input.planId.trim()?input.planId:'next-use',description:input.description,periodStart:input.periodStart,maintenanceAt:input.maintenanceAt,timeZone:input.timeZone,plannedDistanceKm:input.plannedDistanceKm,forecastId:`SELECTED:${run.id}`,forecastRevision:provider?.revision??1,issuedAt:provider?.issuedAt??run.assessedAt,validUntil:provider?.validUntil??new Date(Date.parse(run.assessedAt)+run.input.policy.maxAgeHours*3600000).toISOString(),source:run.input.source,reference:run.input.referenceSource,eligible:true,dataOrigin:run.input.dataOrigin,manufacturerDistanceKm:input.manufacturerDistanceKm,manufacturerDueAt:input.manufacturerDueAt,remainingDistanceKm:provider?.remainingDistanceKm??run.result.crossingAfter,serviceDueAt:provider?.serviceDueAt,lowerDistanceKm:provider?undefined:run.result.lower,upperDistanceKm:provider?undefined:run.result.upper,validityKind:provider?'source valid until':'freshness at comparison',distanceHorizonKm:provider?undefined:run.input.horizon};
    return this.saveServiceRecord(id,profile,'plan',plan,defaults,fail);
  }
  getFunctionObservationEvidence(id,profile){this.checkCapabilityVehicle(id,profile);return this.db.prepare('SELECT record_id AS recordId,function_id AS functionId,origin,observed_at AS observedAt,received_at AS importedAt,raw_json,point_json,event_json FROM capability_observations WHERE vehicle_id=? ORDER BY id').all(id).map(r=>({recordId:r.recordId,functionId:r.functionId,origin:r.origin,observedAt:r.observedAt,importedAt:r.importedAt,raw:JSON.parse(r.raw_json),canonical:JSON.parse(r.point_json),event:r.event_json?JSON.parse(r.event_json):undefined}));}
  seedOwnerJourneys(){seedOwnerJourneys(this.db);}
  seedAnnualHistories(defaults) { seedAnnualHistories(this.db,this.getConfig(defaults).assessmentTime); }
  getAnnualHistory(vehicleId,profile) { return getAnnualHistory(this.db,vehicleId,profile); }
  evaluateAnnualHistory(vehicleId,profile,seriesId,defaults,simulateFailure=false) { return evaluateAnnualHistory(this.db,vehicleId,profile,seriesId,this.getConfig(defaults).assessmentTime,simulateFailure); }
  getSelectedRuns(vehicleId,profile) {
    if (!this.db.prepare('SELECT id FROM vehicles WHERE id=? AND profile=?').get(vehicleId,profile)) throw new Error('Vehicle not found for selected profile.');
    return selectedRuns(this.db,vehicleId);
  }
  saveSelectedRun(vehicleId,profile,input,defaults,simulateFailure=false) { return saveSelected(this.db,vehicleId,profile,input,this.getConfig(defaults).assessmentTime,simulateFailure); }
  getServiceRecords(vehicleId, profile) {
    if (!this.db.prepare('SELECT id FROM vehicles WHERE id=? AND profile=?').get(vehicleId,profile)) throw new Error('Vehicle not found for selected profile.');
    return serviceRecords(this.db, vehicleId);
  }
  saveServiceRecord(vehicleId, profile, kind, input, defaults, simulateFailure = false) {
    this.checkCapabilityVehicle(vehicleId,profile);
    if(kind==='plan')assertApplicable(this.db,vehicleId,'oil');
    const config = this.getConfig(defaults);
    this.assess(config);
    const vehicle = this.getSnapshot(profile,defaults).vehicles.find(v => v.id === vehicleId);
    const currentWarning = vehicle?.warnings.some(isCurrentCondition) ?? false;
    return saveService(this.db, vehicleId, profile, kind, input, config.assessmentTime, config.observationMaxAgeHours, currentWarning, simulateFailure);
  }
  applyOwnerCoolingDemo(defaults, now = new Date().toISOString()) {
    const extension = 'owner-cooling-warning-v1';
    if (this.db.prepare('SELECT id FROM demo_extensions WHERE id=?').get(extension)) return;
    if (!this.db.prepare("SELECT id FROM vehicles WHERE id='OWNER-001' AND profile='owner'").get()) return;
    const configuration = this.getConfig(defaults);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      saveCoolingRun(this.db, { profile: 'owner', vehicleId: 'OWNER-001', scenario: 'gradual' }, configuration, now, false);
      // Keep the original evidence and task links; replace only its current-demo status.
      this.db.prepare("UPDATE warnings SET active=0 WHERE id='WARN-FORECAST-OWNER-001' AND vehicle_id='OWNER-001' AND source_type='simulated_forecast'").run();
      this.db.prepare('INSERT INTO demo_extensions VALUES(?,?)').run(extension, now);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw new Error('Could not initialise the owner cooling demo. Previous records were retained.', { cause: error }); }
  }
  getConfig(defaults) {
    const saved = this.db.prepare('SELECT configuration FROM assessment_settings WHERE id=1').get();
    if (saved) return JSON.parse(saved.configuration);
    this.saveConfig(defaults);
    return structuredClone(defaults);
  }
  saveConfig(configuration, now = new Date().toISOString()) {
    this.db.exec('BEGIN');
    try {
      const json = JSON.stringify(configuration);
      this.db.prepare('INSERT INTO assessment_settings(id,configuration) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET configuration=excluded.configuration').run(json);
      this.db.prepare('INSERT INTO configuration_history(configuration,saved_at) VALUES(?,?)').run(json, now);
      this.assess(configuration);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw new Error('Could not save assessment settings. Please retry.', { cause: error }); }
  }
  updateConfig(input, defaults, now = new Date().toISOString()) {
    const settings = validateSettings(input);
    const configuration = { ...this.getConfig(defaults), ...settings };
    this.saveConfig(configuration, now);
    return configuration;
  }
  getConfigurationHistory() {
    return this.db.prepare('SELECT id,configuration,saved_at savedAt FROM configuration_history ORDER BY id').all().map(row => ({ ...row, configuration: JSON.parse(row.configuration) }));
  }
  getSnapshot(profile, defaults) {
    const configuration = this.getConfig(defaults);
    const assessments = this.assess(configuration);
    const coolingRuns = this.getCoolingRuns(profile);
    const lubricationRuns = this.getLubricationRuns(profile);
    const vehicles = this.getDashboard(profile).map(vehicle => {
      const assessment = assessments.find(a => a.vehicleId === vehicle.id);
      const selected = new Map(selectedRuns(this.db,vehicle.id).map(run=>[run.warningId,run]));
      return { ...vehicle, warnings: vehicle.warnings.map(w => {
        if(w.sourceType==='selected_forecast'){
          const run=selected.get(w.id);
          if(!run)return {...w,current:false,active:0};
          const state=selectedWarningState(run,configuration.assessmentTime);
          const applicable=functionApplicability(vehicle.details?.fuelType??'Unknown',run.input.functionId),settings=sourceSettings(this.db,vehicle.id,run.input.functionId);
          const binding=this.db.prepare('SELECT configuration_hash FROM capability_bindings WHERE vehicle_id=? AND function_id=?').get(vehicle.id,run.input.functionId),configurationChanged=binding&&binding.configuration_hash!==vehicleConfiguration(this.db,vehicle.id).configuration.fingerprint;
          if(applicable.status!=='applicable'||configurationChanged||(state.attentionKind==='forecast'&&(settings.mode!=='demo'||settings.feed!=='available'))){state.current=false;state.evidence.statusReason=applicable.status!=='applicable'?applicable.reason:configurationChanged?'Vehicle configuration changed. Review configuration-specific support before reusing this result.':'Source access changed. Review the capability card and refresh eligible data.';}
          return {...w,title:`${selectedFunctionLabels[run.input.functionId]}${state.evidence.wheelPosition?` · ${state.evidence.wheelPosition}`:''}: ${run.result.status}`,current:state.current,active:state.current?1:0,simulated:run.input.dataOrigin==='constructed fixture',attentionKind:state.attentionKind,selectedEvidence:state.evidence};
        }
        const current = w.sourceType === 'computed_cooling' ? coolingRuns.some(r => r.id === w.sourceRef && r.selected && coolingMatchesSettings(r, configuration.assessmentTime, configuration.observationMaxAgeHours)) : w.sourceType === 'computed_lubrication' ? lubricationRuns.some(r => r.id === w.sourceRef && r.selected && lubricationMatchesSettings(r, configuration.assessmentTime, configuration.observationMaxAgeHours)) : w.sourceType === 'simulated_forecast' ? w.active === 1 && Date.parse(w.createdAt) <= Date.parse(configuration.assessmentTime) : assessment.triggers.some(t => t.rule.id === w.sourceRef && w.supportingObservations.some(o => o.id === t.observation.id));
        return { ...w, current, active: current ? 1 : 0 };
      }).sort(warningPriority) };
    });
    return { profile, assessmentTime: configuration.assessmentTime, configuration, vehicles, coolingRuns, lubricationRuns, assessments: assessments.filter(a => vehicles.some(v => v.id === a.vehicleId)) };
  }
  getCoolingRuns(profile) { return getCoolingRuns(this.db, profile); }
  runCooling(input, defaults, now) { return saveCoolingRun(this.db, input, this.getConfig(defaults), now); }
  readCoolingNotification(id, profile, now) { return readCoolingNotification(this.db, id, profile, now); }
  getLubricationRuns(profile) { return getLubricationRuns(this.db, profile); }
  runLubrication(input, defaults, now) { return saveLubricationRun(this.db, input, this.getConfig(defaults), now); }
  readLubricationNotification(id, profile, now) { return readLubricationNotification(this.db, id, profile, now); }
  getForecasts(profile) {
    return this.db.prepare('SELECT f.id,f.vehicle_id vehicleId,f.title,f.explanation,f.forecast_at forecastAt,f.suggested_window suggestedWindow FROM forecasts f JOIN vehicles v ON v.id=f.vehicle_id WHERE v.profile=? ORDER BY f.id').all(profile).map(f => ({ ...f, simulated: true }));
  }
  getImportRejections(profile) {
    const ids = new Set(this.db.prepare('SELECT id FROM vehicles WHERE profile=?').all(profile).map(v => v.id));
    const allIds = new Set(this.db.prepare('SELECT id FROM vehicles').all().map(v => v.id));
    return this.db.prepare('SELECT id,payload,reason,rejected_at rejectedAt FROM import_rejections ORDER BY id').all().map(r => ({ id: r.id, record: JSON.parse(r.payload), reason: r.reason, rejectedAt: r.rejectedAt })).filter(r => ids.has(r.record?.vehicleId) || (profile === 'fleet' && !allIds.has(r.record?.vehicleId)));
  }
  seed() {
    const count = this.db.prepare('SELECT count(*) n FROM vehicles').get().n;
    if (count) { this.seedLocations(); this.seedVehicleDetails(); return; }
    const vehicles = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'data/vehicles.json'), 'utf8'));
    const observations = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'data/observations.json'), 'utf8'));
    const forecasts = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'data/forecasts.json'), 'utf8'));
    const insertVehicle = this.db.prepare('INSERT INTO vehicles VALUES(?,?,?,?,?)');
    for (const v of vehicles) insertVehicle.run(v.id, v.displayName, v.registration, v.profile, v.makeModel);
    this.importObservations(observations, '2026-10-04T09:00:00.000Z');
    const insertForecast = this.db.prepare('INSERT INTO forecasts VALUES(?,?,?,?,?,?)');
    const insertWarning = this.db.prepare('INSERT INTO warnings VALUES(?,?,?,?,?,?,?,1)');
    for (const f of forecasts) {
      insertForecast.run(f.id, f.vehicleId, f.title, f.explanation, f.forecastAt, f.suggestedWindow);
      insertWarning.run(`WARN-${f.id}`, f.vehicleId, 'simulated_forecast', f.id, f.title, f.explanation, f.forecastAt);
    }
    this.seedLocations();
    this.seedVehicleDetails();
  }
  seedVehicleDetails() {
    const records = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'data/vehicle-details.json'), 'utf8'));
    this.db.exec('BEGIN');
    try {
      for (const v of records) {
        if (!this.db.prepare('SELECT id FROM vehicles WHERE id=?').get(v.vehicleId)) continue;
        // Seed a profile only once: never restore equipment/tyres removed by its editor.
        if (this.db.prepare('SELECT vehicle_id FROM vehicle_details WHERE vehicle_id=?').get(v.vehicleId)) continue;
        this.db.prepare('INSERT OR IGNORE INTO vehicle_details VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(v.vehicleId,v.modelYear,v.fuelType,v.transmission,v.engineCc,v.colour,v.purchasedAt,v.lastServiceAt,v.lastServiceKm,v.photoUrl || null,v.photoDescription || null);
        for (const name of v.equipment) this.db.prepare('INSERT OR IGNORE INTO vehicle_equipment VALUES(?,?)').run(v.vehicleId,name);
        for (const o of v.odometerHistory) this.db.prepare('INSERT OR IGNORE INTO odometer_readings(vehicle_id,kilometres,recorded_at,source) VALUES(?,?,?,?)').run(v.vehicleId,o.kilometres,o.recordedAt,o.source);
        for (const t of v.tyres) this.db.prepare('INSERT OR IGNORE INTO vehicle_tyres VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(v.vehicleId,t.position,t.brand,t.model,t.size,t.season,t.dotCode,t.installedAt,t.installedKm,t.pressureBar,t.treadMm,t.measuredAt,t.lastRotationAt);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    // Add older synthetic readings once; do not replace existing readings or fleet gap cases.
    if (!this.db.prepare('SELECT id FROM demo_extensions WHERE id=?').get('owner-history-v1') && this.db.prepare('SELECT id FROM vehicles WHERE id=?').get('OWNER-001')) {
      const history = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'data/owner-history.json'), 'utf8'));
      this.importObservations(history, new Date().toISOString(), 'owner-history-v1');
    }
  }
  seedLocations() {
    const locations = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'data/locations.json'), 'utf8'));
    const insert = this.db.prepare('INSERT OR IGNORE INTO vehicle_locations(vehicle_id,latitude,longitude,label,recorded_at,simulated) VALUES(?,?,?,?,?,1)');
    for (const l of locations) insert.run(l.vehicleId,l.latitude,l.longitude,l.label,l.recordedAt);
  }
  previewImport(records) {
    const vehicleIds = new Set(this.db.prepare('SELECT id FROM vehicles').all().map((r) => r.id));
    return prepareImport(records, vehicleIds);
  }
  importObservations(records, importedAt = new Date().toISOString(), extensionId) {
    const result = this.previewImport(records);
    const insert = this.db.prepare('INSERT INTO observations(vehicle_id,parameter,value,unit,observed_at,imported_at) VALUES(?,?,?,?,?,?)');
    const reject = this.db.prepare('INSERT INTO import_rejections(payload,reason,rejected_at) VALUES(?,?,?)');
    const sourceInsert = this.db.prepare('INSERT INTO observation_sources VALUES(?,?,?,?,?)');
    this.db.exec('BEGIN');
    try {
      for (const record of result.accepted) {
        const saved = insert.run(record.vehicleId, record.parameter, record.value, record.unit, record.observedAt, importedAt);
        record.id = Number(saved.lastInsertRowid);
        sourceInsert.run(record.id, record.source.value, record.source.unit, record.source.observedAt, record.source.conversion);
      }
      for (const record of result.rejected) reject.run(JSON.stringify(record.record), record.reason, importedAt);
      if (extensionId) this.db.prepare('INSERT INTO demo_extensions VALUES(?,?)').run(extensionId,importedAt);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw new Error('Could not save the import. No records from this batch were saved. Your input can be retried.', { cause: error });
    }
    return result;
  }
  assess(config) {
    const vehicles = this.db.prepare('SELECT id FROM vehicles').all();
    const results = [];
    for (const vehicle of vehicles) {
      const observations = this.db.prepare('SELECT id, parameter, value, unit, observed_at observedAt FROM observations WHERE vehicle_id=? ORDER BY observed_at').all(vehicle.id);
      const result = evaluateVehicle(observations, config);
      for (const trigger of result.triggers) {
        const warningId = `WARN-${vehicle.id}-${trigger.rule.id}-${trigger.observation.id}`;
        this.db.prepare('INSERT OR IGNORE INTO warnings VALUES(?,?,?,?,?,?,?,1)').run(warningId, vehicle.id, 'rule', trigger.rule.id, trigger.rule.title, trigger.rule.explanation, config.assessmentTime);
        this.db.prepare('INSERT OR IGNORE INTO warning_observations VALUES(?,?)').run(warningId, trigger.observation.id);
      }
      results.push({ vehicleId: vehicle.id, ...result });
    }
    return results;
  }
  getDashboard(profile) {
    const vehicles = this.db.prepare(`SELECT id, display_name displayName, registration, profile, make_model makeModel FROM vehicles WHERE profile=? ORDER BY id`).all(profile);
    return vehicles.map((v) => {
      const observations = this.db.prepare('SELECT id, parameter, value, unit, observed_at observedAt, imported_at importedAt FROM observations WHERE vehicle_id=? ORDER BY observed_at DESC,id DESC').all(v.id).map(o => ({ ...o, source: this.db.prepare('SELECT original_value value,original_unit unit,original_observed_at observedAt,conversion FROM observation_sources WHERE observation_id=?').get(o.id) }));
      const warnings = this.db.prepare('SELECT id, source_type sourceType, source_ref sourceRef, title, explanation, created_at createdAt, active FROM warnings WHERE vehicle_id=? ORDER BY created_at DESC,id').all(v.id).map((w) => ({...w, simulated: w.sourceType === 'simulated_forecast', supportingObservations: this.db.prepare('SELECT o.id,o.parameter,o.value,o.unit,o.observed_at observedAt FROM observations o JOIN warning_observations wo ON wo.observation_id=o.id WHERE wo.warning_id=? ORDER BY o.id').all(w.id)}));
      const actions = this.db.prepare('SELECT id, warning_id warningId, actor_profile actorProfile, task, assigned_to assignedTo, status, outcome, due_date dueDate, priority, created_at createdAt, updated_at updatedAt FROM actions WHERE vehicle_id=? ORDER BY id DESC').all(v.id).map((a) => ({...a, history: this.db.prepare('SELECT status,note,changed_at changedAt,due_date dueDate,priority FROM action_history WHERE action_id=? ORDER BY id').all(a.id)}));
      const location = this.db.prepare('SELECT latitude,longitude,label,recorded_at recordedAt,simulated FROM vehicle_locations WHERE vehicle_id=?').get(v.id);
      for (const action of actions) action.inspections = this.db.prepare('SELECT id,result,inspected_at inspectedAt,reported_by reportedBy,notes,recorded_at recordedAt,actor_profile actorProfile FROM action_inspections WHERE action_id=? ORDER BY id DESC').all(action.id).map(record => ({ ...record, source: 'user reported' }));
      const specification = this.db.prepare('SELECT model_year modelYear,fuel_type fuelType,transmission,engine_cc engineCc,colour,purchased_at purchasedAt,last_service_at lastServiceAt,last_service_km lastServiceKm,photo_url photoUrl,photo_description photoDescription FROM vehicle_details WHERE vehicle_id=?').get(v.id);
      const details = specification ? { ...specification, simulated: true, equipment: this.db.prepare('SELECT name FROM vehicle_equipment WHERE vehicle_id=? ORDER BY name').all(v.id).map(e => e.name), odometerHistory: this.db.prepare('SELECT id,kilometres,recorded_at recordedAt,source FROM odometer_readings WHERE vehicle_id=? ORDER BY recorded_at DESC,id DESC').all(v.id), tyres: this.db.prepare('SELECT position,brand,model,size,season,dot_code dotCode,installed_at installedAt,installed_km installedKm,pressure_bar pressureBar,tread_mm treadMm,measured_at measuredAt,last_rotation_at lastRotationAt FROM vehicle_tyres WHERE vehicle_id=? ORDER BY position').all(v.id) } : undefined;
      const profileHistory = this.db.prepare('SELECT id,section,note,changed_at changedAt,before_json,after_json FROM vehicle_profile_history WHERE vehicle_id=? ORDER BY id DESC').all(v.id).map(h => ({ id: h.id, section: h.section, note: h.note, changedAt: h.changedAt, source: 'user entered', before: JSON.parse(h.before_json), after: JSON.parse(h.after_json) }));
      return {...v, details, profileHistory, profileRevision: profileHistory[0]?.id || 0, location: location ? {...location, simulated: true} : undefined, journeys: v.profile==='owner'?getJourneys(this.db,v.id):[], observations, warnings, actions};
    });
  }
  createAction(input, now = new Date().toISOString()) {
    const schedule = validateScheduleFields(input);
    const warning = this.db.prepare('SELECT vehicle_id vehicleId FROM warnings WHERE id=?').get(input.warningId);
    if (!warning || warning.vehicleId !== input.vehicleId) throw new Error('Warning does not belong to the selected vehicle');
    if (!['fleet','owner'].includes(input.actorProfile)) throw new Error('Invalid actor profile');
    const vehicle = this.db.prepare('SELECT profile FROM vehicles WHERE id=?').get(input.vehicleId);
    if (vehicle.profile !== input.actorProfile) throw new Error('Actor profile must match the selected vehicle');
    if (!input.task?.trim()) throw new Error('Task or chosen response is required');
    if (input.actorProfile === 'fleet' && !input.assignedTo?.trim()) throw new Error('Assigned person or role is required for fleet actions');
    this.db.exec('BEGIN');
    try {
      const result = this.db.prepare('INSERT INTO actions(vehicle_id,warning_id,actor_profile,task,assigned_to,status,outcome,created_at,updated_at,due_date,priority) VALUES(?,?,?,?,?,\'planned\',NULL,?,?,?,?)').run(input.vehicleId,input.warningId,input.actorProfile,input.task.trim(),input.assignedTo?.trim() || null,now,now,schedule.dueDate,schedule.priority);
      const id = Number(result.lastInsertRowid);
      this.db.prepare('INSERT INTO action_history(action_id,status,note,changed_at,due_date,priority) VALUES(?,?,?,?,?,?)').run(id,'planned',input.note?.trim() || 'Action created',now,schedule.dueDate,schedule.priority);
      this.db.exec('COMMIT');
      return id;
    } catch (error) { this.db.exec('ROLLBACK'); throw new Error('Could not save the action. No partial record was saved; please retry.', { cause: error }); }
  }
  updateVehicleProfile(id, input, now = new Date().toISOString()) {
    const row = this.db.prepare('SELECT profile FROM vehicles WHERE id=?').get(id);
    if (!row) throw new Error('Vehicle not found.');
    const vehicle = this.getDashboard(row.profile).find(v => v.id === id);
    saveVehicleProfile(this.db, vehicle, input, now);
  }
  recordInspection(id, input, now = new Date().toISOString()) {
    return saveInspection(this.db, id, input, now);
  }
  updateAction(id, input, now = new Date().toISOString()) {
    const allowed = ['planned','in progress','completed','cancelled'];
    if (!allowed.includes(input.status)) throw new Error('Invalid action status');
    if (!input.note?.trim()) throw new Error('A status note is required');
    if (input.status === 'completed' && !input.outcome?.trim()) throw new Error('A reported outcome is required to complete an action');
    const action = this.db.prepare('SELECT id,due_date dueDate,priority FROM actions WHERE id=?').get(id);
    if (!action) throw new Error('Action not found');
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE actions SET status=?, outcome=COALESCE(?,outcome), updated_at=? WHERE id=?').run(input.status,input.outcome?.trim() || null,now,id);
      this.db.prepare('INSERT INTO action_history(action_id,status,note,changed_at,due_date,priority) VALUES(?,?,?,?,?,?)').run(id,input.status,input.note.trim(),now,action.dueDate,action.priority);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw new Error('Could not update the action. Its previous state was retained; please retry.', { cause: error }); }
  }
  updateActionSchedule(id, input, now = new Date().toISOString()) {
    const schedule = validateScheduleChange(input);
    const action = this.db.prepare('SELECT status FROM actions WHERE id=?').get(id);
    if (!action) throw new Error('Action not found');
    if (['completed', 'cancelled'].includes(action.status)) throw new Error('Closed actions cannot be rescheduled.');
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE actions SET due_date=?,priority=?,updated_at=? WHERE id=?').run(schedule.dueDate,schedule.priority,now,id);
      this.db.prepare('INSERT INTO action_history(action_id,status,note,changed_at,due_date,priority) VALUES(?,?,?,?,?,?)').run(id,action.status,`Schedule changed: ${schedule.note}`,now,schedule.dueDate,schedule.priority);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw new Error('Could not save the schedule. Its previous state was retained; please retry.', { cause: error }); }
  }
}
