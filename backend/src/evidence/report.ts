import { createHash } from 'node:crypto';
import type { Store } from '../../../lib/store.mjs';
import type { EvidenceReport, Profile, ScenarioConfig } from '../../../shared/types.ts';
import { parameterDictionary } from '../imports/normalization.ts';

export function buildEvidenceReport(store: Store, profile: Profile, defaults: ScenarioConfig, generatedAt = new Date().toISOString()): EvidenceReport {
  const snapshot = store.getSnapshot(profile, defaults);
  const simulatedForecasts = store.getForecasts(profile);
  const coolingRuns = store.getCoolingRuns(profile);
  const lubricationRuns = store.getLubricationRuns(profile);
  const capabilityCards=Object.fromEntries(snapshot.vehicles.map(v=>[v.id,store.getCapabilityCard(v.id,profile,defaults)]));
  const functionObservations=Object.fromEntries(snapshot.vehicles.map(v=>[v.id,store.getFunctionObservationEvidence(v.id,profile)]));
  const inputs = { configuration: snapshot.configuration, vehicles: snapshot.vehicles.map(v => ({ id: v.id, observations: v.observations })), simulatedForecasts, coolingInputs: coolingRuns.map(r => ({ id: r.id, inputSha256: r.inputSha256, selected: r.selected })), lubricationInputs: lubricationRuns.map(r => ({ id: r.id, inputSha256: r.inputSha256, selected: r.selected })) };
  return {
    schemaVersion: '1.0', generatedAt, profile, dataOrigin: 'synthetic demonstration',
    configuration: snapshot.configuration, configurationHistory: store.getConfigurationHistory(),
    vehicles: snapshot.vehicles, assessments: snapshot.assessments, simulatedForecasts, coolingRuns, lubricationRuns,
    serviceRecords: Object.fromEntries(snapshot.vehicles.map(v=>[v.id,store.getServiceRecords(v.id,profile)])),
    selectedForecasts: Object.fromEntries(snapshot.vehicles.map(v=>[v.id,store.getSelectedRuns(v.id,profile)])),
    annualHistories: Object.fromEntries(snapshot.vehicles.map(v=>[v.id,store.getAnnualHistory(v.id,profile)])),
    importRejections: store.getImportRejections(profile), dataDictionary: parameterDictionary,
    capabilityCards,functionObservations,capabilityHistory:Object.fromEntries(snapshot.vehicles.map(v=>[v.id,store.getCapabilityHistory(v.id,profile)])),
    inputSha256: createHash('sha256').update(JSON.stringify({...inputs,selectedInputs:snapshot.vehicles.map(v=>store.getSelectedRuns(v.id,profile).map(r=>({id:r.id,inputSha256:r.inputSha256,selected:!r.superseded}))),capabilityInputs:Object.values(capabilityCards).map(c=>({vehicleId:c.vehicleId,configuration:c.configuration,functions:c.functions.map(f=>({id:f.functionId,settings:f.settings,support:f.supportStatus}))})),functionObservations})).digest('hex'),
    limitations: [
      'This report captures stored prototype evidence, not a test pass/fail verdict.',
      'Vehicle measurements, positions, simulated forecasts and demo inspection outcomes are synthetic.',
      'Editable profile fields may contain unverified user entries. Per-section before/after change history records provenance; photo history stores hashes, not recoverable image copies.',
      'Structured inspection results are append-only, unverified user reports linked to an action and its warning, not diagnoses or independent ground truth. They do not resolve warnings or change measurements/task status. Latest means latest saved, not latest inspection date. The input hash excludes inspection reports and action records.',
      'Rule thresholds are demonstration settings, not validated vehicle-specific diagnostic limits.',
      'Assessment settings are shared across the controlled demo profiles; profile filtering is not production authentication.',
      'Warning current/active flags refer to this assessment; historical warning and action records are retained.',
      'Cooling runs are calculated linear comparable-session demonstrations using isolated synthetic fixtures, not trained or validated vehicle-failure predictors. The 105 °C reference and operating window are fictional demo settings, not safe-driving limits.',
      'Cooling held-out values are future synthetic evaluation fixtures only, never forecast inputs or already observed measurements. Reported errors/lead times apply only to these fixtures, not real predictive accuracy or avoided failures.',
      'Cooling snapshots are immutable; warning links retain the exact decision evidence. Selection and notification-read state are separate. Overall input hash excludes read state, tasks and inspections; each cooling input hash excludes held-out targets.',
      'Lubrication runs are calculated oil-pressure trends from isolated synthetic sessions at comparable RPM, load and oil temperature. The 2 bar reference and comparison window are fictional, not OEM limits or oil-life/failure-time estimates. No sensor, oil-level, viscosity or wear-particle diagnosis is inferred.',
      'Lubrication snapshots and warning/task links are immutable. Future synthetic targets evaluate an already-issued forecast only; they never enter fitting, eligibility or status. Hashes exclude held-out targets; the report input hash excludes read state, tasks and inspections.',
      'No real-world predictive accuracy, user-study results or maintenance savings are provided.',
      'Unattributed import rejections are included in fleet reports; owner reports include only rejections linked to the owner vehicle.'
    ]
  };
}

// Prevent spreadsheet formula interpretation while retaining raw values in JSON.
function csvCell(value: unknown): string {
  let text = value === undefined || value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function evidenceCsv(report: EvidenceReport): string {
  const rows: unknown[][] = [['recordType', 'vehicleId', 'recordId', 'parentId', 'timestamp', 'status', 'parameter', 'value', 'unit', 'detailsJson']];
  rows.push(['report', '', '', '', report.generatedAt, '', '', '', '', JSON.stringify({ schemaVersion: report.schemaVersion, profile: report.profile, dataOrigin: report.dataOrigin, inputSha256: report.inputSha256, limitations: report.limitations })]);
  rows.push(['configuration', '', '', '', report.configuration.assessmentTime, '', '', '', '', JSON.stringify(report.configuration)]);
  rows.push(['data_dictionary', '', '', '', '', '', '', '', '', JSON.stringify(report.dataDictionary)]);
  for (const item of report.configurationHistory) rows.push(['configuration_history', '', item.id, '', item.savedAt, '', '', '', '', JSON.stringify(item.configuration)]);
  for (const v of report.vehicles) {
    if(report.capabilityCards?.[v.id])rows.push(['capability_card',v.id,report.capabilityCards[v.id].revision,'',report.capabilityCards[v.id].checkedAt,'current','','','',JSON.stringify(report.capabilityCards[v.id])]);
    if(report.capabilityHistory?.[v.id])rows.push(['capability_history',v.id,'','','','','','','',JSON.stringify(report.capabilityHistory[v.id])]);
    for(const o of report.functionObservations?.[v.id]??[])rows.push(['function_observation',v.id,'','','','','','','',JSON.stringify(o)]);
    for(const journey of v.journeys??[])rows.push(['journey',v.id,journey.id,'',journey.endedAt,journey.dataOrigin,'','','',JSON.stringify(journey)]);
    const annual=report.annualHistories?.[v.id];
    if(annual)rows.push(['annual_history',v.id,annual.version,'',annual.createdAt,annual.dataOrigin,'','','',JSON.stringify(annual)]);
    for (const r of report.selectedForecasts?.[v.id] ?? []) rows.push(['selected_forecast',v.id,r.id,r.warningId,r.assessedAt,r.result.status,'','','',JSON.stringify(r)]);
    const service = report.serviceRecords?.[v.id];
    for (const r of service?.capabilities ?? []) rows.push(['capability_revision',v.id,r.id,'',r.savedAt,r.input.supportStatus,'','','',JSON.stringify(r)]);
    for (const r of service?.disclosures ?? []) rows.push(['capability_disclosure',v.id,r.id,'',r.savedAt,r.input.stage,'','','',JSON.stringify(r)]);
    for (const r of service?.plans ?? []) rows.push(['use_plan_revision',v.id,r.id,r.warningId,r.savedAt,r.result?.status,'','','',JSON.stringify(r)]);
    rows.push(['vehicle', v.id, v.id, '', '', '', '', '', '', JSON.stringify({ displayName: v.displayName, registration: v.registration, profile: v.profile, makeModel: v.makeModel, location: v.location, details: v.details })]);
    for (const o of v.details?.odometerHistory ?? []) rows.push(['odometer', v.id, o.id, '', o.recordedAt, '', 'odometer', o.kilometres, 'km', JSON.stringify({ source: o.source })]);
    for (const t of v.details?.tyres ?? []) rows.push(['tyre', v.id, t.position, '', t.measuredAt, '', '', '', '', JSON.stringify(t)]);
    for (const h of v.profileHistory ?? []) rows.push(['profile_history', v.id, h.id, '', h.changedAt, h.source, h.section, '', '', JSON.stringify(h)]);
    for (const o of v.observations) rows.push(['observation', v.id, o.id, '', o.observedAt, '', o.parameter, o.value, o.unit, JSON.stringify({ importedAt: o.importedAt, source: o.source })]);
    for (const w of v.warnings) rows.push(['warning', v.id, w.id, w.sourceRef, w.createdAt, w.current ? 'current' : 'historical', '', '', '', JSON.stringify(w)]);
    for (const a of v.actions) {
      rows.push(['action', v.id, a.id, a.warningId, a.createdAt, a.status, '', '', '', JSON.stringify(a)]);
      a.history.forEach((h, index) => rows.push(['action_history', v.id, index + 1, a.id, h.changedAt, h.status, '', '', '', JSON.stringify(h)]));
      for (const inspection of a.inspections ?? []) rows.push(['inspection', v.id, inspection.id, a.id, inspection.inspectedAt, inspection.result, '', '', '', JSON.stringify({ ...inspection, warningId: a.warningId })]);
    }
  }
  for (const a of report.assessments) rows.push(['assessment', a.vehicleId, '', '', report.configuration.assessmentTime, a.dataStatus, '', '', '', JSON.stringify(a)]);
  for (const f of report.simulatedForecasts) rows.push(['simulated_forecast', f.vehicleId, f.id, '', f.forecastAt, 'simulated', '', '', '', JSON.stringify(f)]);
  for (const r of report.coolingRuns ?? []) rows.push(['computed_cooling', r.vehicleId, r.id, r.warningId, r.configuration.assessmentTime, r.result.status, 'comparable_session_coolant', '', '°C', JSON.stringify(r)]);
  for (const r of report.lubricationRuns ?? []) rows.push(['computed_lubrication', r.vehicleId, r.id, r.warningId, r.configuration.assessmentTime, r.result.status, 'comparable_session_oil_pressure', '', 'bar', JSON.stringify(r)]);
  for (const r of report.importRejections) rows.push(['import_rejection', '', r.id, '', r.rejectedAt, 'rejected', '', '', '', JSON.stringify(r)]);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
