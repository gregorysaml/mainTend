import test from 'node:test';
import assert from 'node:assert/strict';
import { warningOrigin } from '../frontend/src/utils/warning-origin.ts';
import { selectedFleetRow, type FleetRow } from '../frontend/src/features/fleet/selectors.ts';
import { formatKilometres, formatTemperature, formatPressure } from '../frontend/src/utils/formatters.ts';
import { warningRecords, selectWarningRecord } from '../frontend/src/features/warnings/selectors.ts';
import type { Dashboard, Vehicle, Warning } from '../shared/types.ts';
test('design-system warning badges distinguish demonstration rules from calculated synthetic projections', () => {
  assert.deepEqual(warningOrigin({ sourceType: 'rule' }), { label: 'Condition rule · recorded demo data', tone: 'warning' });
  for (const sourceType of ['computed_cooling', 'computed_lubrication', 'simulated_forecast'] as const) {
    const origin = warningOrigin({ sourceType });
    assert.equal(origin.tone, 'synthetic'); assert.match(origin.label, /synthetic/); assert.doesNotMatch(origin.label, /CAN|live|verified|hardware/);
  }
  assert.match(warningOrigin({ sourceType: 'simulated_forecast' }).label, /Pre-entered/);
});
test('ledger selection remains in the filtered set, with deterministic fallback and no invented selection for empty results', () => {
  const rows = [{ vehicle: { id: 'FLEET-002' } }, { vehicle: { id: 'FLEET-003' } }] as FleetRow[];
  assert.equal(selectedFleetRow(rows, 'FLEET-003'), rows[1]);
  assert.equal(selectedFleetRow(rows, 'OWNER-001'), rows[0]);
  assert.equal(selectedFleetRow([rows[0]], 'FLEET-003'), rows[0]);
  assert.equal(selectedFleetRow([], 'FLEET-003'), undefined);
  assert.equal(selectedFleetRow(rows, null), rows[0]);
});
test('display formatters preserve units and explicitly missing values rather than assuming normal data', () => {
  assert.equal(formatKilometres(121800), '121,800 km'); assert.equal(formatKilometres(0), '0 km');
  assert.equal(formatTemperature(105.25), '105.25 °C'); assert.equal(formatTemperature(-5), '-5 °C');
  assert.equal(formatPressure(2.3), '2.3 bar'); assert.equal(formatPressure(2.3, 'PSI'), '33.36 PSI');
  for (const value of [undefined, NaN, Infinity]) { assert.equal(formatKilometres(value), 'Not recorded'); assert.equal(formatTemperature(value), 'Not recorded'); assert.equal(formatPressure(value), 'Not recorded'); }
  assert.equal(formatKilometres(-1), 'Not recorded'); assert.equal(formatPressure(-1), 'Not recorded');
});
test('the warning inbox partitions current and historical evidence without confusing source type with recency', () => {
  const warning = (id: string, current: boolean, sourceType: Warning['sourceType']): Warning => ({ id,current,sourceType,sourceRef:id,title:id,explanation:'Fixture',createdAt:'2026-10-04T09:00:00Z',active:1,simulated:sourceType !== 'rule',supportingObservations:[] });
  const vehicle: Vehicle = { id:'FLEET-002',profile:'fleet',displayName:'Van',registration:'DEM-1002',makeModel:'Fixture',observations:[],actions:[],warnings:[warning('rule',true,'rule'),warning('new',true,'computed_cooling'),warning('old',false,'computed_cooling')] };
  const dashboard: Dashboard = {profile:'fleet',assessmentTime:'2026-10-04T09:00:00Z',configuration:{assessmentTime:'2026-10-04T09:00:00Z',observationMaxAgeHours:48,requiredParameters:[],rules:[]},assessments:[],vehicles:[vehicle]};
  const rows=warningRecords(dashboard); assert.deepEqual(rows.current.map(r=>r.warning.id),['rule','new']); assert.deepEqual(rows.historical.map(r=>r.warning.id),['old']);
  assert.equal(selectWarningRecord(rows.current,'old'),rows.current[0]); assert.equal(selectWarningRecord(rows.current,'new'),rows.current[1]); assert.equal(selectWarningRecord([], 'new'),undefined);
  const owner={...vehicle,id:'OWNER-001',profile:'owner' as const,registration:'DEM-2001',warnings:[warning('owner',true,'computed_lubrication')]};
  assert.deepEqual(warningRecords({...dashboard,profile:'owner',vehicles:[vehicle,owner]}).current.map(r=>r.warning.id),['owner']);
  assert.equal(vehicle.warnings.length,3);
});
