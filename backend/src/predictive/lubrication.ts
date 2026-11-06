import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { lubricationScenarios, lubricationStatusLabels, type LubricationInput, type LubricationModelConfig, type LubricationReading, type LubricationResult, type LubricationRun, type LubricationScenario } from '../../../shared/lubrication.ts';
import type { Profile, ScenarioConfig } from '../../../shared/types.ts';

const hour = 3_600_000;
export const lubricationSchema = `
CREATE TABLE IF NOT EXISTS lubrication_runs(id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), profile TEXT NOT NULL CHECK(profile IN ('fleet','owner')), input_sha256 TEXT NOT NULL, snapshot TEXT NOT NULL, UNIQUE(vehicle_id,input_sha256));
CREATE TABLE IF NOT EXISTS lubrication_notifications(run_id TEXT PRIMARY KEY REFERENCES lubrication_runs(id), read_at TEXT);
CREATE TABLE IF NOT EXISTS lubrication_selection(vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id), run_id TEXT NOT NULL REFERENCES lubrication_runs(id));
CREATE TRIGGER IF NOT EXISTS lubrication_runs_immutable_update BEFORE UPDATE ON lubrication_runs BEGIN SELECT RAISE(ABORT,'Lubrication evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lubrication_runs_immutable_delete BEFORE DELETE ON lubrication_runs BEGIN SELECT RAISE(ABORT,'Lubrication evidence is immutable'); END;
`;
export function lubricationConfig(settings: ScenarioConfig): LubricationModelConfig {
  return { version: 'lubrication-comparable-linear-v1', assessmentTime: settings.assessmentTime, maxAgeHours: settings.observationMaxAgeHours,
    referenceBar: 3.2, thresholdBar: 2, horizonHours: 72, minReadings: 4, minSpanHours: 48, maxFitRmseBar: .12, maxStepBar: .8,
    context: { rpm: 2000, rpmTolerance: 100, loadPct: 45, loadTolerance: 5, oilTempC: 90, oilTempTolerance: 3 } };
}
// Isolated illustrative sessions, not OEM pressures, an oil-life model, imported
// telemetry, oil-analysis evidence, or proof of a particular mechanical cause.
export function lubricationDataset(scenario: LubricationScenario, c: LubricationModelConfig): { readings: LubricationReading[]; heldOut: LubricationReading[] } {
  const cutoff = Date.parse(c.assessmentTime);
  const row = (hours: number, oilPressureBar: number): LubricationReading => ({ observedAt: new Date(cutoff + hours * hour).toISOString(), oilPressureBar, oilTempC: 90, rpm: 2000, loadPct: 45, warmedUp: true });
  const values = scenario === 'gradual' ? [3.6, 3.3, 3, 2.7, 2.4, 2.1] : scenario === 'abrupt' ? [3.2, 3.22, 3.18, 3.21, 3.2, .8] : scenario === 'noisy' ? [3.2, 2.45, 3.15, 2.4, 3.1, 2.3] : [3.2, 3.23, 3.18, 3.22, 3.19, 3.21];
  let readings = values.map((v, i) => row((i - 5) * 24 - 1, v));
  if (scenario === 'insufficient') readings = readings.slice(-2);
  if (scenario === 'stale') readings = readings.map(r => ({ ...r, observedAt: new Date(Date.parse(r.observedAt) - (c.maxAgeHours + 24) * hour).toISOString() }));
  if (scenario === 'context') readings.push({ ...row(-.5, 1.3), rpm: 750, loadPct: 10, oilTempC: 110 });
  const heldOut = [12, 24, 48, 72].map((h, i) => row(h, scenario === 'gradual' ? 2.1 - (h + 1) * .0125 + [.01, -.01, .02, -.02][i] : 3.2 + [.02, -.02, .01, 0][i]));
  return { readings, heldOut };
}
function exclusion(r: LubricationReading, c: LubricationModelConfig, cutoff: boolean): string | null {
  if (!Number.isFinite(Date.parse(r.observedAt)) || ![r.oilPressureBar, r.oilTempC, r.rpm, r.loadPct].every(Number.isFinite) || r.oilPressureBar < 0 || r.oilPressureBar > 12 || r.oilTempC < -40 || r.oilTempC > 180 || r.rpm < 0 || r.loadPct < 0 || r.loadPct > 100 || typeof r.warmedUp !== 'boolean') return 'Invalid reading';
  if (cutoff && Date.parse(r.observedAt) > Date.parse(c.assessmentTime)) return 'After assessment cutoff · not used';
  if (!r.warmedUp || Math.abs(r.rpm - c.context.rpm) > c.context.rpmTolerance || Math.abs(r.loadPct - c.context.loadPct) > c.context.loadTolerance || Math.abs(r.oilTempC - c.context.oilTempC) > c.context.oilTempTolerance) return 'Operating conditions outside the fictional comparison window';
  return null;
}
export function analyseLubrication(readings: LubricationReading[], heldOut: LubricationReading[], c: LubricationModelConfig): LubricationResult {
  const r: LubricationResult = { status: 'insufficient', explanation: '', included: [], excluded: [], latestAgeHours: null, slopeBarPerDay: null, fitRmseBar: null, crossingAt: null, forecast: [], evaluation: null };
  for (const reading of readings) { const reason = exclusion(reading, c, true); if (reason) r.excluded.push({ reading, reason }); else r.included.push(reading); }
  r.included.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  if (new Set(r.included.map(p => Date.parse(p.observedAt))).size !== r.included.length) { r.explanation = 'Duplicate comparable timestamps; forecast withheld.'; return r; }
  const latest = r.included.at(-1);
  if (!latest) { r.explanation = 'No comparable oil-pressure observations at or before the cutoff.'; return r; }
  r.latestAgeHours = (Date.parse(c.assessmentTime) - Date.parse(latest.observedAt)) / hour;
  if (r.latestAgeHours > c.maxAgeHours) { r.explanation = 'The latest comparable session is outside the saved data-age limit. No current anomaly or forecast inferred.'; return r; }
  if (latest.oilPressureBar <= c.thresholdBar) { r.status = 'anomaly'; r.explanation = 'The latest comparable session meets/falls below the fictional oil-pressure reference. This is a current demo anomaly, not an advance prediction; extrapolation is withheld.'; return r; }
  if (r.included.length < c.minReadings || Date.parse(latest.observedAt) - Date.parse(r.included[0].observedAt) < c.minSpanHours * hour) { r.explanation = `At least ${c.minReadings} distinct comparable sessions spanning ${c.minSpanHours} hours are required.`; return r; }
  if (r.included.slice(1).some((p, i) => Math.abs(p.oilPressureBar - r.included[i].oilPressureBar) > c.maxStepBar)) { r.status = 'unreliable'; r.explanation = 'Large pressure steps do not support the gradual-trend model. Forecast withheld.'; return r; }
  const x = r.included.map(p => (Date.parse(p.observedAt) - Date.parse(c.assessmentTime)) / hour), y = r.included.map(p => p.oilPressureBar);
  const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length;
  const slope = x.reduce((sum, v, i) => sum + (v - mx) * (y[i] - my), 0) / x.reduce((sum, v) => sum + (v - mx) ** 2, 0);
  const intercept = my - slope * mx, predict = (h: number) => intercept + slope * h;
  r.slopeBarPerDay = slope * 24;
  r.fitRmseBar = Math.sqrt(y.reduce((sum, v, i) => sum + (v - predict(x[i])) ** 2, 0) / y.length);
  if (r.fitRmseBar > c.maxFitRmseBar || [predict(0), predict(c.horizonHours)].some(v => !Number.isFinite(v) || v < 0 || v > 12)) { r.status = 'unreliable'; r.explanation = 'Fit error or extrapolated pressure is outside the model limits. Forecast withheld.'; return r; }
  r.status = slope < -.003 ? 'deteriorating' : 'stable';
  const crossingHours = slope < -.003 ? (c.thresholdBar - intercept) / slope : Infinity;
  if (crossingHours >= 0 && crossingHours <= c.horizonHours) r.crossingAt = new Date(Date.parse(c.assessmentTime) + crossingHours * hour).toISOString();
  r.explanation = r.status === 'stable' ? 'No adverse pressure trend detected in comparable synthetic sessions. This does not establish that the engine is fault-free.' : r.crossingAt ? 'A falling comparable-session trend projects a crossing of the fictional reference within 72 hours, assuming unchanged conditions and continued linear behaviour. Not a time-to-engine-failure estimate.' : 'A falling comparable-session trend is detected, but no reference crossing is projected within the bounded 72-hour horizon.';
  r.forecast = [0, 12, 24, 48, 72].map(h => ({ at: new Date(Date.parse(c.assessmentTime) + h * hour).toISOString(), valueBar: predict(h) }));
  // Future fixtures evaluate only an already-issued forecast. Never fit them or
  // use them to decide eligibility, current anomalies, status or crossing.
  const targets = heldOut.filter(p => !exclusion(p, c, false) && Date.parse(p.observedAt) > Date.parse(c.assessmentTime) && Date.parse(p.observedAt) <= Date.parse(c.assessmentTime) + c.horizonHours * hour).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  if (targets.length) {
    const crossed = targets.find(p => p.oilPressureBar <= c.thresholdBar);
    r.evaluation = { samples: targets.length, forecastMaeBar: targets.reduce((sum, p) => sum + Math.abs(p.oilPressureBar - predict((Date.parse(p.observedAt) - Date.parse(c.assessmentTime)) / hour)), 0) / targets.length,
      persistenceMaeBar: targets.reduce((sum, p) => sum + Math.abs(p.oilPressureBar - latest.oilPressureBar), 0) / targets.length,
      firstHeldOutCrossingAt: crossed?.observedAt ?? null, syntheticWarningLeadHours: crossed && r.crossingAt ? (Date.parse(crossed.observedAt) - Date.parse(c.assessmentTime)) / hour : null };
  }
  return r;
}
export function validateLubricationInput(raw: unknown): LubricationInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Provide profile, vehicleId and scenario.');
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).length !== 3 || Object.keys(input).some(k => !['profile', 'vehicleId', 'scenario'].includes(k)) || (input.profile !== 'fleet' && input.profile !== 'owner') || typeof input.vehicleId !== 'string' || !lubricationScenarios.some(s => s.id === input.scenario)) throw new Error('Use a valid profile, vehicleId and lubrication demo scenario only.');
  return input as unknown as LubricationInput;
}
export function getLubricationRuns(db: DatabaseSync, profile: Profile): LubricationRun[] {
  return db.prepare('SELECT r.snapshot,n.read_at,s.run_id selected_id,r.id FROM lubrication_runs r LEFT JOIN lubrication_notifications n ON n.run_id=r.id LEFT JOIN lubrication_selection s ON s.vehicle_id=r.vehicle_id WHERE r.profile=? ORDER BY r.rowid DESC').all(profile).map(row => ({ ...JSON.parse(String(row.snapshot)), notificationReadAt: row.read_at ?? null, selected: row.selected_id === row.id }));
}
export function saveLubricationRun(db: DatabaseSync, raw: unknown, settings: ScenarioConfig, now = new Date().toISOString()): LubricationRun {
  const input = validateLubricationInput(raw), vehicle = db.prepare('SELECT profile FROM vehicles WHERE id=?').get(input.vehicleId);
  if (!vehicle || vehicle.profile !== input.profile) throw new Error('Vehicle not found for the selected profile.');
  const configuration = lubricationConfig(settings), dataset = lubricationDataset(input.scenario, configuration);
  const inputSha256 = createHash('sha256').update(JSON.stringify({ vehicleId: input.vehicleId, configuration, scenario: input.scenario, readings: dataset.readings })).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT snapshot FROM lubrication_runs WHERE vehicle_id=? AND input_sha256=?').get(input.vehicleId, inputSha256);
    if (existing) {
      const saved = JSON.parse(String(existing.snapshot)) as LubricationRun;
      db.prepare('INSERT INTO lubrication_selection VALUES(?,?) ON CONFLICT(vehicle_id) DO UPDATE SET run_id=excluded.run_id').run(input.vehicleId, saved.id);
      db.exec('COMMIT'); return getLubricationRuns(db, input.profile).find(r => r.id === saved.id)!;
    }
    const id = randomUUID(), result = analyseLubrication(dataset.readings, dataset.heldOut, configuration), warningId = result.status === 'stable' ? null : `WARN-LUBRICATION-${id}`;
    const run: LubricationRun = { id, vehicleId: input.vehicleId, profile: input.profile, scenario: input.scenario, recordedAt: now, origin: 'synthetic lubrication demonstration', inputSha256, configuration, ...dataset, result, warningId, notificationReadAt: null, selected: true };
    db.prepare('INSERT INTO lubrication_runs VALUES(?,?,?,?,?)').run(id, input.vehicleId, input.profile, inputSha256, JSON.stringify(run));
    db.prepare('INSERT INTO lubrication_selection VALUES(?,?) ON CONFLICT(vehicle_id) DO UPDATE SET run_id=excluded.run_id').run(input.vehicleId, id);
    if (warningId) {
      db.prepare('INSERT INTO warnings VALUES(?,?,?,?,?,?,?,1)').run(warningId, input.vehicleId, 'computed_lubrication', id, `Lubrication · ${lubricationStatusLabels[result.status]}`, result.explanation, configuration.assessmentTime);
      db.prepare('INSERT INTO lubrication_notifications VALUES(?,NULL)').run(id);
    }
    db.exec('COMMIT'); return run;
  } catch (error) { db.exec('ROLLBACK'); throw new Error('Could not save lubrication evidence. No partial run or notification was saved; retry safely.', { cause: error }); }
}
export function readLubricationNotification(db: DatabaseSync, id: string, profile: unknown, now = new Date().toISOString()): void {
  if (profile !== 'fleet' && profile !== 'owner') throw new Error('Profile must be fleet or owner.');
  if (!db.prepare('SELECT id FROM lubrication_runs WHERE id=? AND profile=?').get(id, profile) || !db.prepare('SELECT run_id FROM lubrication_notifications WHERE run_id=?').get(id)) throw new Error('Notification not found for this profile.');
  db.prepare('UPDATE lubrication_notifications SET read_at=COALESCE(read_at,?) WHERE run_id=?').run(now, id);
}
