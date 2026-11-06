import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { validateProfileInput } from '../backend/src/vehicles/validation.ts';
import { createApiServer } from '../backend/src/http/app.ts';
import { buildEvidenceReport, evidenceCsv } from '../backend/src/evidence/report.ts';
import type { Profile, ScenarioConfig } from '../shared/types.ts';
import type { ProfileChange } from '../shared/vehicle-profile.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config: ScenarioConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));
const now = '2026-10-05T15:00:00.000Z';
function fresh(filename = ':memory:') { const store = new Store(filename, root); store.seed(); return store; }
function payload(store: Store, profile: Profile, change: ProfileChange) { const vehicle = store.getDashboard(profile)[0]; return { ...change, profile, revision: vehicle.profileRevision ?? 0, note: 'Synthetic QA entry' }; }
function save(store: Store, profile: Profile, change: ProfileChange) { store.updateVehicleProfile(store.getDashboard(profile)[0].id, payload(store, profile, change), now); }
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=';

test('profile validation rejects malformed fields, dates, numeric strings and duplicate equipment', () => {
  const base = { profile: 'owner', revision: 0, note: 'Test' };
  for (const bad of [null, [], {}, { ...base, section: 'equipment', value: ['ABS', ' abs '] }, { ...base, section: 'equipment', value: [''] }, { ...base, section: 'equipment', value: Array(41).fill('x') }, { ...base, section: 'service', value: { lastServiceAt: '2026-02-30', lastServiceKm: 10 } }, { ...base, section: 'service', value: { lastServiceAt: '2027-01-01', lastServiceKm: 10 } }, { ...base, section: 'mileage', value: { kilometres: '10', recordedAt: now } }, { ...base, section: 'mileage', value: { kilometres: 10.5, recordedAt: now } }, { ...base, section: 'mileage', value: { kilometres: -1, recordedAt: now } }, { ...base, section: 'mileage', value: { kilometres: 10, recordedAt: '2026-10-04T24:00:00Z' } }, { ...base, section: 'equipment', value: [], status: 'completed' }, { ...base, revision: -1, section: 'equipment', value: [] }, { ...base, note: '', section: 'equipment', value: [] }]) assert.throws(() => validateProfileInput(bad, now));
  assert.deepEqual(validateProfileInput({ ...base, section: 'equipment', value: [' ABS '] }, now).value, ['ABS']);
});

test('both profiles save each section, append mileage, audit provenance and retain assessments/actions', () => {
  const store = fresh();
  try {
    for (const profile of ['owner', 'fleet'] as const) {
      const before = store.getSnapshot(profile, config);
      const vehicle = before.vehicles[0]; const km = vehicle.details!.odometerHistory[0].kilometres;
      save(store, profile, { section: 'mileage', value: { kilometres: km + 100, recordedAt: '2026-10-05T10:00:00Z' } });
      save(store, profile, { section: 'service', value: { lastServiceAt: '2026-10-05', lastServiceKm: km + 100 } });
      save(store, profile, { section: 'equipment', value: ['QA camera', 'QA Bluetooth'] });
      save(store, profile, { section: 'tyres', value: [{ ...vehicle.details!.tyres[0], treadMm: 4.1 }] });
      save(store, profile, { section: 'photo', value: { dataUrl: png, description: 'Synthetic QA image' } });
      const after = store.getSnapshot(profile, config); const saved = after.vehicles[0];
      assert.equal(saved.details!.odometerHistory.length, vehicle.details!.odometerHistory.length + 1);
      assert.equal(saved.details!.odometerHistory[0].source, 'user entered');
      assert.equal(saved.details!.lastServiceKm, km + 100); assert.equal(saved.details!.tyres.length, 1); assert.equal(saved.details!.photoUrl, png);
      assert.equal(saved.profileHistory!.length, 5); assert.deepEqual(saved.profileHistory!.map(h => h.section), ['photo', 'tyres', 'equipment', 'service', 'mileage']);
      assert.equal(JSON.stringify(saved.profileHistory).includes('base64'), false);
      assert.deepEqual(after.assessments, before.assessments); assert.deepEqual(saved.actions, vehicle.actions); assert.deepEqual(saved.warnings, vehicle.warnings);
    }
  } finally { store.close(); }
});

test('mileage monotonicity, duplicate time, service consistency, profile scope and stale revision reject without mutation', () => {
  const store = fresh();
  try {
    const owner = store.getDashboard('owner')[0]; const revision = owner.profileRevision!;
    save(store, 'owner', { section: 'equipment', value: ['New equipment'] });
    const before = JSON.stringify(store.getDashboard('owner'));
    const invalid = [
      { ...payload(store, 'owner', { section: 'equipment', value: [] }), revision },
      { ...payload(store, 'owner', { section: 'equipment', value: [] }), profile: 'fleet' },
      payload(store, 'owner', { section: 'mileage', value: { kilometres: 10, recordedAt: '2026-10-05T10:00Z' } }),
      payload(store, 'owner', { section: 'mileage', value: { kilometres: 90000, recordedAt: '2026-08-01T10:00Z' } }),
      payload(store, 'owner', { section: 'mileage', value: { kilometres: 68340, recordedAt: '2026-10-04T07:45:00Z' } }),
      payload(store, 'owner', { section: 'service', value: { lastServiceAt: '2026-10-05', lastServiceKm: 70000 } }),
      payload(store, 'owner', { section: 'service', value: { lastServiceAt: '2026-08-01', lastServiceKm: 68000 } }),
    ];
    for (const input of invalid) { assert.throws(() => store.updateVehicleProfile(owner.id, input, now)); assert.equal(JSON.stringify(store.getDashboard('owner')), before); }
    assert.throws(() => store.updateVehicleProfile('UNKNOWN', invalid[0], now), /not found/);
  } finally { store.close(); }
});

test('tyre validation rejects duplicate positions, wrong DOT, dates and non-finite values', () => {
  const store = fresh();
  try {
    const t = store.getDashboard('owner')[0].details!.tyres[0];
    for (const tyres of [[t, t], [{ ...t, position: 'spare' }], [{ ...t, dotCode: '0025' }], [{ ...t, dotCode: '1827' }], [{ ...t, installedAt: '2026-10-04' }], [{ ...t, pressureBar: Infinity }], [{ ...t, treadMm: -1 }], [{ ...t, installedKm: 999999 }]]) assert.throws(() => store.updateVehicleProfile('OWNER-001', payload(store, 'owner', { section: 'tyres', value: tyres as typeof t[] }), now));
  } finally { store.close(); }
});

test('photo validation rejects URLs, SVG, fake headers and oversized images; permits explicit removal', () => {
  const base = { profile: 'owner', revision: 0, note: 'Photo QA', section: 'photo' };
  for (const dataUrl of ['https://example.com/photo.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,' + Buffer.from('not a raster image at all').toString('base64'), 'data:image/png;base64,' + 'A'.repeat(700004)]) assert.throws(() => validateProfileInput({ ...base, value: { dataUrl, description: 'QA' } }, now));
  assert.ok(validateProfileInput({ ...base, value: { dataUrl: png, description: 'QA' } }, now));
  assert.equal(validateProfileInput({ ...base, value: null }, now).value, null);
});

test('profile changes survive reopen and reseed without restoring removed equipment, tyres or photo', () => {
  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'maintend-profile-')), 'profile.sqlite');
  const store = fresh(filename);
  for (const profile of ['owner', 'fleet'] as const) {
    save(store, profile, { section: 'equipment', value: [] }); save(store, profile, { section: 'tyres', value: [] }); save(store, profile, { section: 'photo', value: null });
  }
  const before = store.getDashboard('owner'); store.close();
  const reopened = fresh(filename);
  try { assert.deepEqual(reopened.getDashboard('owner'), before); for (const profile of ['owner', 'fleet'] as const) { const v = reopened.getDashboard(profile)[0]; assert.deepEqual(v.details!.equipment, []); assert.deepEqual(v.details!.tyres, []); assert.equal(v.details!.photoUrl, null); } } finally { reopened.close(); }
});

test('profile audit-write failure atomically rolls back list replacement, service, mileage and photo', () => {
  const store = fresh();
  try {
    const before = JSON.stringify(store.getDashboard('owner'));
    store.db.exec("CREATE TRIGGER fail_profile BEFORE INSERT ON vehicle_profile_history BEGIN SELECT RAISE(ABORT,'QA failure'); END;");
    const changes: ProfileChange[] = [{ section: 'equipment', value: [] }, { section: 'tyres', value: [] }, { section: 'service', value: { lastServiceAt: '2026-10-04', lastServiceKm: 68340 } }, { section: 'mileage', value: { kilometres: 68400, recordedAt: now } }, { section: 'photo', value: null }];
    for (const change of changes) { assert.throws(() => save(store, 'owner', change), /No partial/); assert.equal(JSON.stringify(store.getDashboard('owner')), before); }
    store.db.exec('DROP TRIGGER fail_profile'); save(store, 'owner', changes[0]); assert.deepEqual(store.getDashboard('owner')[0].details!.equipment, []);
  } finally { store.close(); }
});

test('HTTP profile edits are scoped and JSON/CSV evidence includes user history without changing assessment input hash', async () => {
  const store = fresh(); const server = createApiServer(store, config, root);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const profile of ['owner', 'fleet'] as const) {
      const id = store.getDashboard(profile)[0].id; const before = buildEvidenceReport(store, profile, config);
      const body = payload(store, profile, { section: 'equipment', value: ['QA camera'] });
      const response = await fetch(`${base}/api/vehicles/${id}/profile`, { method: 'PATCH', body: JSON.stringify(body) }); assert.equal(response.status, 200);
      assert.equal((await fetch(`${base}/api/vehicles/${id}/profile`, { method: 'PATCH', body: JSON.stringify(body) })).status, 400);
      const report = buildEvidenceReport(store, profile, config); assert.equal(report.inputSha256, before.inputSha256); assert.equal(report.vehicles[0].profileHistory!.length, 1); assert.ok(evidenceCsv(report).includes('profile_history'));
      const dashboard = await (await fetch(`${base}/api/dashboard?profile=${profile}`)).json(); assert.deepEqual(dashboard.vehicles[0].details.equipment, ['QA camera']);
      assert.ok(report.vehicles.every(v => v.profile === profile));
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
