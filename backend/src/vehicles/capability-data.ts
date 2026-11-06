import {randomUUID,createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {ForecastInput} from '../../../shared/forecast.ts';
import {forecastFixture} from '../../../shared/forecast-fixtures.ts';
import {functionApplicability,type FunctionSourceSettings,type ObservationEntry} from '../../../shared/capabilities.ts';
import {serviceFunctions,type ServiceFunction} from '../../../shared/service.ts';
import {isoTimestamp} from '../imports/normalization.ts';

export const capabilitySchema=`
CREATE TABLE IF NOT EXISTS capability_bindings(vehicle_id TEXT NOT NULL REFERENCES vehicles(id),function_id TEXT NOT NULL,configuration_hash TEXT NOT NULL,evidence_reference TEXT NOT NULL,checked_at TEXT NOT NULL,PRIMARY KEY(vehicle_id,function_id));
CREATE TABLE IF NOT EXISTS capability_source_settings(vehicle_id TEXT NOT NULL REFERENCES vehicles(id),function_id TEXT NOT NULL,settings_json TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(vehicle_id,function_id));
CREATE TABLE IF NOT EXISTS capability_source_history(id INTEGER PRIMARY KEY AUTOINCREMENT,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),function_id TEXT NOT NULL,settings_json TEXT NOT NULL,changed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS capability_observations(id INTEGER PRIMARY KEY AUTOINCREMENT,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),function_id TEXT NOT NULL,record_id TEXT NOT NULL,observed_at TEXT NOT NULL,received_at TEXT NOT NULL,origin TEXT NOT NULL,raw_json TEXT NOT NULL,point_json TEXT NOT NULL,event_json TEXT,fingerprint TEXT NOT NULL,UNIQUE(vehicle_id,function_id,record_id));
CREATE TABLE IF NOT EXISTS capability_card_history(id INTEGER PRIMARY KEY AUTOINCREMENT,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),signature TEXT NOT NULL,card_json TEXT NOT NULL,checked_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS capability_disclosures(id INTEGER PRIMARY KEY AUTOINCREMENT,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),stage TEXT NOT NULL,disclosed_at TEXT NOT NULL,card_json TEXT NOT NULL,changes_json TEXT NOT NULL);`;
export function vehicleConfiguration(db:DatabaseSync,id:string){
  const v=db.prepare('SELECT v.id,v.registration,v.make_model,d.model_year,d.fuel_type FROM vehicles v LEFT JOIN vehicle_details d ON d.vehicle_id=v.id WHERE v.id=?').get(id) as any;
  if(!v)throw new Error('Vehicle not found.');
  const config={makeModel:v.make_model,modelYear:v.model_year??undefined,fuelType:v.fuel_type??'Unknown'};
  return {vehicleId:id,registration:v.registration,configuration:{...config,fingerprint:createHash('sha256').update(JSON.stringify(config)).digest('hex')}};
}
export function assertApplicable(db:DatabaseSync,id:string,fn:ServiceFunction){
  const c=vehicleConfiguration(db,id),a=functionApplicability(c.configuration.fuelType,fn);
  if(a.status!=='applicable')throw new Error(`${fn}: ${a.status}. ${a.reason}`);
  return c;
}
export function sourceSettings(db:DatabaseSync,id:string,fn:ServiceFunction):FunctionSourceSettings{
  const row=db.prepare('SELECT settings_json FROM capability_source_settings WHERE vehicle_id=? AND function_id=?').get(id,fn) as {settings_json:string}|undefined;
  return row?JSON.parse(row.settings_json):{functionId:fn,mode:'demo',feed:'available',source:'Stored constructed demonstration',note:'No real OBD/OEM connection is configured.'};
}
export function gateFunction(db:DatabaseSync,id:string,fn:ServiceFunction){
  const configuration=assertApplicable(db,id,fn);const settings=sourceSettings(db,id,fn);
  const binding=db.prepare('SELECT configuration_hash FROM capability_bindings WHERE vehicle_id=? AND function_id=?').get(id,fn) as {configuration_hash:string}|undefined;
  if(binding&&binding.configuration_hash!==configuration.configuration.fingerprint)throw new Error('Vehicle configuration changed. Source support must be reviewed before evaluation.');
  if(settings.mode!=='demo')throw new Error('Function access is not verified for the selected source. Review vehicle capabilities.');
  if(settings.feed!=='available')throw new Error('Source data are unavailable. Restore the feed or permissions before evaluating.');
}
export function functionInputs(db:DatabaseSync,id:string,fn:ServiceFunction,assessmentTime:string):{id:string;label:string;input:ForecastInput}[]{
  const row=db.prepare('SELECT history_json FROM annual_histories WHERE vehicle_id=? ORDER BY created_at DESC LIMIT 1').get(id) as {history_json:string}|undefined;
  const series=row?(JSON.parse(row.history_json).series as {id:string;label:string;input:ForecastInput}[]).filter(s=>s.input.functionId===fn):[];
  const settings=sourceSettings(db,id,fn),origin=settings.mode==='demo'?'constructed fixture':'unverified user entry';
  const entries=db.prepare('SELECT * FROM capability_observations WHERE vehicle_id=? AND function_id=? AND origin=? ORDER BY observed_at,id').all(id,fn,origin) as any[];
  const bases=settings.mode==='demo'?structuredClone(series):[];
  if(!bases.length&&settings.mode==='demo'){
    const saved=db.prepare('SELECT input_json FROM selected_forecasts WHERE vehicle_id=? ORDER BY id DESC').all(id) as {input_json:string}[];
    const seen=new Set<string>();for(const row of saved){const input=JSON.parse(row.input_json) as ForecastInput;if(input.functionId!==fn||input.dataOrigin!=='constructed fixture')continue;const wheel=fn==='tyres'?input.points?.[0]?.wheelPosition??'unknown':'';if(seen.has(wheel))continue;seen.add(wheel);bases.push({id:fn==='tyres'?`tyres-${wheel}`:fn,label:wheel||fn,input});}
  }
  if(!bases.length){const input=forecastFixture(fn,assessmentTime,'missing');input.points=[];input.events=[];delete input.charging;delete input.providerEstimate;input.source=settings.source;input.dataOrigin=origin;
    if(fn==='tyres')for(const [k,wheel] of ['front left','front right','rear left','rear right'].entries()){const next=structuredClone(input);next.segment=`manual-${wheel}`;bases.push({id:`tyres-${k}`,label:wheel,input:next});}
    else bases.push({id:fn,label:fn,input});
  }
  for(const s of bases){
    const wheel=fn==='tyres'?(s.input.points[0]?.wheelPosition??s.label.replace('Tyre pressure · ','')):undefined;
    const matching=entries.filter(r=>fn!=='tyres'||JSON.parse(r.point_json).wheelPosition===wheel);
    for(const entry of matching){const p=JSON.parse(entry.point_json);if(p.segment==='continue')p.segment=s.input.segment||`manual-${fn}`;s.input.points.push(p);if(entry.event_json)(s.input.events??=[]).push(JSON.parse(entry.event_json));}
    s.input.points.sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
    if(s.input.points.length)s.input.segment=s.input.points.at(-1)!.segment;
    s.input.source=settings.source;s.input.dataOrigin=origin;
    if(fn==='battery'&&s.input.points.length){const last=s.input.points.at(-1)!;s.input.batteryId=last.batteryId;s.input.chemistry=last.chemistry;}
  }
  return bases;
}
export function seedCapabilityBindings(db:DatabaseSync,assessmentTime:string){
  const vehicles=db.prepare('SELECT id FROM vehicles').all() as {id:string}[];
  db.exec('BEGIN IMMEDIATE');try{
  for(const v of vehicles){const c=vehicleConfiguration(db,v.id);for(const fn of serviceFunctions){
    if(functionApplicability(c.configuration.fuelType,fn).status!=='applicable')continue;
    if(sourceSettings(db,v.id,fn).mode!=='demo')continue;
    const inputs=functionInputs(db,v.id,fn,assessmentTime);if(!inputs.some(s=>s.input.points.length||s.input.charging||s.input.providerEstimate))continue;
    db.prepare('INSERT OR IGNORE INTO capability_bindings VALUES(?,?,?,?,?)').run(v.id,fn,c.configuration.fingerprint,inputs[0].input.evidenceReference,new Date().toISOString());
  }}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
}
export function saveSourceSettings(db:DatabaseSync,id:string,raw:unknown,fail=false){
  const s=raw as FunctionSourceSettings;
  if(!s||!serviceFunctions.includes(s.functionId)||!['demo','unverified','unsupported'].includes(s.mode)||!['available','paused','permission missing'].includes(s.feed)||typeof s.source!=='string'||!s.source.trim()||s.source.length>300||typeof s.note!=='string'||!s.note.trim()||s.note.length>2000)throw new Error('Select a source, feed state and reason for this function.');
  const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{
    db.prepare('INSERT INTO capability_source_settings VALUES(?,?,?,?) ON CONFLICT(vehicle_id,function_id) DO UPDATE SET settings_json=excluded.settings_json,updated_at=excluded.updated_at').run(id,s.functionId,JSON.stringify(s),now);
    db.prepare('INSERT INTO capability_source_history(vehicle_id,function_id,settings_json,changed_at) VALUES(?,?,?,?)').run(id,s.functionId,JSON.stringify(s),now);
    if(fail)throw new Error('Simulated storage failure; previous source settings retained.');db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export function addFunctionObservation(db:DatabaseSync,id:string,raw:unknown,assessmentTime:string,fail=false){
  const e=raw as ObservationEntry;if(!e||!serviceFunctions.includes(e.functionId)||e.functionId==='charging')throw new Error('Select a supported maintenance observation. Charging requires an attributed session estimate.');
  assertApplicable(db,id,e.functionId);
  if(!['constructed fixture','unverified user entry'].includes(e.dataOrigin)||typeof e.recordId!=='string'||!e.recordId.trim()||e.recordId.length>120||typeof e.source!=='string'||!e.source.trim()||typeof e.context!=='string'||!e.context.trim())throw new Error('Source record, origin, source and comparable measurement context are required.');
  const observedAt=isoTimestamp(e.observedAt);if(!observedAt)throw new Error('Observation time must include seconds and an explicit time zone.');
  const finite=(v:unknown,label:string)=>{if(typeof v!=='number'||!Number.isFinite(v))throw new Error(`${label} must be a finite number.`);return v;};
  const fingerprint=createHash('sha256').update(JSON.stringify(e)).digest('hex');
  const same=db.prepare('SELECT fingerprint FROM capability_observations WHERE vehicle_id=? AND function_id=? AND record_id=?').get(id,e.functionId,e.recordId) as {fingerprint:string}|undefined;
  if(same){if(same.fingerprint!==fingerprint)throw new Error('This source record ID already has different evidence. No data changed.');return {duplicate:true,recordId:e.recordId};}
  let value=finite(e.value,'Value'),unit=e.unit;
  if(e.functionId==='tyres'){if(unit==='psi')value*=0.0689475729;else if(unit==='kPa')value/=100;else if(unit!=='bar')throw new Error('Pressure units must be bar, kPa or psi.');if(value<0||value>10)throw new Error('Pressure is outside the accepted screening range.');if(!['front left','front right','rear left','rear right'].includes(e.wheelPosition!))throw new Error('Select an identified wheel.');}
  if(e.functionId==='oil'||e.functionId==='battery'){if(unit==='fraction')value*=100;else if(unit!=='%')throw new Error('The indicator must have an explicit percentage or fraction scale.');if(value<0||value>100)throw new Error('Indicator must be within 0–100%.');}
  if(e.functionId==='dpf'){if(unit==='Pa')value/=1000;else if(unit==='mbar')value/=10;else if(unit!=='kPa')throw new Error('Differential pressure units must be kPa, Pa or mbar.');if(value<0||value>100)throw new Error('Differential pressure is outside the screening range.');}
  let odometer=e.odometer===undefined?undefined:finite(e.odometer,'Odometer');if(odometer!==undefined){if(e.odometerUnit==='mi')odometer*=1.609344;else if(e.odometerUnit!=='km')throw new Error('Odometer units must be km or mi.');if(odometer<0)throw new Error('Odometer cannot be negative.');}
  if(['oil','dpf'].includes(e.functionId)&&odometer===undefined)throw new Error('A timestamped odometer is required.');
  const all=functionInputs(db,id,e.functionId,assessmentTime),matching=all.find(s=>e.functionId!=='tyres'||s.input.points[0]?.wheelPosition===e.wheelPosition||s.label===e.wheelPosition)??all[0];
  const first=matching?.input.points[0],latest=matching?.input.points.at(-1);
  const event=e.event&&e.event!=='none'?e.event:undefined;
  const events:Record<string,string[]>={tyres:['inflation','rotation','replacement'],oil:['oil service','indicator reset','unexplained jump'],dpf:['cleaning','replacement'],battery:['replacement','BMS recalibration']};
  if(event&&!events[e.functionId].includes(event))throw new Error('The event is not supported for this function.');
  const segment=event?`reported-${randomUUID()}`:'continue';
  const x=e.functionId==='tyres'?first?first.x+(Date.parse(observedAt)-Date.parse(first.observedAt))/86400000:0:e.functionId==='battery'?first?first.x+(Date.parse(observedAt)-Date.parse(first.observedAt))/(30*86400000):0:odometer!;
  const context=e.context==='same stored protocol'&&e.dataOrigin==='constructed fixture'?latest?.context??matching.input.points[0]?.context??`Constructed comparable ${e.functionId} protocol`:e.context.trim();
  const point:any={id:e.recordId,observedAt,receivedAt:e.dataOrigin==='constructed fixture'?observedAt:new Date().toISOString(),value,x,segment:segment==='continue'?(latest?.segment??`manual-${e.functionId}`):segment,context,contextEvidence:`${e.dataOrigin}: ${e.source}; simulated source receipt for fixtures, actual import time retained separately`,wheelPosition:e.wheelPosition};
  if(e.functionId==='dpf'){point.exhaustFlow=finite(e.exhaustFlow,'Exhaust flow');point.exhaustTemperature=finite(e.exhaustTemperature,'Exhaust temperature');if(e.temperatureUnit==='F')point.exhaustTemperature=(point.exhaustTemperature-32)*5/9;else if(e.temperatureUnit!=='C')throw new Error('Temperature units must be C or F.');if(point.exhaustFlow<=0)throw new Error('Exhaust flow must be positive g/s.');point.regenerationEvidence=e.context;}
  if(e.functionId==='battery'){if(!e.batteryId?.trim()||!e.chemistry?.trim()||!e.temperatureContext?.trim())throw new Error('Battery identity, chemistry and temperature context are required.');Object.assign(point,{batteryId:e.batteryId,chemistry:e.chemistry,ageDays:finite(e.ageDays,'Battery age'),chargeThroughput:finite(e.chargeThroughput,'Cumulative throughput'),temperatureContext:e.temperatureContext});if(point.ageDays<0||point.chargeThroughput<0)throw new Error('Age and throughput cannot be negative.');}
  const eventRecord=event?{type:event,observedAt:new Date(Date.parse(observedAt)-1).toISOString(),evidence:`${e.dataOrigin}: reported ${event}; not independently confirmed maintenance`}:null;
  db.exec('BEGIN IMMEDIATE');try{
    db.prepare('INSERT INTO capability_observations(vehicle_id,function_id,record_id,observed_at,received_at,origin,raw_json,point_json,event_json,fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,e.functionId,e.recordId,observedAt,new Date().toISOString(),e.dataOrigin,JSON.stringify(e),JSON.stringify(point),eventRecord?JSON.stringify(eventRecord):null,fingerprint);
    if(e.dataOrigin==='constructed fixture'){const configuration=vehicleConfiguration(db,id);db.prepare('INSERT OR IGNORE INTO capability_bindings VALUES(?,?,?,?,?)').run(id,e.functionId,configuration.configuration.fingerprint,`constructed observation ${e.recordId}`,new Date().toISOString());}
    if(fail)throw new Error('Simulated storage failure; your observation was not saved.');db.exec('COMMIT');return {duplicate:false,recordId:e.recordId};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
