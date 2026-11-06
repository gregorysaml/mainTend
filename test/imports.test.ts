import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { normalizeObservation, prepareImport } from '../backend/src/imports/normalization.ts';
import { evaluateVehicle } from '../backend/src/core.ts';
import { createApiServer } from '../backend/src/http/app.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));
const ids = new Set(['FLEET-001']);
const row = { vehicleId: 'FLEET-001', parameter: 'engine_coolant_temperature', value: 203, unit: '°F', observedAt: '2026-10-04T11:30:00+03:00' };
function fresh() { const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vehicle-import-test-')), 'db.sqlite'); const store = new Store(dbPath, root); store.seed(); return { store, dbPath }; }

test('unit conversions preserve source and normalize timestamps without rounding', () => {
  for (const [parameter, value, unit, expected] of [
    ['engine_coolant_temperature', 203, '°F', 95],
    ['engine_coolant_temperature', 368.15, 'K', 95],
    ['engine_coolant_temperature', 95, ' celsius ', 95],
    ['battery_voltage', 12600, 'mV', 12.6],
    ['battery_voltage', 12.6, 'volts', 12.6]
  ] as const) {
    const result = normalizeObservation({ ...row, parameter, value, unit }, ids);
    assert.ok('observation' in result);
    assert.ok(Math.abs(result.observation.value - expected) < 1e-10);
    assert.equal(result.observation.observedAt, '2026-10-04T08:30:00.000Z');
    assert.equal(result.source.value, value); assert.equal(result.source.unit, unit);
  }
});

test('unsupported units, malformed rows, invalid dates and out-of-range conversions are explained', () => {
  const records = [null, 12, [], { ...row, unit: 'mV' }, { ...row, value: 1000 }, { ...row, value: '203' }, { ...row, observedAt: '2026-10-04' }, { ...row, observedAt: '2026-02-30T08:30:00Z' }, { ...row, parameter: '__proto__' }];
  const result = prepareImport(records, ids);
  assert.equal(result.accepted.length, 0); assert.equal(result.rejected.length, records.length);
  assert.match(result.rejected[3].reason, /Unsupported unit/); assert.match(result.rejected[4].reason, /Converted value/);
  assert.match(result.rejected[5].reason, /finite number/); assert.match(result.rejected[7].reason, /valid ISO/);
  assert.throws(() => prepareImport({}, ids), /array/);
  assert.throws(() => prepareImport(Array(501).fill(row), ids), /Maximum 500/);
});

test('converted and canonical observations give identical checks including threshold boundaries', () => {
  for (const fahrenheit of [221, 221.018]) {
    const converted = prepareImport([{ ...row, value: fahrenheit }, { ...row, parameter: 'battery_voltage', value: 12600, unit: 'mV' }], ids).accepted;
    const canonical = converted.map((o, i) => ({ id: i + 1, parameter: o.parameter, value: o.value, unit: o.unit, observedAt: o.observedAt }));
    const result = evaluateVehicle(canonical, config);
    assert.equal(result.triggers.length, fahrenheit === 221 ? 0 : 1);
    assert.deepEqual(result, evaluateVehicle(canonical, structuredClone(config)));
  }
});

test('preview is read-only; converted values and source survive reopening the database', () => {
  const { store, dbPath } = fresh();
  const count = store.getDashboard('fleet')[0].observations.length;
  const preview = store.previewImport([row, { ...row, vehicleId: 'UNKNOWN' }]);
  assert.equal(preview.accepted.length, 1); assert.equal(preview.rejected.length, 1);
  assert.equal(store.getDashboard('fleet')[0].observations.length, count);
  const imported = store.importObservations([row]); store.close();
  const reopened = new Store(dbPath, root);
  try {
    const observation = reopened.getDashboard('fleet')[0].observations.find(o => o.id === imported.accepted[0].id);
    assert.equal(observation?.value, 95); assert.equal(observation?.unit, '°C');
    assert.equal(observation?.source?.unit, '°F'); assert.equal(observation?.source?.value, 203);
  } finally { reopened.close(); }
});

test('storage failure rolls back the batch rather than retaining a partial import', () => {
  const { store } = fresh();
  try {
    const before = store.getDashboard('fleet')[0].observations.length;
    // Deliberate database failure on the second insert in the batch.
    store.db.exec("CREATE TRIGGER fail_voltage BEFORE INSERT ON observations WHEN NEW.value=12.6 BEGIN SELECT RAISE(ABORT,'test failure'); END;");
    assert.throws(() => store.importObservations([row, { ...row, parameter: 'battery_voltage', unit: 'mV', value: 12600 }]), /No records from this batch were saved/);
    assert.equal(store.getDashboard('fleet')[0].observations.length, before);
    store.db.exec('DROP TRIGGER fail_voltage');
    assert.equal(store.importObservations([row]).accepted.length, 1);
  } finally { store.close(); }
});

test('HTTP API previews, imports converted batches and returns fresh condition warnings', async () => {
  const { store } = fresh();
  const server = createApiServer(store, config, root);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const schema = await (await fetch(base + '/api/import/schema')).json(); assert.ok(schema.parameters.battery_voltage.acceptedUnits.includes('mV'));
    const payload = [{ ...row, value: 233.6 }, { ...row, parameter: 'battery_voltage', unit: 'mV', value: 12600 }, { ...row, vehicleId: 'UNKNOWN' }];
    const post = (url: string) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const preview = await (await post('/api/import/preview')).json(); assert.equal(preview.accepted.length, 2); assert.equal(preview.rejected.length, 1);
    assert.equal(store.getDashboard('fleet')[0].observations.length, 2);
    const imported = await (await post('/api/import')).json(); assert.equal(imported.accepted[0].unit, '°C');
    const dashboard = await (await fetch(base + '/api/dashboard?profile=fleet')).json();
    assert.ok(dashboard.vehicles[0].warnings.some((w: { sourceRef: string }) => w.sourceRef === 'DEMO-COOLANT-HIGH'));
    assert.equal(dashboard.vehicles[0].observations.find((o: { id: number }) => o.id === imported.accepted[1].id).value, 12.6);
    const invalid = await fetch(base + '/api/import', { method: 'POST', body: '{broken' }); assert.equal(invalid.status, 400); assert.match((await invalid.json()).error, /Invalid JSON/);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); store.close(); }
});
