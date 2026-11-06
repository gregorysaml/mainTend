import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { evaluateVehicle } from '../backend/src/core.ts';
import { validateSettings } from '../backend/src/assessment/settings.ts';
import { buildEvidenceReport, evidenceCsv } from '../backend/src/evidence/report.ts';
import { createApiServer } from '../backend/src/http/app.ts';
import { measurementAge, measurementSeries } from '../frontend/src/utils/measurements.ts';
import { utcInputTimestamp } from '../frontend/src/utils/date.ts';
import type { EvidenceReport, Observation, ScenarioConfig } from '../shared/types.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config: ScenarioConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));
function fresh() {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vehicle-evidence-')), 'test.sqlite');
  const store = new Store(dbPath, root); store.seed(); return { store, dbPath };
}
const at = (id: number, parameter: string, value: number, time: string): Observation => ({ id, parameter, value, unit: parameter === 'battery_voltage' ? 'V' : '°C', observedAt: time });
const pair = (time: string) => [at(1, 'engine_coolant_temperature', 90, time), at(2, 'battery_voltage', 12.5, time)];

test('native datetime input omitting seconds is submitted as UTC and retains fractional seconds', () => {
  for (const [input, expected] of [['2026-10-07T09:00', '2026-10-07T09:00:00.000Z'], ['2026-10-07T09:00:30', '2026-10-07T09:00:30.000Z'], ['2026-10-07T09:00:30.123', '2026-10-07T09:00:30.123Z']]) {
    assert.equal(validateSettings({ assessmentTime: utcInputTimestamp(input), observationMaxAgeHours: 48 }).assessmentTime, expected);
  }
});

test('age boundary is inclusive; old and future-only measurements withhold assessment', () => {
  const boundary = pair('2026-10-02T09:00:00.000Z');
  assert.equal(evaluateVehicle(boundary, config).dataStatus, 'Sufficient');
  assert.equal(measurementAge(boundary[0], config), 'Within age limit');
  const expired = pair('2026-10-02T08:59:59.999Z');
  assert.ok(evaluateVehicle(expired, config).gaps.every(g => g.reason === 'outdated'));
  assert.equal(measurementAge(expired[0], config), 'Outdated');
  const future = pair('2026-10-04T09:00:00.001Z');
  const result = evaluateVehicle(future, config);
  assert.equal(result.dataStatus, 'Insufficient information');
  assert.ok(result.gaps.every(g => g.reason === 'after assessment time'));
  assert.equal(result.triggers.length, 0);
});

test('historical assessment excludes future readings and resolves same-time records by ID', () => {
  const records = [...pair('2026-10-04T08:00:00Z'), at(3, 'engine_coolant_temperature', 112, '2026-10-04T10:00:00Z')];
  assert.equal(evaluateVehicle(records, config).triggers.length, 0);
  records.push(at(4, 'engine_coolant_temperature', 112, '2026-10-04T08:00:00Z'));
  assert.equal(evaluateVehicle(records.toReversed(), config).triggers[0].observation.id, 4);
  const series = measurementSeries(records.toReversed(), 'engine_coolant_temperature');
  assert.deepEqual(series.map(o => o.id), [1, 4, 3]);
  assert.equal(measurementAge(series[2], config), 'After assessment time');
  assert.equal(measurementSeries(records, 'unknown').length, 0);
});

test('settings validate calendar/timezone and finite positive age without accepting rule edits', () => {
  const valid = { assessmentTime: '2026-10-04T12:00:00+03:00', observationMaxAgeHours: 48 };
  assert.equal(validateSettings(valid).assessmentTime, config.assessmentTime);
  for (const input of [null, [], {}, { ...valid, observationMaxAgeHours: 0 }, { ...valid, observationMaxAgeHours: -1 }, { ...valid, observationMaxAgeHours: NaN }, { ...valid, observationMaxAgeHours: 8761 }, { ...valid, observationMaxAgeHours: '48' }, { ...valid, assessmentTime: '2026-02-30T09:00:00Z' }, { ...valid, assessmentTime: '2026-10-04T09:00' }, { ...valid, rules: [] }]) assert.throws(() => validateSettings(input));
});

test('saved settings, audit trail and unchanged rules survive reopening', () => {
  const { store, dbPath } = fresh();
  store.getConfig(config);
  const updated = store.updateConfig({ assessmentTime: '2026-10-07T09:00:00Z', observationMaxAgeHours: 24 }, config, '2026-10-05T10:00:00Z');
  assert.deepEqual(updated.rules, config.rules);
  assert.equal(store.getConfigurationHistory().length, 2);
  assert.throws(() => store.updateConfig({ assessmentTime: 'bad', observationMaxAgeHours: 1 }, config));
  assert.deepEqual(store.getConfig(config), updated);
  store.close();
  const reopened = new Store(dbPath, root);
  try { assert.deepEqual(reopened.getConfig(config), updated); assert.equal(reopened.getConfigurationHistory()[1].savedAt, '2026-10-05T10:00:00Z'); }
  finally { reopened.close(); }
});

test('configuration write failure rolls back settings and audit, then permits retry', () => {
  const { store } = fresh();
  try {
    store.getConfig(config);
    store.db.exec("CREATE TRIGGER fail_settings BEFORE INSERT ON configuration_history BEGIN SELECT RAISE(ABORT,'test failure'); END;");
    const change = { assessmentTime: '2026-10-07T09:00:00Z', observationMaxAgeHours: 24 };
    assert.throws(() => store.updateConfig(change, config), /Could not save/);
    assert.deepEqual(store.getConfig(config), config);
    assert.equal(store.getConfigurationHistory().length, 1);
    store.db.exec('DROP TRIGGER fail_settings');
    assert.equal(store.updateConfig(change, config).observationMaxAgeHours, 24);
  } finally { store.close(); }
});

test('reassessment marks stale/normal rule warnings historical without deleting actions', () => {
  const { store } = fresh();
  try {
    const before = store.getSnapshot('fleet', config).vehicles.find(v => v.id === 'FLEET-002')!;
    const warning = before.warnings.find(w => w.sourceType === 'rule')!;
    const id = store.createAction({ vehicleId: before.id, warningId: warning.id, actorProfile: 'fleet', task: 'Synthetic inspection', assignedTo: 'Demo technician' });
    store.updateConfig({ assessmentTime: '2026-10-07T09:00:00Z', observationMaxAgeHours: 48 }, config);
    const stale = store.getSnapshot('fleet', config);
    assert.equal(stale.vehicles.find(v => v.id === before.id)!.warnings.find(w => w.id === warning.id)!.current, false);
    assert.equal(stale.assessments.find(a => a.vehicleId === before.id)!.dataStatus, 'Insufficient information');
    store.updateConfig({ assessmentTime: config.assessmentTime, observationMaxAgeHours: 48 }, config);
    store.importObservations([{ vehicleId: before.id, parameter: 'engine_coolant_temperature', value: 90, unit: '°C', observedAt: '2026-10-04T08:30:00Z' }]);
    const normal = store.getSnapshot('fleet', config).vehicles.find(v => v.id === before.id)!;
    assert.equal(normal.warnings.find(w => w.id === warning.id)!.active, 0);
    assert.equal(normal.actions.find(a => a.id === id)!.warningId, warning.id);
    assert.equal(normal.actions.find(a => a.id === id)!.history.length, 1);
  } finally { store.close(); }
});

test('vehicle-detail migration is idempotent, persistent and preserves existing actions', () => {
  const { store, dbPath } = fresh();
  const before = store.getDashboard('owner')[0];
  assert.equal(before.details!.odometerHistory[0].kilometres, 68340);
  assert.equal(before.details!.tyres.length, 4);
  assert.ok(before.details!.equipment.includes('Rear-view camera'));
  assert.equal(before.details!.simulated, true);
  assert.ok(fs.existsSync(path.join(root, 'frontend/public', before.details!.photoUrl!.slice(1))));
  const id = store.createAction({ vehicleId: before.id, warningId: before.warnings[0].id, actorProfile: 'owner', task: 'Preserve this action' });
  store.seed(); store.seed();
  assert.equal(store.getDashboard('owner')[0].observations.length, before.observations.length);
  store.close(); const reopened = new Store(dbPath, root);
  try {
    reopened.seed(); const vehicle = reopened.getDashboard('owner')[0];
    assert.deepEqual(vehicle.details, before.details);
    assert.equal(vehicle.actions[0].id, id);
    assert.equal(vehicle.observations.length, 8);
    assert.equal(reopened.getDashboard('fleet').find(v => v.id === 'FLEET-003')!.details!.tyres.length, 0);
  } finally { reopened.close(); }
});

test('evidence report scopes records, preserves source/action links and hashes assessment inputs', () => {
  const { store } = fresh();
  try {
    store.importObservations([{ vehicleId: 'OWNER-001', parameter: 'battery_voltage', value: 12600, unit: 'mV', observedAt: '2026-10-04T08:30:00Z' }, { vehicleId: 'OWNER-001', parameter: 'bad' }, { vehicleId: 'FLEET-001', parameter: 'bad' }, { vehicleId: 'UNKNOWN', parameter: 'bad' }]);
    const v = store.getSnapshot('owner', config).vehicles[0];
    const id = store.createAction({ vehicleId: v.id, warningId: v.warnings[0].id, actorProfile: 'owner', task: 'Inspection, "demo"\nsecond line' });
    store.updateAction(id, { status: 'completed', note: 'Synthetic check', outcome: 'No confirmed fault — demo only' });
    const report = buildEvidenceReport(store, 'owner', config, '2026-10-05T10:00:00Z');
    assert.deepEqual(report.vehicles.map(v => v.id), ['OWNER-001']);
    assert.ok(report.assessments.every(a => a.vehicleId === 'OWNER-001'));
    assert.ok(report.simulatedForecasts.every(f => f.vehicleId === 'OWNER-001' && f.simulated));
    assert.equal(report.importRejections.length, 1);
    assert.equal(report.vehicles[0].observations[0].source!.value, 12600);
    assert.equal(report.vehicles[0].observations[0].value, 12.6);
    assert.equal(report.vehicles[0].actions[0].history.length, 2);
    assert.ok(report.vehicles[0].details!.photoDescription!.includes('AI-generated'));
    assert.match(report.inputSha256, /^[a-f0-9]{64}$/);
    assert.equal(buildEvidenceReport(store, 'owner', config).inputSha256, report.inputSha256);
    store.updateConfig({ assessmentTime: config.assessmentTime, observationMaxAgeHours: 24 }, config);
    assert.notEqual(buildEvidenceReport(store, 'owner', config).inputSha256, report.inputSha256);
    const fleet = buildEvidenceReport(store, 'fleet', config);
    assert.equal(fleet.vehicles.length, 3); assert.equal(fleet.importRejections.length, 2);
    assert.ok(fleet.vehicles.every(v => v.profile === 'fleet'));
  } finally { store.close(); }
});

function parseCsv(csv: string): string[][] {
  const result: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 1; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') { if (quoted && csv[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && c === ',') { row.push(field); field = ''; }
    else if (!quoted && c === '\r' && csv[i + 1] === '\n') { row.push(field); result.push(row); row = []; field = ''; i++; }
    else field += c;
  }
  return result;
}
test('CSV has complete structured records, valid escaping, UTF-8 BOM and formula protection', () => {
  const { store } = fresh();
  try {
    const report = buildEvidenceReport(store, 'owner', config);
    report.vehicles[0].id = '=DEMO()';
    report.vehicles[0].displayName = 'Demo, "vehicle"\nnew line';
    const csv = evidenceCsv(report);
    assert.equal(csv[0], '\uFEFF');
    const rows = parseCsv(csv);
    assert.ok(rows.every(r => r.length === 10));
    assert.equal(rows.find(r => r[0] === 'vehicle')![1], "'=DEMO()");
    const detail = JSON.parse(rows.find(r => r[0] === 'vehicle')![9]);
    assert.equal(detail.displayName, report.vehicles[0].displayName);
    assert.equal(detail.details.equipment.length, 8);
    assert.equal(rows.filter(r => r[0] === 'observation').length, 8);
    assert.equal(rows.filter(r => r[0] === 'tyre').length, 4);
    assert.equal(rows.filter(r => r[0] === 'odometer').length, 3);
    assert.equal(JSON.parse(rows.find(r => r[0] === 'configuration')![9]).observationMaxAgeHours, 48);
  } finally { store.close(); }
});

test('HTTP settings update refreshes dashboard/schema; JSON and CSV are downloadable and scoped', async () => {
  const { store } = fresh(); const server = createApiServer(store, config, root);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(base + '/api/config', { method: 'PATCH', body: JSON.stringify({ assessmentTime: '2026-10-07T09:00:00Z', observationMaxAgeHours: 24 }) });
    assert.equal(response.status, 200);
    const dashboard = await (await fetch(base + '/api/dashboard?profile=owner')).json();
    assert.equal(dashboard.configuration.observationMaxAgeHours, 24);
    assert.equal(dashboard.assessments[0].dataStatus, 'Insufficient information');
    assert.equal(dashboard.vehicles[0].details.odometerHistory[0].kilometres, 68340);
    assert.equal((await (await fetch(base + '/api/import/schema')).json()).assessmentTime, '2026-10-07T09:00:00.000Z');
    const json = await fetch(base + '/api/evidence?profile=owner&format=json');
    assert.match(json.headers.get('content-disposition')!, /attachment; filename="evidence-owner.json"/);
    const report: EvidenceReport = await json.json(); assert.equal(report.vehicles.length, 1);
    const csv = await fetch(base + '/api/evidence?profile=fleet&format=csv');
    assert.match(csv.headers.get('content-type')!, /text\/csv/);
    assert.ok((await csv.text()).includes('FLEET-001'));
    for (const suffix of ['?profile=other', '?format=pdf']) assert.equal((await fetch(base + '/api/evidence' + suffix)).status, 400);
    assert.equal((await fetch(base + '/api/config', { method: 'PATCH', body: '{}' })).status, 400);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); store.close(); }
});
