import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { fleetRows, fleetSummary, selectFleetRows, observationAgeHours } from '../frontend/src/features/fleet/selectors.ts';
import { pageFromHash, navigationPages } from '../frontend/src/navigation/pages.ts';
import type { Dashboard, MaintenanceAction, ScenarioConfig } from '../shared/types.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config: ScenarioConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));
function fresh(): Dashboard {
  const store = new Store(':memory:', root);
  try { store.seed(); return store.getSnapshot('fleet', config); }
  finally { store.close(); }
}
function action(id: number, status: MaintenanceAction['status']): MaintenanceAction {
  return { id, warningId: 'historical-demo-warning', actorProfile: 'fleet', task: 'Test task', status, createdAt: config.assessmentTime, updatedAt: config.assessmentTime, history: [] };
}
const ids = (rows: ReturnType<typeof fleetRows>) => rows.map(row => row.vehicle.id);

test('fleet summary counts current assessed vehicles, not historical or simulated warnings', () => {
  const dashboard = fresh();
  dashboard.vehicles[0].warnings.push({ id: 'historical', sourceType: 'rule', sourceRef: 'demo', title: 'Historical', explanation: '', createdAt: config.assessmentTime, active: 0, current: false, simulated: false, supportingObservations: [] });
  dashboard.vehicles[0].warnings.push({ ...dashboard.vehicles[0].warnings[0], id: 'forecast', sourceType: 'simulated_forecast', current: true, simulated: true });
  const warningAssessment = dashboard.assessments.find(item => item.vehicleId === 'FLEET-002')!;
  warningAssessment.triggers.push(warningAssessment.triggers[0]);
  assert.deepEqual(fleetSummary(fleetRows(dashboard)), { total: 3, warningVehicles: 1, insufficientVehicles: 1, pendingVehicles: 0, pendingActions: 0 });
  assert.deepEqual(ids(selectFleetRows(fleetRows(dashboard), 'warnings', '', 'name')), ['FLEET-002']);
});

test('pending summary and filter count only planned/in-progress tasks, including historical links', () => {
  const dashboard = fresh();
  dashboard.vehicles[0].actions = [action(1, 'planned'), action(2, 'in progress'), action(3, 'completed'), action(4, 'cancelled')];
  dashboard.vehicles[2].actions = [action(5, 'in progress')];
  const rows = fleetRows(dashboard);
  assert.equal(fleetSummary(rows).pendingActions, 3);
  assert.equal(fleetSummary(rows).pendingVehicles, 2);
  assert.deepEqual(ids(selectFleetRows(rows, 'pending', '', 'name')), ['FLEET-001', 'FLEET-003']);
  dashboard.vehicles[0].actions[0].status = 'completed';
  assert.equal(fleetSummary(fleetRows(dashboard)).pendingActions, 2);
});

test('fleet filters combine with trimmed case-insensitive identity search and no-match state', () => {
  const rows = fleetRows(fresh());
  for (const query of [' dem-1002 ', 'service van', 'fleet-002', 'demo van b']) assert.deepEqual(ids(selectFleetRows(rows, 'warnings', query, 'attention')), ['FLEET-002']);
  assert.deepEqual(ids(selectFleetRows(rows, 'insufficient', '', 'name')), ['FLEET-003']);
  assert.deepEqual(ids(selectFleetRows(rows, 'clear', '', 'name')), ['FLEET-001']);
  assert.equal(selectFleetRows(rows, 'warnings', 'DEM-1001', 'name').length, 0);
  assert.equal(selectFleetRows(rows, 'all', 'non-existent', 'name').length, 0);
  assert.equal(selectFleetRows(rows, 'all', '   ', 'name').length, 3);
});

test('sorting is deterministic, orders attention and observation times, and does not mutate input', () => {
  const rows = fleetRows(fresh());
  const before = JSON.stringify(rows);
  assert.deepEqual(ids(selectFleetRows(rows, 'all', '', 'attention')), ['FLEET-002', 'FLEET-003', 'FLEET-001']);
  assert.deepEqual(ids(selectFleetRows(rows, 'all', '', 'latest')), ['FLEET-001', 'FLEET-002', 'FLEET-003']);
  assert.deepEqual(ids(selectFleetRows(rows, 'all', '', 'oldest')), ['FLEET-003', 'FLEET-002', 'FLEET-001']);
  for (const sort of ['attention', 'name', 'latest', 'oldest'] as const) assert.deepEqual(ids(selectFleetRows(rows, 'all', '', sort)), ids(selectFleetRows(rows.toReversed(), 'all', '', sort)));
  assert.equal(JSON.stringify(rows), before);
});

test('latest eligible measurement excludes future/invalid dates, resolves ties and handles no data', () => {
  const dashboard = fresh();
  dashboard.vehicles[0].observations.push({ id: 900, parameter: 'battery_voltage', value: 12.6, unit: 'V', observedAt: config.assessmentTime }, { id: 901, parameter: 'battery_voltage', value: 12.7, unit: 'V', observedAt: config.assessmentTime }, { id: 902, parameter: 'battery_voltage', value: 12.8, unit: 'V', observedAt: '2026-10-05T09:00:00Z' }, { id: 903, parameter: 'battery_voltage', value: 12.8, unit: 'V', observedAt: 'invalid' });
  dashboard.vehicles[1].observations = [];
  const rows = fleetRows(dashboard);
  assert.equal(rows[0].latestEligible!.id, 901);
  assert.equal(rows[0].futureReadings, 1);
  assert.equal(observationAgeHours(rows[0], config), 0);
  assert.equal(rows[1].latestEligible, undefined);
  assert.equal(observationAgeHours(rows[1], config), undefined);
  assert.equal(selectFleetRows(rows, 'all', '', 'oldest')[0].vehicle.id, 'FLEET-002');
  assert.equal(selectFleetRows(rows, 'all', '', 'latest').at(-1)!.vehicle.id, 'FLEET-002');
  dashboard.vehicles[0].observations.reverse();
  assert.equal(fleetRows(dashboard)[0].latestEligible!.id, 901);
});

test('missing assessments remain unknown; owner records excluded; fresh one-parameter data cannot clear gaps', () => {
  const dashboard = fresh();
  dashboard.assessments = dashboard.assessments.filter(item => item.vehicleId !== 'FLEET-001');
  dashboard.vehicles.push({ ...structuredClone(dashboard.vehicles[0]), id: 'OWNER-FAKE', profile: 'owner' });
  dashboard.vehicles[2].observations.push({ id: 999, parameter: 'battery_voltage', value: 12.5, unit: 'V', observedAt: config.assessmentTime });
  const rows = fleetRows(dashboard);
  assert.equal(rows.length, 3);
  assert.equal(fleetSummary(rows).insufficientVehicles, 2);
  assert.equal(rows[2].latestEligible!.observedAt, config.assessmentTime);
  assert.deepEqual(ids(selectFleetRows(rows, 'insufficient', '', 'name')), ['FLEET-001', 'FLEET-003']);
  assert.equal(selectFleetRows(rows, 'clear', '', 'name').length, 0);
});

test('settings are a dedicated route without crowding fleet/owner bottom navigation', () => {
  assert.equal(pageFromHash('#settings'), 'settings');
  assert.equal(pageFromHash('#evaluation'), 'evaluation');
  assert.equal(pageFromHash('#unknown'), 'overview');
  assert.equal(navigationPages('fleet').length, 6);
  assert.equal(navigationPages('owner').length, 5);
  assert.ok(!navigationPages('owner').some(page => page.id === 'vehicles'));
  assert.ok(!navigationPages('fleet').some(page => page.id === 'settings'));
});

test('saved action lifecycle refreshes pending counts while keeping the current condition warning', () => {
  const store = new Store(':memory:', root);
  try {
    store.seed();
    const vehicle = store.getSnapshot('fleet', config).vehicles.find(item => item.id === 'FLEET-002')!;
    const id = store.createAction({ vehicleId: vehicle.id, warningId: vehicle.warnings[0].id, actorProfile: 'fleet', task: 'Isolated filter verification', assignedTo: 'Demo technician' });
    const pending = () => fleetSummary(fleetRows(store.getSnapshot('fleet', config))).pendingActions;
    assert.equal(pending(), 1);
    store.updateAction(id, { status: 'in progress', note: 'Started synthetic inspection' });
    assert.equal(pending(), 1);
    store.updateAction(id, { status: 'completed', note: 'Finished synthetic inspection', outcome: 'Fictional result; no fault confirmed' });
    assert.equal(pending(), 0);
    const rows = fleetRows(store.getSnapshot('fleet', config));
    assert.equal(fleetSummary(rows).warningVehicles, 1);
    assert.equal(selectFleetRows(rows, 'pending', '', 'name').length, 0);
  } finally { store.close(); }
});
