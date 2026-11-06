import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { analyseCooling, coolingConfig, coolingDataset, validateCoolingInput } from '../backend/src/predictive/cooling.ts';
import { coolingScenarios, coolingMatchesSettings } from '../shared/cooling.ts';
import { buildEvidenceReport, evidenceCsv } from '../backend/src/evidence/report.ts';
import { createApiServer } from '../backend/src/http/app.ts';
import type { Profile, ScenarioConfig } from '../shared/types.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const settings: ScenarioConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));
const c = coolingConfig(settings), now = '2026-10-06T10:00:00.000Z';
const input = (profile: Profile = 'fleet', scenario = 'gradual') => ({ profile, vehicleId: profile === 'fleet' ? 'FLEET-001' : 'OWNER-001', scenario });
function fresh(filename = ':memory:') { const store = new Store(filename, root); store.seed(); store.getSnapshot('fleet', settings); return store; }
function analyse(id: Parameters<typeof coolingDataset>[0]) { const data = coolingDataset(id, c); return analyseCooling(data.readings, data.heldOut, c); }

test('cooling gradual trend is actually calculated with bounded crossing and held-out baseline errors', () => {
  const r = analyse('gradual');
  assert.equal(r.status, 'deteriorating'); assert.ok(Math.abs(r.slopeCPerDay! - 2) < 1e-9);
  assert.equal(Date.parse(r.crossingAt!) - Date.parse(c.assessmentTime), 11 * 3_600_000);
  assert.equal(r.forecast.length, 5); assert.equal(r.forecast[0].at, new Date(c.assessmentTime).toISOString());
  assert.equal(r.forecast.at(-1)!.at, new Date(Date.parse(c.assessmentTime) + 72 * 3_600_000).toISOString());
  assert.ok(r.fitRmseC! < 1e-9); assert.ok(Math.abs(r.evaluation!.forecastMaeC - .15) < 1e-9);
  assert.ok(r.evaluation!.forecastMaeC < r.evaluation!.persistenceMaeC); assert.equal(r.evaluation!.syntheticWarningLeadHours, 12);
});
test('each of the seven cooling cases has explicit eligibility/status and no invented failure probability', () => {
  const expected = { gradual: 'deteriorating', stable: 'stable', abrupt: 'anomaly', insufficient: 'insufficient', stale: 'insufficient', noisy: 'unreliable', context: 'stable' };
  for (const scenario of coolingScenarios) {
    const r = analyse(scenario.id); assert.equal(r.status, expected[scenario.id]); assert.ok(r.explanation.length);
    if (['abrupt', 'insufficient', 'stale', 'noisy'].includes(scenario.id)) { assert.deepEqual(r.forecast, []); assert.equal(r.crossingAt, null); assert.equal(r.evaluation, null); }
    assert.equal(Object.hasOwn(r, 'failureProbability'), false);
  }
  assert.equal(analyse('stable').crossingAt, null); assert.ok(analyse('abrupt').explanation.includes('not a predicted failure'));
});
test('held-out targets and observations after cutoff cannot leak into fit, status or crossing', () => {
  const data = coolingDataset('gradual', c), original = analyseCooling(data.readings, data.heldOut, c);
  const changed = analyseCooling(data.readings, data.heldOut.map(r => ({ ...r, coolantC: 130 })), c);
  assert.deepEqual({ ...changed, evaluation: null }, { ...original, evaluation: null }); assert.notDeepEqual(changed.evaluation, original.evaluation);
  const withFuture = analyseCooling([...data.readings, { ...data.heldOut[0], coolantC: 155 }], [], c);
  assert.deepEqual(withFuture.forecast, original.forecast); assert.equal(withFuture.excluded[0].reason, 'After assessment cutoff · not used');
});
test('operating context is excluded rather than diagnosed; duplicate and invalid input readings fail safely', () => {
  const r = analyse('context'); assert.equal(r.status, 'stable'); assert.equal(r.included.length, 6); assert.equal(r.excluded.length, 1); assert.ok(r.excluded[0].reason.includes('Operating conditions'));
  const d = coolingDataset('gradual', c);
  assert.equal(analyseCooling([...d.readings, d.readings[0]], [], c).status, 'insufficient');
  const invalid = analyseCooling(d.readings.map(p => ({ ...p, coolantC: NaN })), [], c);
  assert.equal(invalid.status, 'insufficient'); assert.equal(invalid.excluded.length, 6);
  assert.equal(analyseCooling(d.readings.map(p => ({ ...p, warmedUp: false })), [], c).included.length, 0);
});
test('data-age boundary is inclusive and old values cannot produce current anomaly or forecast', () => {
  const d = coolingDataset('gradual', c);
  assert.equal(analyseCooling(d.readings, [], { ...c, maxAgeHours: 1 }).status, 'deteriorating');
  assert.equal(analyseCooling(d.readings, [], { ...c, maxAgeHours: .99 }).status, 'insufficient');
  const abrupt = coolingDataset('abrupt', c);
  assert.equal(analyseCooling(abrupt.readings, [], { ...c, maxAgeHours: .99 }).status, 'insufficient');
});
test('noisy regression and a short history are withheld; crossings beyond horizon are not reported', () => {
  const d = coolingDataset('gradual', c);
  const noisy = d.readings.map((p, i) => ({ ...p, coolantC: [96, 100, 96, 100, 96, 100][i] }));
  const r = analyseCooling(noisy, [], c); assert.equal(r.status, 'unreliable'); assert.ok(r.fitRmseC! > 1.5); assert.equal(r.forecast.length, 0);
  assert.equal(analyseCooling(d.readings.slice(-3), [], c).status, 'insufficient');
  const slow = analyseCooling(d.readings.map((p, i) => ({ ...p, coolantC: 96 + i * .3 })), [], c);
  assert.equal(slow.status, 'deteriorating'); assert.equal(slow.crossingAt, null); assert.equal(slow.forecast.length, 5);
});
test('cooling input validation accepts only exact profile/vehicle/scenario fields', () => {
  assert.deepEqual(validateCoolingInput(input()), input());
  for (const raw of [null, [], {}, { ...input(), profile: ['fleet'] }, { ...input(), scenario: 'engine failure' }, { ...input(), extra: true }, { ...input(), vehicleId: 1 }, { profile: 'fleet', scenario: 'gradual' }]) assert.throws(() => validateCoolingInput(raw));
});
test('both profiles persist isolated calculated snapshots, deduplicate alerts and preserve existing observations/assessments', () => {
  const store = fresh();
  try {
    for (const profile of ['fleet', 'owner'] as const) {
      const before = store.getSnapshot(profile, settings);
      const run = store.runCooling(input(profile), settings, now), again = store.runCooling(input(profile), settings, now);
      assert.equal(run.id, again.id); assert.equal(store.getCoolingRuns(profile).length, 1);
      const after = store.getSnapshot(profile, settings);
      assert.deepEqual(after.assessments, before.assessments); assert.deepEqual(after.vehicles.map(v => v.observations), before.vehicles.map(v => v.observations));
      const warning = after.vehicles.flatMap(v => v.warnings).find(w => w.id === run.warningId)!;
      assert.equal(warning.sourceType, 'computed_cooling'); assert.equal(warning.sourceRef, run.id); assert.equal(warning.current, true); assert.equal(warning.simulated, false);
      const stable = store.runCooling(input(profile, 'stable'), settings, now); assert.equal(stable.warningId, null);
      assert.equal(store.getSnapshot(profile, settings).vehicles.flatMap(v => v.warnings).find(w => w.id === run.warningId)!.current, false);
      const reselected = store.runCooling(input(profile), settings, now); assert.equal(reselected.id, run.id); assert.equal(reselected.selected, true);
      assert.equal(store.getCoolingRuns(profile).length, 2); assert.equal(store.getCoolingRuns(profile).filter(r => r.selected).length, 1);
    }
  } finally { store.close(); }
});
test('wrong-profile mutations and extra inputs do not create evidence or notifications', () => {
  const store = fresh();
  try {
    assert.throws(() => store.runCooling({ ...input(), profile: 'owner' }, settings), /profile/);
    assert.throws(() => store.runCooling({ ...input(), vehicleId: 'NONE' }, settings), /not found/);
    assert.throws(() => store.runCooling({ ...input(), readings: [] }, settings));
    const run = store.runCooling(input(), settings, now);
    assert.throws(() => store.readCoolingNotification(run.id, 'owner'), /not found/);
    assert.equal(store.getCoolingRuns('fleet')[0].notificationReadAt, null); assert.deepEqual(store.getCoolingRuns('owner'), []);
  } finally { store.close(); }
});
test('read acknowledgement is idempotent, persists separately and does not mutate evidence hash or condition', () => {
  const store = fresh();
  try {
    const run = store.runCooling(input(), settings, now), before = buildEvidenceReport(store, 'fleet', settings);
    store.readCoolingNotification(run.id, 'fleet', now); store.readCoolingNotification(run.id, 'fleet', '2026-10-07T10:00:00Z');
    const saved = store.getCoolingRuns('fleet')[0], after = buildEvidenceReport(store, 'fleet', settings);
    assert.equal(saved.notificationReadAt, now); assert.equal(saved.inputSha256, run.inputSha256); assert.deepEqual(saved.result, run.result);
    assert.equal(after.inputSha256, before.inputSha256); assert.equal(after.vehicles[0].warnings.find(w => w.id === run.warningId)!.current, true);
    assert.ok(evidenceCsv(after).includes('"computed_cooling"')); assert.ok(after.limitations.some(l => l.includes('future synthetic')));
  } finally { store.close(); }
});
test('settings change archives old warning; a linked action retains its original immutable cooling evidence', () => {
  const store = fresh();
  try {
    const run = store.runCooling(input('owner'), settings, now);
    const actionId = store.createAction({ vehicleId: run.vehicleId, warningId: run.warningId!, actorProfile: 'owner', task: 'Synthetic cooling inspection' });
    const original = JSON.stringify(store.getCoolingRuns('owner')[0]);
    const config = store.updateConfig({ assessmentTime: '2026-10-05T09:00:00Z', observationMaxAgeHours: 24 }, settings);
    assert.equal(coolingMatchesSettings(run, config.assessmentTime, config.observationMaxAgeHours), false);
    assert.equal(store.getSnapshot('owner', settings).vehicles[0].warnings.find(w => w.id === run.warningId)!.current, false);
    const newRun = store.runCooling(input('owner'), settings, now); assert.notEqual(run.id, newRun.id);
    const previous = store.getCoolingRuns('owner').find(r => r.id === run.id)!;
    assert.equal(JSON.stringify({ ...previous, selected: true }), original);
    assert.equal(store.getDashboard('owner')[0].actions.find(a => a.id === actionId)!.warningId, run.warningId);
    assert.throws(() => store.db.prepare('UPDATE cooling_runs SET snapshot=? WHERE id=?').run('{}', run.id), /immutable/);
    assert.throws(() => store.db.prepare('DELETE FROM cooling_runs WHERE id=?').run(run.id), /immutable/);
  } finally { store.close(); }
});
test('injected notification storage failure rolls back run, warning and selection, then retry succeeds', () => {
  const store = fresh();
  try {
    const before = JSON.stringify(store.getSnapshot('fleet', settings));
    store.db.exec("CREATE TRIGGER fail_cooling BEFORE INSERT ON cooling_notifications BEGIN SELECT RAISE(ABORT,'Injected failure'); END;");
    assert.throws(() => store.runCooling(input(), settings, now), /No partial/);
    assert.equal(JSON.stringify(store.getSnapshot('fleet', settings)), before);
    store.db.exec('DROP TRIGGER fail_cooling'); store.runCooling(input(), settings, now); assert.equal(store.getCoolingRuns('fleet').length, 1);
  } finally { store.close(); }
});
test('cooling evidence, selection, read state and linked tasks survive database reopen and reseed', () => {
  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'maintend-cooling-')), 'qa.sqlite');
  const store = fresh(filename), run = store.runCooling(input('owner'), settings, now);
  store.readCoolingNotification(run.id, 'owner', now);
  store.createAction({ vehicleId: run.vehicleId, warningId: run.warningId!, actorProfile: 'owner', task: 'Synthetic inspection' });
  const snapshot = store.getSnapshot('owner', settings); store.close();
  const reopened = new Store(filename, root);
  try { reopened.seed(); assert.deepEqual(reopened.getSnapshot('owner', settings), snapshot); } finally { reopened.close(); }
});
test('HTTP cooling workflow supports both profiles, idempotent runs, strict routes and evidence exports', async () => {
  const store = fresh(), server = createApiServer(store, settings, root);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    for (const profile of ['fleet', 'owner'] as const) {
      const response = await post('/api/cooling/runs', input(profile)); assert.equal(response.status, 201); const run = await response.json();
      assert.equal((await (await post('/api/cooling/runs', input(profile))).json()).id, run.id);
      assert.equal((await post(`/api/cooling/runs/${run.id}/read`, { profile })).status, 200);
      assert.equal((await post(`/api/cooling/runs/${run.id}/read`, { profile, extra: 1 })).status, 400);
      const report = await (await fetch(`${base}/api/evidence?profile=${profile}`)).json(); assert.equal(report.coolingRuns.length, 1); assert.equal(report.coolingRuns[0].profile, profile);
      const csv = await (await fetch(`${base}/api/evidence?profile=${profile}&format=csv`)).text(); assert.ok(csv.includes('computed_cooling'));
    }
    assert.equal((await post('/api/cooling/runs', { ...input(), scenario: 'unknown' })).status, 400);
    assert.equal((await fetch(`${base}/api/cooling/runs`, { method: 'PATCH' })).status, 404);
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); store.close(); }
});
