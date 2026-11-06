import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { pageFromHash, navigationPages } from '../frontend/src/navigation/pages.ts';
import { coolingAdvice, coolingDemoVehicles, isCoolingDemoVehicle, maintenanceHref, readMaintenanceRequest, resolveMaintenanceRequest } from '../frontend/src/features/predictive/presentation.ts';
import type { ScenarioConfig } from '../shared/types.ts';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config: ScenarioConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));
function fresh() { const store = new Store(':memory:', root); store.seed(); return store; }

test('only the designated fleet example receives a demo preview; owner keeps its single vehicle', () => {
  const store = fresh();
  try {
    const fleet = store.getSnapshot('fleet', config), owner = store.getSnapshot('owner', config);
    const before = JSON.stringify(fleet);
    assert.deepEqual(coolingDemoVehicles(fleet).map(v => v.id), ['FLEET-002']);
    assert.deepEqual(fleet.vehicles.map(isCoolingDemoVehicle), [false, true, false]);
    assert.deepEqual(coolingDemoVehicles(owner).map(v => v.id), ['OWNER-001']);
    assert.equal(JSON.stringify(fleet), before);
  } finally { store.close(); }
});
test('missing demo vehicle never assigns an example to a different vehicle or another profile', () => {
  const store = fresh();
  try {
    const fleet = store.getSnapshot('fleet', config), owner = store.getSnapshot('owner', config);
    assert.deepEqual(coolingDemoVehicles({ ...fleet, vehicles: fleet.vehicles.filter(v => v.id !== 'FLEET-002') }), []);
    assert.deepEqual(coolingDemoVehicles({ ...fleet, vehicles: owner.vehicles }), []);
  } finally { store.close(); }
});

test('maintenance preview fragments route to Maintenance, preserving encoded identity and tab selection', () => {
  const href = maintenanceHref('vehicle & 2', 'snapshot+1', 'service');
  assert.equal(pageFromHash(href), 'maintenance');
  assert.deepEqual(readMaintenanceRequest(href), { vehicleId: 'vehicle & 2', runId: 'snapshot+1', view: 'service' });
  assert.equal(readMaintenanceRequest('#vehicles'), null); assert.equal(readMaintenanceRequest('#maintenance'), null);
  assert.equal(readMaintenanceRequest('#maintenance?run=wrong'), null);
  assert.equal(readMaintenanceRequest('#maintenance?vehicle=x&view=unknown')!.view, 'predictions');
  assert.equal(navigationPages('owner').length, 5); assert.equal(navigationPages('fleet').length, 6);
});
test('maintenance popup resolution scopes vehicle and snapshot, never falls back to another vehicle', () => {
  const store = fresh();
  try {
    const run = store.runCooling({ profile: 'fleet', vehicleId: 'FLEET-001', scenario: 'gradual' }, config);
    const fleet = store.getSnapshot('fleet', config), owner = store.getSnapshot('owner', config);
    const req = { vehicleId: run.vehicleId, runId: run.id, view: 'predictions' as const };
    assert.equal(resolveMaintenanceRequest(fleet, req).run?.id, run.id);
    assert.ok(resolveMaintenanceRequest(owner, req).error);
    assert.ok(resolveMaintenanceRequest(fleet, { ...req, vehicleId: 'FLEET-002' }).error);
    assert.ok(resolveMaintenanceRequest(fleet, { ...req, runId: 'missing' }).error);
    assert.equal(resolveMaintenanceRequest(fleet, { ...req, runId: null }).run?.id, run.id);
    assert.equal(resolveMaintenanceRequest(owner, { vehicleId: 'OWNER-001', runId: null, view: 'service' }).run, undefined);
  } finally { store.close(); }
});
test('an archived snapshot opens its exact evidence but cannot imply a current recommendation', () => {
  const store = fresh();
  try {
    const old = store.runCooling({ profile: 'fleet', vehicleId: 'FLEET-001', scenario: 'gradual' }, config);
    store.runCooling({ profile: 'fleet', vehicleId: 'FLEET-001', scenario: 'stable' }, config);
    const dashboard = store.getSnapshot('fleet', config);
    const result = resolveMaintenanceRequest(dashboard, { vehicleId: old.vehicleId, runId: old.id, view: 'predictions' });
    assert.equal(result.run!.id, old.id); assert.equal(result.run!.selected, false);
    assert.equal(coolingAdvice(result.run, dashboard).task, null);
    assert.ok(coolingAdvice(result.run, dashboard).text.includes('archived'));
  } finally { store.close(); }
});
test('demo recommendations distinguish trend, anomaly, data collection, stable and no snapshot for both profiles', () => {
  const store = fresh();
  try {
    for (const profile of ['fleet', 'owner'] as const) {
      const vehicleId = profile === 'fleet' ? 'FLEET-001' : 'OWNER-001';
      for (const scenario of ['gradual', 'abrupt', 'insufficient', 'noisy', 'stable'] as const) {
        const run = store.runCooling({ profile, vehicleId, scenario }, config), dashboard = store.getSnapshot(profile, config);
        const advice = coolingAdvice(run, dashboard);
        if (scenario === 'stable') assert.equal(advice.task, null);
        else if (scenario === 'gradual') assert.ok(advice.task!.includes('trend'));
        else if (scenario === 'abrupt') assert.ok(advice.text.includes('not an advance prediction'));
        else assert.ok(advice.task!.includes('measurements'));
      }
      assert.equal(coolingAdvice(undefined, store.getSnapshot(profile, config)).task, null);
    }
  } finally { store.close(); }
});
test('changed assessment settings withhold new advice without rewriting the saved run or task links', () => {
  const store = fresh();
  try {
    const run = store.runCooling({ profile: 'owner', vehicleId: 'OWNER-001', scenario: 'gradual' }, config);
    const before = JSON.stringify(run.result);
    store.updateConfig({ assessmentTime: '2026-10-05T09:00:00Z', observationMaxAgeHours: 24 }, config);
    const dashboard = store.getSnapshot('owner', config);
    assert.equal(coolingAdvice(run, dashboard).task, null); assert.equal(JSON.stringify(dashboard.coolingRuns![0].result), before);
  } finally { store.close(); }
});
