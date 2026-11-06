import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { vehicleSignals } from '../frontend/src/utils/vehicle-signals.ts';
import type { Dashboard, ScenarioConfig } from '../shared/types.ts';
import { mileageSourceLabel } from '../frontend/src/utils/vehicle-identity.ts';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config: ScenarioConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));
function signals(d: Dashboard, id: string) { return vehicleSignals(d.vehicles.find(v => v.id === id)!, d.assessments.find(a => a.vehicleId === id)!, d.configuration, d.coolingRuns ?? []); }
function fresh() { const store = new Store(':memory:', root); store.seed(); return store; }

test('fleet mileage source wording is simplified without changing provenance records', () => {
  assert.equal(mileageSourceLabel('Synthetic fleet entry'), 'Recorded entry');
  assert.equal(mileageSourceLabel('User entered'), 'User entered');
  const store = fresh();
  try { const reading = store.getSnapshot('fleet', config).vehicles[0].details!.odometerHistory[0]; const original = reading.source; mileageSourceLabel(reading.source); assert.equal(reading.source, original); }
  finally { store.close(); }
});

test('header shows actual current rule warnings, withheld data and a bounded no-rule label', () => {
  const store = fresh();
  try {
    const d = store.getSnapshot('fleet', config);
    const normal = signals(d, 'FLEET-001'); assert.equal(normal[0].title, 'No current rule alert'); assert.ok(normal[0].detail.includes('Not a fault-free'));
    const warning = signals(d, 'FLEET-002'); assert.equal(warning[0].tone, 'warning'); assert.equal(warning[0].icon, 'warnings'); assert.ok(warning[0].detail.includes('112 °C'));
    const missing = signals(d, 'FLEET-003'); assert.equal(missing[0].title, 'Data needs attention'); assert.ok(missing[0].detail.includes('withheld')); assert.equal(missing[0].tone, 'neutral');
  } finally { store.close(); }
});
test('header keeps the current cooling demo distinct from rule alerts and never revives an archived rising trend', () => {
  const store = fresh();
  try {
    const rising = store.runCooling({ profile: 'fleet', vehicleId: 'FLEET-002', scenario: 'gradual' }, config);
    let list = signals(store.getSnapshot('fleet', config), 'FLEET-002');
    assert.equal(list.filter(s => s.tone === 'warning').length, 1); assert.equal(list.filter(s => s.tone === 'prediction').length, 1);
    assert.ok(list[1].href!.includes(rising.id)); assert.ok(list[1].title.includes('Cooling demo'));
    store.runCooling({ profile: 'fleet', vehicleId: 'FLEET-002', scenario: 'stable' }, config);
    list = signals(store.getSnapshot('fleet', config), 'FLEET-002');
    assert.equal(list.filter(s => s.tone === 'prediction').length, 0); assert.equal(list[1].detail, 'No adverse trend detected');
    assert.ok(!list.some(s => s.href?.includes(rising.id)));
  } finally { store.close(); }
});
test('changed settings and withheld forecasts do not display a current cooling prediction', () => {
  const store = fresh();
  try {
    store.runCooling({ profile: 'fleet', vehicleId: 'FLEET-002', scenario: 'insufficient' }, config);
    let list = signals(store.getSnapshot('fleet', config), 'FLEET-002'); assert.equal(list[1].detail, 'Insufficient data'); assert.equal(list[1].tone, 'neutral');
    store.updateConfig({ assessmentTime: '2026-10-05T09:00:00Z', observationMaxAgeHours: 24 }, config);
    list = signals(store.getSnapshot('fleet', config), 'FLEET-002'); assert.ok(list.some(s => s.title === 'Cooling demo · review needed' && s.tone === 'neutral'));
  } finally { store.close(); }
});
test('demo headers respect the single designated vehicle and label pre-entered owner forecasts', () => {
  const store = fresh();
  try {
    store.runCooling({ profile: 'fleet', vehicleId: 'FLEET-001', scenario: 'gradual' }, config);
    const fleet = store.getSnapshot('fleet', config); assert.ok(!signals(fleet, 'FLEET-001').some(s => s.id.startsWith('cooling-')));
    const owner = store.getSnapshot('owner', config); assert.ok(signals(owner, 'OWNER-001').some(s => s.detail === 'Pre-entered demo forecast'));
    owner.vehicles[0].warnings.forEach(w => { w.current = false; }); assert.ok(!signals(owner, 'OWNER-001').some(s => s.detail === 'Pre-entered demo forecast'));
  } finally { store.close(); }
});
