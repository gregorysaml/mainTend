import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { coolingScenarios, coolingStatusLabels, type CoolingInput, type CoolingModelConfig, type CoolingReading, type CoolingResult, type CoolingRun, type CoolingScenario } from '../../../shared/cooling.ts';
import type { Profile, ScenarioConfig } from '../../../shared/types.ts';

const hour = 3_600_000;
export const coolingSchema = `
CREATE TABLE IF NOT EXISTS cooling_runs(id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), profile TEXT NOT NULL CHECK(profile IN ('fleet','owner')), input_sha256 TEXT NOT NULL, snapshot TEXT NOT NULL, UNIQUE(vehicle_id,input_sha256));
CREATE TABLE IF NOT EXISTS cooling_notifications(run_id TEXT PRIMARY KEY REFERENCES cooling_runs(id), read_at TEXT);
CREATE TABLE IF NOT EXISTS cooling_selection(vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id), run_id TEXT NOT NULL REFERENCES cooling_runs(id));
CREATE TRIGGER IF NOT EXISTS cooling_runs_immutable_update BEFORE UPDATE ON cooling_runs BEGIN SELECT RAISE(ABORT,'Cooling evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS cooling_runs_immutable_delete BEFORE DELETE ON cooling_runs BEGIN SELECT RAISE(ABORT,'Cooling evidence is immutable'); END;
`;
export function coolingConfig(settings: ScenarioConfig): CoolingModelConfig {
  return { version: 'cooling-comparable-linear-v1', assessmentTime: settings.assessmentTime, maxAgeHours: settings.observationMaxAgeHours,
    referenceC: 96, thresholdC: 105, horizonHours: 72, minReadings: 4, minSpanHours: 48, maxFitRmseC: 1.5, maxStepC: 6,
    context: { rpm: 2000, rpmTolerance: 100, loadPct: 45, loadTolerance: 5, ambientC: 25, ambientTolerance: 2 } };
}
// Deliberately artificial, comparable-session fixtures. Not continuous driving,
// a thermal model, OEM limits, or a vehicle-specific diagnostic dataset.
export function coolingDataset(scenario: CoolingScenario, config: CoolingModelConfig): { readings: CoolingReading[]; heldOut: CoolingReading[] } {
  const cutoff = Date.parse(config.assessmentTime);
  const row = (hours: number, coolantC: number): CoolingReading => ({ observedAt: new Date(cutoff + hours * hour).toISOString(), coolantC, rpm: 2000, loadPct: 45, ambientC: 25, warmedUp: true });
  const values = scenario === 'gradual' ? [94, 96, 98, 100, 102, 104] : scenario === 'abrupt' ? [96, 96.2, 96, 96.1, 96, 112] : scenario === 'noisy' ? [96, 104, 97, 103, 96, 104] : [96, 96.5, 95.8, 96.2, 96.3, 96.1];
  let readings = values.map((value, index) => row((index - 5) * 24 - 1, value));
  if (scenario === 'insufficient') readings = readings.slice(-2);
  if (scenario === 'stale') readings = readings.map(r => ({ ...r, observedAt: new Date(Date.parse(r.observedAt) - (config.maxAgeHours + 24) * hour).toISOString() }));
  if (scenario === 'context') readings.push({ ...row(-.5, 108), rpm: 3000, loadPct: 75, ambientC: 35 });
  const heldOut = [12, 24, 48, 72].map((h, i) => row(h, scenario === 'gradual' ? 104 + (h + 1) / 12 + [0.1, -.1, .2, -.2][i] : 96 + [0.2, -.2, .1, 0][i]));
  return { readings, heldOut };
}
function exclusion(r: CoolingReading, c: CoolingModelConfig, future: boolean): string | null {
  if (!Number.isFinite(Date.parse(r.observedAt)) || ![r.coolantC, r.rpm, r.loadPct, r.ambientC].every(Number.isFinite) || r.coolantC < -40 || r.coolantC > 160 || r.rpm < 0 || r.loadPct < 0 || r.loadPct > 100) return 'Invalid reading';
  if (future && Date.parse(r.observedAt) > Date.parse(c.assessmentTime)) return 'After assessment cutoff · not used';
  if (!r.warmedUp || Math.abs(r.rpm - c.context.rpm) > c.context.rpmTolerance || Math.abs(r.loadPct - c.context.loadPct) > c.context.loadTolerance || Math.abs(r.ambientC - c.context.ambientC) > c.context.ambientTolerance) return 'Operating conditions outside the fictional comparison window';
  return null;
}
export function analyseCooling(readings: CoolingReading[], heldOut: CoolingReading[], c: CoolingModelConfig): CoolingResult {
  const result: CoolingResult = { status: 'insufficient', explanation: '', included: [], excluded: [], latestAgeHours: null, slopeCPerDay: null, fitRmseC: null, crossingAt: null, forecast: [], evaluation: null };
  for (const reading of readings) { const reason = exclusion(reading, c, true); if (reason) result.excluded.push({ reading, reason }); else result.included.push(reading); }
  result.included.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  // Ambiguous duplicate instants cannot count as independent evidence.
  if (new Set(result.included.map(r => Date.parse(r.observedAt))).size !== result.included.length) { result.explanation = 'Duplicate comparable timestamps; forecast withheld.'; return result; }
  const latest = result.included.at(-1);
  if (!latest) { result.explanation = 'No comparable observations at or before the assessment cutoff.'; return result; }
  result.latestAgeHours = (Date.parse(c.assessmentTime) - Date.parse(latest.observedAt)) / hour;
  if (result.latestAgeHours > c.maxAgeHours) { result.explanation = 'The last comparable observation is outside the saved data-age limit. No current condition or forecast inferred.'; return result; }
  if (latest.coolantC >= c.thresholdC) { result.status = 'anomaly'; result.explanation = 'The latest comparable reading meets/exceeds the fictional demo reference. This is a current anomaly, not a predicted failure; extrapolation is withheld.'; return result; }
  if (result.included.length < c.minReadings || Date.parse(latest.observedAt) - Date.parse(result.included[0].observedAt) < c.minSpanHours * hour) { result.explanation = `At least ${c.minReadings} distinct comparable readings spanning ${c.minSpanHours} hours are required.`; return result; }
  if (result.included.slice(1).some((r, i) => Math.abs(r.coolantC - result.included[i].coolantC) > c.maxStepC)) { result.status = 'unreliable'; result.explanation = 'Large step changes do not support the bounded gradual-trend model. Forecast withheld.'; return result; }
  const x = result.included.map(r => (Date.parse(r.observedAt) - Date.parse(c.assessmentTime)) / hour), y = result.included.map(r => r.coolantC);
  const meanX = x.reduce((a, b) => a + b, 0) / x.length, meanY = y.reduce((a, b) => a + b, 0) / y.length;
  const slope = x.reduce((sum, v, i) => sum + (v - meanX) * (y[i] - meanY), 0) / x.reduce((sum, v) => sum + (v - meanX) ** 2, 0);
  const intercept = meanY - slope * meanX, predict = (hours: number) => intercept + slope * hours;
  result.slopeCPerDay = slope * 24;
  result.fitRmseC = Math.sqrt(y.reduce((sum, v, i) => sum + (v - predict(x[i])) ** 2, 0) / y.length);
  if (result.fitRmseC > c.maxFitRmseC || predict(0) < -40 || predict(c.horizonHours) > 160 || predict(c.horizonHours) < -40) { result.status = 'unreliable'; result.explanation = 'Fit error or extrapolation is outside the demo model limits. Forecast withheld.'; return result; }
  result.status = slope > .01 ? 'deteriorating' : 'stable';
  const crossingHours = slope > .01 ? (c.thresholdC - intercept) / slope : Infinity;
  if (crossingHours >= 0 && crossingHours <= c.horizonHours) result.crossingAt = new Date(Date.parse(c.assessmentTime) + crossingHours * hour).toISOString();
  result.explanation = result.status === 'stable' ? 'No adverse trend detected in these comparable synthetic sessions. This does not establish that the vehicle is fault-free.' : result.crossingAt ? 'A rising comparable-session trend projects a crossing of the demo reference within 72 hours, assuming unchanged conditions and continued linear behaviour. Not a time-to-engine-failure estimate.' : 'A rising trend is detected, but no reference crossing is projected within the bounded 72-hour horizon.';
  result.forecast = [0, 12, 24, 48, 72].map(h => ({ at: new Date(Date.parse(c.assessmentTime) + h * hour).toISOString(), valueC: predict(h) }));
  // Held-out points are NEVER part of the fit, eligibility or forecast status.
  const eligible = heldOut.filter(r => !exclusion(r, c, false) && Date.parse(r.observedAt) > Date.parse(c.assessmentTime) && Date.parse(r.observedAt) <= Date.parse(c.assessmentTime) + c.horizonHours * hour).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  if (eligible.length) {
    const crossing = eligible.find(r => r.coolantC >= c.thresholdC);
    result.evaluation = { samples: eligible.length,
      forecastMaeC: eligible.reduce((sum, r) => sum + Math.abs(r.coolantC - predict((Date.parse(r.observedAt) - Date.parse(c.assessmentTime)) / hour)), 0) / eligible.length,
      persistenceMaeC: eligible.reduce((sum, r) => sum + Math.abs(r.coolantC - latest.coolantC), 0) / eligible.length,
      firstHeldOutCrossingAt: crossing?.observedAt ?? null,
      syntheticWarningLeadHours: crossing && result.crossingAt ? (Date.parse(crossing.observedAt) - Date.parse(c.assessmentTime)) / hour : null };
  }
  return result;
}
export function validateCoolingInput(raw: unknown): CoolingInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Provide profile, vehicleId and scenario.');
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).length !== 3 || Object.keys(input).some(k => !['profile', 'vehicleId', 'scenario'].includes(k)) || (input.profile !== 'fleet' && input.profile !== 'owner') || typeof input.vehicleId !== 'string' || !coolingScenarios.some(s => s.id === input.scenario)) throw new Error('Use a valid profile, vehicleId and cooling demo scenario only.');
  return input as unknown as CoolingInput;
}
export function getCoolingRuns(db: DatabaseSync, profile: Profile): CoolingRun[] {
  return db.prepare('SELECT r.snapshot,n.read_at,s.run_id selected_id,r.id FROM cooling_runs r LEFT JOIN cooling_notifications n ON n.run_id=r.id LEFT JOIN cooling_selection s ON s.vehicle_id=r.vehicle_id WHERE r.profile=? ORDER BY r.rowid DESC').all(profile).map(row => ({ ...JSON.parse(String(row.snapshot)), notificationReadAt: row.read_at ?? null, selected: row.selected_id === row.id }));
}
export function saveCoolingRun(db: DatabaseSync, raw: unknown, settings: ScenarioConfig, now = new Date().toISOString(), manageTransaction = true): CoolingRun {
  const input = validateCoolingInput(raw);
  const vehicle = db.prepare('SELECT profile FROM vehicles WHERE id=?').get(input.vehicleId);
  if (!vehicle || vehicle.profile !== input.profile) throw new Error('Vehicle not found for the selected profile.');
  const configuration = coolingConfig(settings), dataset = coolingDataset(input.scenario, configuration);
  const inputSha256 = createHash('sha256').update(JSON.stringify({ vehicleId: input.vehicleId, configuration, scenario: input.scenario, readings: dataset.readings })).digest('hex');
  if (manageTransaction) db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT snapshot FROM cooling_runs WHERE vehicle_id=? AND input_sha256=?').get(input.vehicleId, inputSha256);
    if (existing) {
      const previous = JSON.parse(String(existing.snapshot)) as CoolingRun;
      db.prepare('INSERT INTO cooling_selection VALUES(?,?) ON CONFLICT(vehicle_id) DO UPDATE SET run_id=excluded.run_id').run(input.vehicleId, previous.id);
      if (manageTransaction) db.exec('COMMIT'); return getCoolingRuns(db, input.profile).find(r => r.id === previous.id)!;
    }
    const id = randomUUID(), result = analyseCooling(dataset.readings, dataset.heldOut, configuration);
    const warningId = result.status === 'stable' ? null : `WARN-COOLING-${id}`;
    const run: CoolingRun = { id, vehicleId: input.vehicleId, profile: input.profile, scenario: input.scenario, recordedAt: now, origin: 'synthetic cooling demonstration', inputSha256, configuration, ...dataset, result, warningId, notificationReadAt: null, selected: true };
    db.prepare('INSERT INTO cooling_runs(id,vehicle_id,profile,input_sha256,snapshot) VALUES(?,?,?,?,?)').run(id, input.vehicleId, input.profile, inputSha256, JSON.stringify(run));
    db.prepare('INSERT INTO cooling_selection VALUES(?,?) ON CONFLICT(vehicle_id) DO UPDATE SET run_id=excluded.run_id').run(input.vehicleId, id);
    if (warningId) {
      db.prepare('INSERT INTO warnings VALUES(?,?,?,?,?,?,?,1)').run(warningId, input.vehicleId, 'computed_cooling', id, `Cooling · ${coolingStatusLabels[result.status]}`, result.explanation, configuration.assessmentTime);
      db.prepare('INSERT INTO cooling_notifications(run_id,read_at) VALUES(?,NULL)').run(id);
    }
    if (manageTransaction) db.exec('COMMIT'); return run;
  } catch (error) { if (manageTransaction) db.exec('ROLLBACK'); throw new Error('Could not save cooling evidence. No partial run or notification was saved; retry safely.', { cause: error }); }
}
export function readCoolingNotification(db: DatabaseSync, id: string, profile: unknown, now = new Date().toISOString()): void {
  if (profile !== 'fleet' && profile !== 'owner') throw new Error('Profile must be fleet or owner.');
  const run = db.prepare('SELECT id FROM cooling_runs WHERE id=? AND profile=?').get(id, profile);
  if (!run || !db.prepare('SELECT run_id FROM cooling_notifications WHERE run_id=?').get(id)) throw new Error('Notification not found for this profile.');
  db.prepare('UPDATE cooling_notifications SET read_at=COALESCE(read_at,?) WHERE run_id=?').run(now, id);
}
