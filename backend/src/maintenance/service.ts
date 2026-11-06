import type { Capability, UsePlan, PlanResult, ServiceRevision, ServiceRecords } from '../../../shared/service.ts';
import { serviceFunctions } from '../../../shared/service.ts';
import type { DatabaseSync } from 'node:sqlite';

export const serviceSchema = `CREATE TABLE IF NOT EXISTS service_revisions(
 id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
 kind TEXT NOT NULL, record_key TEXT NOT NULL, revision INTEGER NOT NULL,
 saved_at TEXT NOT NULL, input_json TEXT NOT NULL, result_json TEXT, warning_id TEXT REFERENCES warnings(id),
 UNIQUE(vehicle_id,kind,record_key,revision));`;
function text(v: unknown, label: string): asserts v is string { if (typeof v !== 'string' || !v.trim() || v.length > 2000) throw new Error(`${label} is required (maximum 2000 characters).`); }
export function instant(v: unknown, label: string): number {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v))) throw new Error(`${label} must be an explicit timestamp with time zone.`);
  const date = v.slice(0, 10); const [y,m,d] = date.split('-').map(Number);
  if (new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10) !== date) throw new Error(`${label} has an invalid calendar date.`);
  return Date.parse(v);
}
function nonnegative(v: unknown, label: string) { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`${label} must be a finite nonnegative number.`); }
function origin(v: unknown) { if (v !== 'constructed fixture' && v !== 'unverified user entry') throw new Error('Only explicitly labelled fixture or unverified manual records are accepted. No live integration is configured.'); }
export function validateCapability(c: Capability, now: string) {
  if (!c || !serviceFunctions.includes(c.functionId)) throw new Error('Unknown function.');
  if (!['supported','awaiting verification','unsupported','not applicable'].includes(c.supportStatus) || !['ready','insufficient history','stale','missing','unavailable'].includes(c.readinessStatus)) throw new Error('Invalid capability status.');
  for (const key of ['configurationVersion','source','reason','nextStep'] as const) text(c[key], key);
  origin(c.dataOrigin);
  if (instant(c.checkedAt, 'Verification time') > instant(now, 'Assessment time')) throw new Error('Verification time is after assessment.');
  if (c.supportStatus === 'supported') text(c.evidenceReference, 'Configuration-specific evidence');
  if (c.readinessStatus === 'ready' && c.supportStatus !== 'supported') throw new Error('Readiness requires configuration support.');
  if (c.supportStatus === 'supported' && c.dataOrigin !== 'constructed fixture') throw new Error('Manual statements cannot verify real configuration support. Use awaiting verification.');
}
export function compareUse(p: UsePlan, now: string, maxAgeHours: number, currentWarning = false): PlanResult {
  if (!p) throw new Error('Plan is required.');
  for (const key of ['planId','description','forecastId','source','reference'] as const) text(p[key], key);
  origin(p.dataOrigin);
  if(p.dataOrigin!=='constructed fixture')return {status:'unavailable',reason:'An unverified manual entry cannot establish an eligible maintenance window.'};
  try { new Intl.DateTimeFormat('en', { timeZone: p.timeZone }); } catch { throw new Error('Invalid display time zone.'); }
  if (!p.timeZone) throw new Error('Display time zone is required.');
  nonnegative(p.plannedDistanceKm, 'Planned distance');
  if (!Number.isInteger(p.forecastRevision) || p.forecastRevision < 1) throw new Error('Forecast revision must be a positive integer.');
  const assessed = instant(now,'Assessment time'), start=instant(p.periodStart,'Period start'), maintenance=instant(p.maintenanceAt,'Maintenance opportunity'), issued=instant(p.issuedAt,'Estimate issue time'), until=instant(p.validUntil,'Estimate validity');
  if (maintenance < start || start < assessed) throw new Error('Plan must start at or after assessment and end at or after its start.');
  for (const key of ['remainingDistanceKm','lowerDistanceKm','upperDistanceKm','manufacturerDistanceKm'] as const) if (p[key] !== undefined) nonnegative(p[key], key);
  const due = p.serviceDueAt === undefined ? undefined : instant(p.serviceDueAt,'Service reference time');
  const manufacturerDue = p.manufacturerDueAt === undefined ? undefined : instant(p.manufacturerDueAt,'Manufacturer deadline');
  const earliest = p.earliestDueAt === undefined ? undefined : instant(p.earliestDueAt,'Earliest reference');
  const latest = p.latestDueAt === undefined ? undefined : instant(p.latestDueAt,'Latest reference');
  if ((p.lowerDistanceKm === undefined) !== (p.upperDistanceKm === undefined) || (p.lowerDistanceKm !== undefined && (p.remainingDistanceKm === undefined || p.lowerDistanceKm > p.remainingDistanceKm || p.upperDistanceKm! < p.remainingDistanceKm))) throw new Error('Distance uncertainty must bracket the estimate.');
  if ((earliest === undefined) !== (latest === undefined) || (earliest !== undefined && (due === undefined || earliest > due || latest! < due))) throw new Error('Time uncertainty must bracket the estimate.');
  if (currentWarning) return {status:'current warning',reason:'Review current warnings before planning. A positive estimate cannot postpone current follow-up.'};
  if ((p.manufacturerDistanceKm !== undefined && p.plannedDistanceKm >= p.manufacturerDistanceKm) || (manufacturerDue !== undefined && maintenance >= manufacturerDue)) return {status:'manufacturer limit',reason:'The plan reaches or exceeds an applicable manufacturer constraint. This comparison cannot extend the service interval.'};
  if (p.eligible !== true || (p.remainingDistanceKm === undefined && due === undefined)) return {status:'unavailable',reason:'An eligible oil-service estimate with compatible distance or time units is required.'};
  if(p.distanceHorizonKm!==undefined&&(!Number.isFinite(p.distanceHorizonKm)||p.distanceHorizonKm<0||p.plannedDistanceKm>p.distanceHorizonKm))return {status:'unavailable',reason:'Declared use exceeds the estimate’s supported distance horizon.'};
  if (issued > assessed || assessed-issued > maxAgeHours*3600000 || until < assessed || (p.validityKind!=='freshness at comparison'&&until < maintenance) || until < issued) return {status:'unavailable',reason:'Estimate is stale, future-dated, expired, or the plan extends beyond its validity horizon.'};
  const distanceMarginKm = p.remainingDistanceKm === undefined ? undefined : p.remainingDistanceKm-p.plannedDistanceKm;
  const timeMarginMinutes = due === undefined ? undefined : (due-maintenance)/60000;
  const margins=[distanceMarginKm,timeMarginMinutes].filter((x): x is number=>x!==undefined);
  const uncertainty = (p.lowerDistanceKm !== undefined && p.lowerDistanceKm <= p.plannedDistanceKm && p.upperDistanceKm! >= p.plannedDistanceKm) || (earliest !== undefined && earliest <= maintenance && latest! >= maintenance);
  const certainlyExceeded=(due!==undefined&&(latest===undefined?due:latest)<maintenance)||(p.remainingDistanceKm!==undefined&&(p.upperDistanceKm??p.remainingDistanceKm)<p.plannedDistanceKm);
  const status = certainlyExceeded?'exceeds window':uncertainty ? 'uncertain' : margins.some(x=>x<0) ? 'exceeds window' : margins.some(x=>x===0) ? 'at reference' : 'within estimate';
  return {status,distanceMarginKm,timeMarginMinutes,reason: certainlyExceeded?'At least one applicable constraint is exceeded even at its uncertainty bound. Review the plan.':uncertainty ? 'Uncertainty includes the planning boundary. Review the plan.' : 'Both applicable constraints are checked; the earliest governs. This conditional planning estimate does not certify journey safety.'};
}
export function serviceRecords(db: DatabaseSync, vehicleId: string): ServiceRecords {
  const read = <T>(kind: string): ServiceRevision<T>[] => (db.prepare('SELECT * FROM service_revisions WHERE vehicle_id=? AND kind=? ORDER BY id DESC').all(vehicleId,kind) as any[]).map(r=>({id:r.id,vehicleId,revision:r.revision,savedAt:r.saved_at,input:JSON.parse(r.input_json),result:r.result_json ? JSON.parse(r.result_json):undefined,warningId:r.warning_id ?? undefined}));
  return {capabilities:read<Capability>('capability'), plans:read<UsePlan>('plan'),disclosures:read<import('../../../shared/service.ts').Disclosure>('disclosure')};
}
export function saveService(db: DatabaseSync, vehicleId: string, profile: unknown, kind: string, input: any, now: string, maxAgeHours: number, currentWarning: boolean, simulateFailure = false) {
  if (!db.prepare('SELECT id FROM vehicles WHERE id=? AND profile=?').get(vehicleId, String(profile))) throw new Error('Vehicle not found for selected profile.');
  if (kind !== 'capability' && kind !== 'plan' && kind !== 'disclosure') throw new Error('Unknown service record.');
  if(kind==='disclosure'){
    if(!input || !['During use','Before purchase','Before proposed payment'].includes(input.stage))throw new Error('Unknown disclosure stage.');
    input={stage:input.stage,assessedAt:now,capabilities:serviceRecords(db,vehicleId).capabilities.filter((r,k,all)=>all.findIndex(a=>a.input.functionId===r.input.functionId)===k)};
  }
  if (kind === 'capability') validateCapability(input,now);
  const result = kind === 'plan' ? compareUse(input,now,maxAgeHours,currentWarning) : undefined;
  const key = kind === 'plan' ? input.planId : kind==='disclosure' ? input.stage : input.functionId;
  db.exec('BEGIN IMMEDIATE');
  try {
    const revision = Number((db.prepare('SELECT COALESCE(MAX(revision),0)+1 AS revision FROM service_revisions WHERE vehicle_id=? AND kind=? AND record_key=?').get(vehicleId,kind,key) as any).revision);
    const warningId = kind === 'plan' ? `USE-${vehicleId}-${key}-${revision}` : null;
    if (warningId) db.prepare('INSERT INTO warnings(id,vehicle_id,source_type,source_ref,title,explanation,created_at,active) VALUES(?,?,?,?,?,?,?,0)').run(warningId,vehicleId,'use_plan',key,`Use plan: ${result!.status}`,`${input.dataOrigin}. ${result!.reason}`,now);
    db.prepare('INSERT INTO service_revisions(vehicle_id,kind,record_key,revision,saved_at,input_json,result_json,warning_id) VALUES(?,?,?,?,?,?,?,?)').run(vehicleId,kind,key,revision,new Date().toISOString(),JSON.stringify(input),result ? JSON.stringify(result):null,warningId);
    if (simulateFailure) throw new Error('Simulated storage failure. No revision was saved; your draft is retained.');
    db.exec('COMMIT');
    return serviceRecords(db,vehicleId);
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}
