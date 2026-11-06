import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { validateInspection } from '../backend/src/maintenance/inspections.ts';
import { needsInspection } from '../shared/inspection.ts';
import { buildEvidenceReport, evidenceCsv } from '../backend/src/evidence/report.ts';
import { createApiServer } from '../backend/src/http/app.ts';
import type { Profile, ScenarioConfig } from '../shared/types.ts';
import type { InspectionInput } from '../shared/inspection.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config: ScenarioConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));
const now = '2026-10-05T12:00:00.000Z';
const report = (profile: Profile = 'owner'): InspectionInput => ({ profile, revision: 0, result: 'confirmed', inspectedAt: '2026-10-04T10:00:00Z', reportedBy: ' Fictional technician ', notes: ' Synthetic inspection only ' });
function fresh(filename = ':memory:') { const store = new Store(filename, root); store.seed(); store.getSnapshot('fleet', config); return store; }
function create(store: Store, profile: Profile) {
  const vehicle = store.getSnapshot(profile, config).vehicles.find(v => v.warnings.length)!;
  const id = store.createAction({ vehicleId: vehicle.id, warningId: vehicle.warnings[0].id, actorProfile: profile, task: 'Synthetic inspection', assignedTo: profile === 'fleet' ? 'Demo workshop' : undefined });
  return { id, vehicleId: vehicle.id, warningId: vehicle.warnings[0].id };
}
function saved(store: Store, profile: Profile, id: number) { return store.getDashboard(profile).flatMap(v => v.actions).find(a => a.id === id)!; }

test('inspection validation enforces exact types, enum, required notes/reporter and real non-future UTC time', () => {
  const valid = validateInspection(report(), now);
  assert.equal(valid.reportedBy, 'Fictional technician'); assert.equal(valid.notes, 'Synthetic inspection only'); assert.equal(valid.inspectedAt, '2026-10-04T10:00:00.000Z');
  for (const bad of [null, [], {}, { ...report(), extra: true }, { ...report(), profile: 'admin' }, { ...report(), revision: '0' }, { ...report(), revision: -1 }, { ...report(), revision: .5 }, { ...report(), result: 'resolved' }, { ...report(), notes: 42 }, { ...report(), notes: ' ' }, { ...report(), notes: 'x'.repeat(2001) }, { ...report(), reportedBy: ' ' }, { ...report(), reportedBy: 'x'.repeat(101) }]) assert.throws(() => validateInspection(bad, now));
  for (const date of ['2026-02-30T10:00:00Z', '2026-10-04T24:00:00Z', '2026-10-04T10:00', '2026-10-04T10:00:00+03:00', '2026-10-05T12:00:01Z', '1800-01-01T00:00:00Z']) assert.throws(() => validateInspection({ ...report(), inspectedAt: date }, now));
  assert.doesNotThrow(() => validateInspection({ ...report(), inspectedAt: now }, now));
});

test('both profiles append all inspection verdicts without changing task, warning, assessment or input hash', () => {
  const store = fresh();
  try {
    for (const profile of ['fleet', 'owner'] as const) {
      const { id } = create(store, profile), original = saved(store, profile, id);
      const before = buildEvidenceReport(store, profile, config);
      let revision = 0;
      for (const result of ['confirmed', 'not confirmed', 'further investigation'] as const) revision = store.recordInspection(id, { ...report(profile), revision, result }, now);
      const action = saved(store, profile, id);
      assert.deepEqual(action.inspections!.map(i => i.result), ['further investigation', 'not confirmed', 'confirmed']);
      assert.equal(action.inspections![0].source, 'user reported'); assert.equal(action.inspections![0].actorProfile, profile);
      assert.deepEqual({ ...action, inspections: [] }, original);
      const after = buildEvidenceReport(store, profile, config);
      assert.deepEqual(after.assessments, before.assessments); assert.equal(after.inputSha256, before.inputSha256);
      assert.deepEqual(after.vehicles.flatMap(v => v.warnings), before.vehicles.flatMap(v => v.warnings));
      const csv = evidenceCsv(after); assert.ok(csv.includes('"inspection"')); assert.ok(csv.includes('further investigation')); assert.ok(csv.includes('warningId'));
      assert.ok(needsInspection(action));
    }
  } finally { store.close(); }
});

test('profile mismatch, missing action and stale revisions cannot alter prior inspection evidence', () => {
  const store = fresh();
  try {
    const { id } = create(store, 'owner');
    store.recordInspection(id, report(), now);
    const before = JSON.stringify(store.getDashboard('owner'));
    assert.throws(() => store.recordInspection(id, report(), now), /Another inspection/);
    assert.throws(() => store.recordInspection(id, report('fleet'), now), /profile/);
    assert.throws(() => store.recordInspection(99999, report(), now), /not found/);
    assert.equal(JSON.stringify(store.getDashboard('owner')), before);
  } finally { store.close(); }
});

test('completed tasks can receive results, cancelled tasks retain evidence but reject new reports; legacy text is not a verdict', () => {
  const store = fresh();
  try {
    const { id } = create(store, 'owner');
    store.updateAction(id, { status: 'completed', note: 'Fictional completion', outcome: 'Confirmed in old free text' });
    assert.deepEqual(saved(store, 'owner', id).inspections, []); assert.ok(needsInspection(saved(store, 'owner', id)));
    const revision = store.recordInspection(id, { ...report(), result: 'not confirmed' }, now);
    assert.equal(saved(store, 'owner', id).status, 'completed'); assert.equal(needsInspection(saved(store, 'owner', id)), false);
    store.updateAction(id, { status: 'cancelled', note: 'Fictional cancellation' });
    assert.throws(() => store.recordInspection(id, { ...report(), revision }, now), /Cancelled/);
    assert.equal(saved(store, 'owner', id).inspections!.length, 1); assert.equal(needsInspection(saved(store, 'owner', id)), false);
  } finally { store.close(); }
});

test('inspection insert failure retains all state and supports retry without duplicate evidence', () => {
  const store = fresh();
  try {
    const { id } = create(store, 'owner'); const before = JSON.stringify(store.getDashboard('owner'));
    store.db.exec("CREATE TRIGGER fail_inspection BEFORE INSERT ON action_inspections BEGIN SELECT RAISE(ABORT,'Injected failure'); END;");
    assert.throws(() => store.recordInspection(id, report(), now), /No partial/); assert.equal(JSON.stringify(store.getDashboard('owner')), before);
    store.db.exec('DROP TRIGGER fail_inspection'); store.recordInspection(id, report(), now);
    assert.equal(saved(store, 'owner', id).inspections!.length, 1);
  } finally { store.close(); }
});

test('inspection history survives reopen/reseed, preserves older records and uses save order for backdated correction', () => {
  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'maintend-inspections-')), 'test.sqlite');
  const store = fresh(filename); const { id } = create(store, 'owner'); const revision = store.recordInspection(id, report(), now);
  store.recordInspection(id, { ...report(), revision, result: 'further investigation', inspectedAt: '2026-10-03T10:00:00Z', notes: 'Backdated correction to fictional report' }, now); store.close();
  const reopened = new Store(filename, root);
  try { reopened.seed(); const records = saved(reopened, 'owner', id).inspections!; assert.equal(records.length, 2); assert.equal(records[0].result, 'further investigation'); assert.equal(records[1].result, 'confirmed'); assert.ok(records[0].inspectedAt < records[1].inspectedAt); } finally { reopened.close(); }
});

test('real HTTP inspection POSTs scope both profiles and expose append-only evidence with failure responses', async () => {
  const store = fresh(), server = createApiServer(store, config, root);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (id: number, body: unknown) => fetch(`${base}/api/actions/${id}/inspections`, { method: 'POST', body: JSON.stringify(body) });
  try {
    for (const profile of ['owner', 'fleet'] as const) {
      const { id } = create(store, profile);
      assert.equal((await post(id, report(profile))).status, 201);
      assert.equal((await post(id, report(profile))).status, 400);
      assert.equal((await post(id, { ...report(profile), result: 'resolved' })).status, 400);
      assert.equal((await post(id, report(profile === 'owner' ? 'fleet' : 'owner'))).status, 400);
      assert.equal((await fetch(`${base}/api/actions/${id}/inspections`, { method: 'PATCH', body: '{}' })).status, 404);
      const evidence = await (await fetch(`${base}/api/evidence?profile=${profile}`)).json();
      assert.equal(evidence.vehicles.flatMap((v: { actions: { id: number; inspections: unknown[] }[] }) => v.actions).find((a: { id: number }) => a.id === id).inspections.length, 1);
      assert.ok(evidence.vehicles.every((v: { profile: string }) => v.profile === profile));
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
