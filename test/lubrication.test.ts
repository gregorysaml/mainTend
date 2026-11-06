import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { analyseLubrication, lubricationConfig, lubricationDataset, validateLubricationInput } from '../backend/src/predictive/lubrication.ts';
import { lubricationMatchesSettings, lubricationScenarios } from '../shared/lubrication.ts';
import { buildEvidenceReport, evidenceCsv } from '../backend/src/evidence/report.ts';
import { createApiServer } from '../backend/src/http/app.ts';
import { isLubricationDemoVehicle, lubricationDemoVehicles, lubricationAdvice, maintenanceHref, readMaintenanceRequest, resolveMaintenanceRequest } from '../frontend/src/features/predictive/presentation.ts';
import { vehicleSignals } from '../frontend/src/utils/vehicle-signals.ts';
import type { Profile, ScenarioConfig } from '../shared/types.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), settings: ScenarioConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));
const c = lubricationConfig(settings), now = '2026-10-07T10:00:00.000Z';
const input = (profile: Profile = 'fleet', scenario = 'gradual') => ({ profile, vehicleId: profile === 'fleet' ? 'FLEET-003' : 'OWNER-001', scenario });
function fresh(filename = ':memory:') { const s = new Store(filename, root); s.seed(); s.getSnapshot('fleet', settings); return s; }
function analyse(scenario: Parameters<typeof lubricationDataset>[0]) { const d = lubricationDataset(scenario, c); return analyseLubrication(d.readings, d.heldOut, c); }

test('lubrication decline is calculated from comparable sessions with a bounded crossing and held-out baseline', () => {
  const r = analyse('gradual'); assert.equal(r.status, 'deteriorating'); assert.ok(Math.abs(r.slopeBarPerDay! + .3) < 1e-9);
  assert.ok(Math.abs(Date.parse(r.crossingAt!) - Date.parse(c.assessmentTime) - 7 * 3_600_000) <= 1);
  assert.equal(r.forecast.length, 5); assert.ok(r.fitRmseBar! < 1e-9); assert.ok(Math.abs(r.evaluation!.forecastMaeBar - .015) < 1e-9);
  assert.ok(r.evaluation!.forecastMaeBar < r.evaluation!.persistenceMaeBar); assert.equal(r.evaluation!.syntheticWarningLeadHours, 12);
  assert.equal(Object.hasOwn(r, 'failureProbability'), false); assert.equal(Object.hasOwn(r, 'remainingUsefulLife'), false);
});
test('all seven lubrication cases have explicit status; abrupt low pressure is not an advance prediction', () => {
  const expected = { gradual: 'deteriorating', stable: 'stable', abrupt: 'anomaly', insufficient: 'insufficient', stale: 'insufficient', noisy: 'unreliable', context: 'stable' };
  for (const s of lubricationScenarios) { const r = analyse(s.id); assert.equal(r.status, expected[s.id]); if (['abrupt', 'insufficient', 'stale', 'noisy'].includes(s.id)) { assert.deepEqual(r.forecast, []); assert.equal(r.crossingAt, null); assert.equal(r.evaluation, null); } }
  assert.match(analyse('abrupt').explanation, /not an advance prediction/); assert.equal(analyse('stable').crossingAt, null);
});
test('future lubrication targets cannot leak into eligibility, status, trend or crossing', () => {
  const d = lubricationDataset('gradual', c), a = analyseLubrication(d.readings, d.heldOut, c), b = analyseLubrication(d.readings, d.heldOut.map(p => ({ ...p, oilPressureBar: .1 })), c);
  assert.deepEqual({ ...a, evaluation: null }, { ...b, evaluation: null }); assert.notDeepEqual(a.evaluation, b.evaluation);
  const future = analyseLubrication([...d.readings, { ...d.heldOut[0], oilPressureBar: .1 }], [], c);
  assert.equal(future.status, a.status); assert.deepEqual(future.forecast, a.forecast); assert.match(future.excluded[0].reason, /After assessment cutoff/);
});
test('RPM, load, oil temperature and warmed-up context are gating evidence, not mechanical diagnoses', () => {
  const r = analyse('context'); assert.equal(r.status, 'stable'); assert.equal(r.included.length, 6); assert.equal(r.excluded.length, 1); assert.match(r.excluded[0].reason, /Operating conditions/);
  const d = lubricationDataset('gradual', c);
  for (const patch of [{ rpm: 750 }, { loadPct: 80 }, { oilTempC: 110 }, { warmedUp: false }, { oilPressureBar: -1 }, { oilPressureBar: NaN }]) assert.equal(analyseLubrication(d.readings.map(p => ({ ...p, ...patch })), [], c).included.length, 0);
  assert.equal(analyseLubrication([...d.readings, d.readings[0]], [], c).status, 'insufficient');
});
test('lubrication age and reference boundaries are inclusive; old anomalies cannot be current', () => {
  const d = lubricationDataset('gradual', c), abrupt = lubricationDataset('abrupt', c);
  assert.equal(analyseLubrication(d.readings, [], { ...c, maxAgeHours: 1 }).status, 'deteriorating'); assert.equal(analyseLubrication(d.readings, [], { ...c, maxAgeHours: .99 }).status, 'insufficient');
  assert.equal(analyseLubrication(abrupt.readings, [], { ...c, maxAgeHours: .99 }).status, 'insufficient');
  assert.equal(analyseLubrication(d.readings.map((p, i) => ({ ...p, oilPressureBar: i === 5 ? 2 : p.oilPressureBar })), [], c).status, 'anomaly');
});
test('short history, noisy fit, large steps and physically invalid extrapolation withhold pressure forecasts', () => {
  const d = lubricationDataset('gradual', c);
  assert.equal(analyseLubrication(d.readings.slice(-3), [], c).status, 'insufficient'); assert.equal(analyse('noisy').status, 'unreliable');
  assert.equal(analyseLubrication(d.readings.map((p, i) => ({ ...p, oilPressureBar: [5, 3, 5, 3, 5, 3][i] })), [], c).status, 'unreliable');
  assert.equal(analyseLubrication(d.readings.map((p, i) => ({ ...p, oilPressureBar: 5.85 - i * .75 })), [], c).status, 'unreliable');
  const slow = analyseLubrication(d.readings.map((p, i) => ({ ...p, oilPressureBar: 4 - i * .1 })), [], c); assert.equal(slow.status, 'deteriorating'); assert.equal(slow.crossingAt, null);
});
test('lubrication input validation accepts only the exact profile, vehicle and scenario contract', () => {
  assert.deepEqual(validateLubricationInput(input()), input());
  for (const raw of [null, [], {}, { ...input(), scenario: 'failure' }, { ...input(), profile: 'admin' }, { ...input(), vehicleId: 3 }, { ...input(), readings: [] }]) assert.throws(() => validateLubricationInput(raw));
});
test('both lubrication profiles persist isolated runs while retaining cooling and rule measurements unchanged', () => {
  const store = fresh(); try {
    const cooling = store.runCooling({ profile: 'fleet', vehicleId: 'FLEET-002', scenario: 'gradual' }, settings, now);
    for (const profile of ['fleet', 'owner'] as const) {
      const before = store.getSnapshot(profile, settings), run = store.runLubrication(input(profile), settings, now), again = store.runLubrication(input(profile), settings, now), after = store.getSnapshot(profile, settings);
      assert.equal(run.id, again.id); assert.equal(store.getLubricationRuns(profile).length, 1); assert.deepEqual(after.assessments, before.assessments); assert.deepEqual(after.vehicles.map(v => v.observations), before.vehicles.map(v => v.observations)); assert.deepEqual(after.coolingRuns, before.coolingRuns);
      const w = after.vehicles.flatMap(v => v.warnings).find(w => w.id === run.warningId)!; assert.equal(w.sourceType, 'computed_lubrication'); assert.equal(w.current, true); assert.equal(w.sourceRef, run.id);
      const stable = store.runLubrication(input(profile, 'stable'), settings, now); assert.equal(stable.warningId, null); assert.equal(store.getSnapshot(profile, settings).vehicles.flatMap(v => v.warnings).find(w => w.id === run.warningId)!.current, false);
      assert.equal(store.runLubrication(input(profile), settings, now).id, run.id); assert.equal(store.getLubricationRuns(profile).filter(r => r.selected).length, 1);
    }
    assert.equal(store.getCoolingRuns('fleet')[0].id, cooling.id);
  } finally { store.close(); }
});
test('wrong-profile lubrication mutations and extra fields leave storage unchanged', () => {
  const store = fresh(); try { assert.throws(() => store.runLubrication({ ...input(), profile: 'owner' }, settings), /profile/); assert.throws(() => store.runLubrication({ ...input(), vehicleId: 'NONE' }, settings)); assert.throws(() => store.runLubrication({ ...input(), readings: [] }, settings));
    const run = store.runLubrication(input(), settings, now); assert.throws(() => store.readLubricationNotification(run.id, 'owner'), /not found/); assert.deepEqual(store.getLubricationRuns('owner'), []); assert.equal(store.getLubricationRuns('fleet')[0].notificationReadAt, null);
  } finally { store.close(); }
});
test('lubrication notifications are retained and read idempotently without altering evidence or resolving warnings', () => {
  const store = fresh(); try { const run = store.runLubrication(input(), settings, now), before = buildEvidenceReport(store, 'fleet', settings);
    store.readLubricationNotification(run.id, 'fleet', now); store.readLubricationNotification(run.id, 'fleet', '2026-10-08T10:00:00Z'); const after = buildEvidenceReport(store, 'fleet', settings), saved = store.getLubricationRuns('fleet')[0];
    assert.equal(saved.notificationReadAt, now); assert.equal(saved.inputSha256, run.inputSha256); assert.deepEqual(saved.result, run.result); assert.equal(before.inputSha256, after.inputSha256); assert.equal(after.vehicles.find(v => v.id === run.vehicleId)!.warnings.find(w => w.id === run.warningId)!.current, true); assert.ok(evidenceCsv(after).includes('"computed_lubrication"')); assert.equal(after.lubricationRuns![0].id, run.id);
  } finally { store.close(); }
});
test('lubrication setting changes archive immutable evidence and retain exact action links', () => {
  const store = fresh(); try { const run = store.runLubrication(input(), settings, now), id = store.createAction({ vehicleId: run.vehicleId, warningId: run.warningId!, actorProfile: 'fleet', assignedTo: 'QA technician', task: 'Verify synthetic pressure' }, now);
    store.updateConfig({ assessmentTime: '2026-10-05T09:00:00Z', observationMaxAgeHours: 24 }, settings); const dashboard = store.getSnapshot('fleet', settings);
    assert.equal(lubricationMatchesSettings(run, dashboard.assessmentTime, dashboard.configuration.observationMaxAgeHours), false); assert.equal(dashboard.vehicles.find(v => v.id === run.vehicleId)!.warnings.find(w => w.id === run.warningId)!.current, false); assert.equal(lubricationAdvice(run, dashboard).task, null);
    assert.notEqual(store.runLubrication(input(), settings, now).id, run.id); assert.equal(store.getDashboard('fleet').find(v => v.id === run.vehicleId)!.actions.find(a => a.id === id)!.warningId, run.warningId);
    assert.throws(() => store.db.prepare('UPDATE lubrication_runs SET snapshot=? WHERE id=?').run('{}', run.id), /immutable/); assert.throws(() => store.db.prepare('DELETE FROM lubrication_runs WHERE id=?').run(run.id), /immutable/);
  } finally { store.close(); }
});
test('lubrication storage failure rolls back snapshot, selection, warning and notification atomically', () => {
  const store = fresh(); try { const before = JSON.stringify(store.getSnapshot('fleet', settings)); store.db.exec("CREATE TRIGGER fail_lubrication BEFORE INSERT ON lubrication_notifications BEGIN SELECT RAISE(ABORT,'Injected failure'); END;");
    assert.throws(() => store.runLubrication(input(), settings, now), /No partial/); assert.equal(JSON.stringify(store.getSnapshot('fleet', settings)), before); store.db.exec('DROP TRIGGER fail_lubrication'); store.runLubrication(input(), settings, now); assert.equal(store.getLubricationRuns('fleet').length, 1);
  } finally { store.close(); }
});
test('reported inspections retain the original lubrication warning link without resolving its condition', () => {
  const store = fresh(); try { for (const profile of ['fleet', 'owner'] as const) {
    const run = store.runLubrication(input(profile), settings, now), id = store.createAction({ vehicleId: run.vehicleId, warningId: run.warningId!, actorProfile: profile, assignedTo: profile === 'fleet' ? 'QA technician' : undefined, task: 'Synthetic pressure assessment' }, now), before = buildEvidenceReport(store, profile, settings);
    store.recordInspection(id, { profile, revision: 0, result: 'further investigation', inspectedAt: now, reportedBy: 'QA reviewer', notes: 'Synthetic scenario only; pressure measurement needs independent verification.' }, now);
    const after = buildEvidenceReport(store, profile, settings), vehicle = after.vehicles.find(v => v.id === run.vehicleId)!, action = vehicle.actions.find(a => a.id === id)!;
    assert.equal(action.warningId, run.warningId); assert.equal(action.inspections![0].result, 'further investigation'); assert.equal(action.status, 'planned'); assert.equal(vehicle.warnings.find(w => w.id === run.warningId)!.current, true); assert.equal(before.inputSha256, after.inputSha256);
  } } finally { store.close(); }
});
test('lubrication snapshots, read state and linked task survive reopen without reseeding or recalculation', () => {
  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'maintend-lubrication-')), 'qa.sqlite'), store = fresh(filename), run = store.runLubrication(input(), settings, now);
  store.readLubricationNotification(run.id, 'fleet', now); store.createAction({ vehicleId: run.vehicleId, warningId: run.warningId!, actorProfile: 'fleet', assignedTo: 'QA technician', task: 'Synthetic QA assessment' }, now); const before = store.getSnapshot('fleet', settings); store.close();
  const reopened = new Store(filename, root); try { reopened.seed(); assert.deepEqual(reopened.getSnapshot('fleet', settings), before); } finally { reopened.close(); }
});
test('only Delivery Van 03 gets the fleet lubrication preview; no reassignment if it is missing', () => {
  const store = fresh(); try { const fleet = store.getSnapshot('fleet', settings), owner = store.getSnapshot('owner', settings);
    assert.deepEqual(lubricationDemoVehicles(fleet).map(v => [v.id, v.displayName, v.registration]), [['FLEET-003', 'Delivery Van 03', 'DEM-1003']]); assert.deepEqual(fleet.vehicles.map(isLubricationDemoVehicle), [false, false, true]); assert.deepEqual(lubricationDemoVehicles(owner).map(v => v.id), ['OWNER-001']); assert.deepEqual(lubricationDemoVehicles({ ...fleet, vehicles: fleet.vehicles.filter(v => v.id !== 'FLEET-003') }), []); assert.deepEqual(lubricationDemoVehicles({ ...fleet, vehicles: owner.vehicles }), []);
  } finally { store.close(); }
});
test('lubrication routing selects the correct vehicle/system/snapshot and rejects cooling or cross-profile substitution', () => {
  const store = fresh(); try { const run = store.runLubrication(input(), settings, now), cooling = store.runCooling({ profile: 'fleet', vehicleId: 'FLEET-002', scenario: 'gradual' }, settings, now), dashboard = store.getSnapshot('fleet', settings), request = readMaintenanceRequest(maintenanceHref(run.vehicleId, run.id, 'service', 'lubrication'))!;
    assert.deepEqual(request, { vehicleId: run.vehicleId, runId: run.id, view: 'service', system: 'lubrication' }); assert.equal(resolveMaintenanceRequest(dashboard, request).lubricationRun?.id, run.id); assert.equal(resolveMaintenanceRequest(dashboard, request).run, undefined);
    assert.ok(resolveMaintenanceRequest(dashboard, { ...request, runId: cooling.id }).error); assert.ok(resolveMaintenanceRequest(dashboard, { ...request, vehicleId: cooling.vehicleId }).error); assert.ok(resolveMaintenanceRequest(store.getSnapshot('owner', settings), request).error); assert.equal(resolveMaintenanceRequest(dashboard, { ...request, runId: null }).lubricationRun?.id, run.id); assert.equal(readMaintenanceRequest('#maintenance?vehicle=FLEET-003&system=unknown'), null);
  } finally { store.close(); }
});
test('lubrication vehicle indicators preserve rule data gaps and never promote archived trend or another vehicle demo', () => {
  const store = fresh(); try { const run = store.runLubrication(input(), settings, now), dashboard = store.getSnapshot('fleet', settings), vehicle = dashboard.vehicles.find(v => v.id === run.vehicleId)!, assessment = dashboard.assessments.find(a => a.vehicleId === vehicle.id)!, signals = vehicleSignals(vehicle, assessment, dashboard.configuration, [], dashboard.lubricationRuns);
    assert.ok(signals.some(s => s.id === 'data')); assert.ok(signals.some(s => s.tone === 'prediction' && s.title.includes('falling'))); assert.ok(signals.find(s => s.id.startsWith('lubrication-'))!.href!.includes('system=lubrication'));
    store.runLubrication(input('fleet', 'stable'), settings, now); const after = store.getSnapshot('fleet', settings), current = vehicleSignals(vehicle, assessment, after.configuration, [], after.lubricationRuns); assert.equal(current.filter(s => s.id.startsWith('lubrication-')).length, 1); assert.equal(current.some(s => s.tone === 'prediction'), false);
    const other = after.vehicles.find(v => v.id === 'FLEET-002')!; assert.equal(vehicleSignals(other, after.assessments.find(a => a.vehicleId === other.id)!, after.configuration, [], after.lubricationRuns).some(s => s.id.startsWith('lubrication-')), false);
  } finally { store.close(); }
});
test('lubrication recommendations distinguish trend, current anomaly, stable and withheld data in both profiles', () => {
  const store = fresh(); try { for (const profile of ['fleet', 'owner'] as const) for (const scenario of ['gradual', 'abrupt', 'stable', 'insufficient', 'noisy'] as const) { const run = store.runLubrication(input(profile, scenario), settings, now), dashboard = store.getSnapshot(profile, settings), advice = lubricationAdvice(run, dashboard); if (scenario === 'stable') assert.equal(advice.task, null); else if (scenario === 'gradual') assert.match(advice.task!, /trend/); else if (scenario === 'abrupt') assert.match(advice.text, /not an advance prediction/); else assert.match(advice.task!, /measurements/); } assert.equal(lubricationAdvice(undefined, store.getSnapshot('fleet', settings)).task, null);
  } finally { store.close(); }
});
test('HTTP lubrication workflow supports both profiles, deduplication, scoped read and evidence exports', async () => {
  const store = fresh(), server = createApiServer(store, settings, root); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`, post = (route: string, body: unknown) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try { for (const profile of ['fleet', 'owner'] as const) { const response = await post('/api/lubrication/runs', input(profile)); assert.equal(response.status, 201); const run = await response.json(); assert.equal((await (await post('/api/lubrication/runs', input(profile))).json()).id, run.id); assert.equal((await post(`/api/lubrication/runs/${run.id}/read`, { profile: profile === 'fleet' ? 'owner' : 'fleet' })).status, 400); assert.equal((await post(`/api/lubrication/runs/${run.id}/read`, { profile })).status, 200); assert.equal((await post(`/api/lubrication/runs/${run.id}/read`, { profile, extra: true })).status, 400); const report = await (await fetch(`${base}/api/evidence?profile=${profile}`)).json(); assert.equal(report.lubricationRuns.length, 1); assert.equal(report.lubricationRuns[0].profile, profile); assert.ok((await (await fetch(`${base}/api/evidence?profile=${profile}&format=csv`)).text()).includes('computed_lubrication')); } assert.equal((await post('/api/lubrication/runs', { ...input(), scenario: 'unknown' })).status, 400); assert.equal((await fetch(`${base}/api/lubrication/runs`, { method: 'PATCH' })).status, 404);
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); store.close(); }
});
