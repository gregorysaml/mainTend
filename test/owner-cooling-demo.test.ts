import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import type { ScenarioConfig } from '../shared/types.ts';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config: ScenarioConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));
test('owner demo replaces charging alert with its own cooling snapshot and retains original links', () => {
  const store = new Store(':memory:', root);
  try {
    store.seed(); const before = store.getSnapshot('owner', config);
    const old = before.vehicles[0].warnings.find(w => w.sourceType === 'simulated_forecast')!;
    const actionId = store.createAction({ vehicleId: 'OWNER-001', warningId: old.id, actorProfile: 'owner', task: 'Existing charging demo task' });
    const fleet = store.getSnapshot('fleet', config);
    store.applyOwnerCoolingDemo(config);
    const after = store.getSnapshot('owner', config), current = after.vehicles[0].warnings.filter(w => w.current);
    assert.equal(current.length, 1); assert.equal(current[0].sourceType, 'computed_cooling');
    assert.equal(current[0].title, 'Cooling · Deteriorating trend');
    assert.equal(after.coolingRuns![0].vehicleId, 'OWNER-001'); assert.equal(after.coolingRuns![0].scenario, 'gradual');
    assert.equal(after.coolingRuns![0].id, current[0].sourceRef);
    assert.equal(after.vehicles[0].warnings.find(w => w.id === old.id)!.current, false);
    assert.equal(after.vehicles[0].actions.find(a => a.id === actionId)!.warningId, old.id);
    assert.deepEqual(after.vehicles[0].observations, before.vehicles[0].observations);
    assert.deepEqual(store.getSnapshot('fleet', config), fleet);
    store.runCooling({ profile: 'owner', vehicleId: 'OWNER-001', scenario: 'stable' }, config);
    const selected = store.getCoolingRuns('owner').find(r => r.selected)!.id;
    store.applyOwnerCoolingDemo(config);
    assert.equal(store.getCoolingRuns('owner').find(r => r.selected)!.id, selected);
  } finally { store.close(); }
});
test('owner demo replacement is atomic when warning archival fails', () => {
  const store = new Store(':memory:', root);
  try {
    store.seed(); const before = store.getSnapshot('owner', config);
    store.db.exec("CREATE TRIGGER prevent_demo_archival BEFORE UPDATE ON warnings BEGIN SELECT RAISE(ABORT, 'Test failure'); END;");
    assert.throws(() => store.applyOwnerCoolingDemo(config), /Previous records were retained/);
    assert.deepEqual(store.getSnapshot('owner', config), before);
    store.db.exec('DROP TRIGGER prevent_demo_archival'); store.applyOwnerCoolingDemo(config);
    assert.equal(store.getCoolingRuns('owner').length, 1);
  } finally { store.close(); }
});
