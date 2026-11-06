import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../lib/store.mjs';
import { validDueDate, dueStatus, sortMaintenance } from '../shared/maintenance.ts';
import { validateScheduleChange, validateScheduleFields } from '../backend/src/maintenance/scheduling.ts';
import { createApiServer } from '../backend/src/http/app.ts';
import { buildEvidenceReport, evidenceCsv } from '../backend/src/evidence/report.ts';
import { latestOdometer } from '../frontend/src/utils/vehicle-identity.ts';
import type { MaintenanceAction, Profile, ScenarioConfig } from '../shared/types.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config: ScenarioConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));
function fresh(filename = ':memory:') { const store = new Store(filename, root); store.seed(); store.getSnapshot('fleet', config); return store; }
function input(store: Store, profile: Profile) {
  const vehicle = store.getSnapshot(profile, config).vehicles.find(v => v.warnings.length)!;
  return { vehicleId: vehicle.id, warningId: vehicle.warnings[0].id, actorProfile: profile, task: 'Synthetic scheduled inspection', assignedTo: profile === 'fleet' ? 'Demo technician' : undefined };
}
function action(id: number, dueDate: string | null, status: MaintenanceAction['status'] = 'planned'): MaintenanceAction {
  return { id, dueDate, priority: 'normal', status, actorProfile: 'owner', warningId: 'demo', task: 'Demo', createdAt: config.assessmentTime, updatedAt: config.assessmentTime, history: [] };
}

test('schedule dates/priorities validate calendar, types, unknown fields and audit note', () => {
  assert.ok(validDueDate('2028-02-29'));
  for (const value of ['2026-02-29', '2026-04-31', '2026-10-04T09:00Z', '04/10/2026', '0000-01-01', '', 20261004, null]) assert.equal(validDueDate(value), false);
  assert.deepEqual(validateScheduleFields({}), { dueDate: null, priority: 'normal' });
  assert.deepEqual(validateScheduleChange({ dueDate: null, priority: 'high', note: ' Clear date ' }), { dueDate: null, priority: 'high', note: 'Clear date' });
  for (const value of [null, [], {}, { dueDate: '', priority: 'normal', note: 'x' }, { dueDate: '2026-02-29', priority: 'normal', note: 'x' }, { dueDate: null, priority: 'urgent', note: 'x' }, { dueDate: null, priority: 'normal', note: '' }, { dueDate: null, priority: 'normal', note: 'x'.repeat(2001) }, { dueDate: null, priority: 'normal', note: 'x', status: 'completed' }]) assert.throws(() => validateScheduleChange(value));
});

test('due states use UTC assessment day, inclusive seven-day boundary and closed task exclusion', () => {
  const expected = [[null, 'unscheduled'], ['2026-10-03', 'overdue'], ['2026-10-04', 'due today'], ['2026-10-11', 'due soon'], ['2026-10-12', 'upcoming']] as const;
  for (const [date, status] of expected) assert.equal(dueStatus(action(1, date), config.assessmentTime), status);
  assert.equal(dueStatus(action(1, '2026-10-04'), '2026-10-05T01:00:00+03:00'), 'due today');
  for (const status of ['completed', 'cancelled'] as const) assert.equal(dueStatus(action(1, '2026-10-03', status), config.assessmentTime), 'closed');
  assert.equal(dueStatus(action(1, '2026-10-04'), '2026-10-05T00:00:00Z'), 'overdue');
});

test('maintenance sorting is deterministic and non-mutating across due/priority ties', () => {
  const actions = [action(6, null), action(7, '2026-10-01', 'completed'), action(5, '2026-11-01'), action(4, '2026-10-11'), action(3, '2026-10-04'), action(2, '2026-10-03'), { ...action(1, '2026-10-03'), priority: 'high' as const }];
  const before = JSON.stringify(actions);
  assert.deepEqual(sortMaintenance(actions, config.assessmentTime).map(a => a.id), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(sortMaintenance(actions.toReversed(), config.assessmentTime), sortMaintenance(actions, config.assessmentTime));
  assert.equal(JSON.stringify(actions), before);
});

test('both profiles create/reschedule/clear schedules with snapshots, retaining warning and status', () => {
  const store = fresh();
  try {
    for (const profile of ['fleet', 'owner'] as const) {
      const values = input(store, profile);
      const id = store.createAction({ ...values, dueDate: '2026-10-03', priority: 'high' }, config.assessmentTime);
      store.updateActionSchedule(id, { dueDate: '2026-10-11', priority: 'low', note: 'Fictional reschedule' }, '2026-10-04T10:00:00Z');
      store.updateAction(id, { status: 'in progress', note: 'Started' }, '2026-10-04T11:00:00Z');
      store.updateActionSchedule(id, { dueDate: null, priority: 'normal', note: 'No agreed date' }, '2026-10-04T12:00:00Z');
      const vehicle = store.getSnapshot(profile, config).vehicles.find(v => v.id === values.vehicleId)!;
      const saved = vehicle.actions.find(a => a.id === id)!;
      assert.equal(saved.status, 'in progress'); assert.equal(saved.dueDate, null); assert.equal(saved.priority, 'normal');
      assert.deepEqual(saved.history.map(h => [h.dueDate, h.priority]), [['2026-10-03', 'high'], ['2026-10-11', 'low'], ['2026-10-11', 'low'], [null, 'normal']]);
      assert.ok(vehicle.warnings.some(w => w.id === saved.warningId && w.current));
      store.updateAction(id, { status: 'completed', note: 'Finished', outcome: 'Fictional inspection result' });
      assert.throws(() => store.updateActionSchedule(id, { dueDate: null, priority: 'low', note: 'Cannot edit closed task' }), /Closed/);
    }
    const values = input(store, 'fleet');
    assert.throws(() => store.createAction({ ...values, actorProfile: 'owner' }), /match/);
  } finally { store.close(); }
});

test('schedule and history survive reopen; legacy columns migrate without overwriting existing rows', () => {
  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'maintend-schedule-')), 'legacy.sqlite');
  const legacy = new DatabaseSync(filename);
  legacy.exec(`CREATE TABLE actions(id INTEGER PRIMARY KEY AUTOINCREMENT,vehicle_id TEXT,warning_id TEXT,actor_profile TEXT,task TEXT,assigned_to TEXT,status TEXT,outcome TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE action_history(id INTEGER PRIMARY KEY AUTOINCREMENT,action_id INTEGER,status TEXT,note TEXT,changed_at TEXT);
    INSERT INTO actions VALUES(42,'OWNER-001','legacy-warning','owner','Preserve legacy task',NULL,'planned',NULL,'2026-10-01T09:00:00Z','2026-10-01T09:00:00Z');
    INSERT INTO action_history VALUES(1,42,'planned','Original legacy note','2026-10-01T09:00:00Z');`);
  legacy.close();
  const store = fresh(filename);
  const old = store.getDashboard('owner')[0].actions[0];
  assert.equal(old.id, 42); assert.equal(old.task, 'Preserve legacy task'); assert.equal(old.priority, 'normal'); assert.equal(old.dueDate, null); assert.equal(old.history[0].note, 'Original legacy note'); assert.equal(old.history[0].priority, null);
  store.updateActionSchedule(42, { dueDate: '2026-10-10', priority: 'high', note: 'Schedule legacy task' }, '2026-10-04T10:00:00Z');
  store.close();
  const reopened = new Store(filename, root);
  try {
    const saved = reopened.getDashboard('owner')[0].actions[0];
    assert.equal(saved.dueDate, '2026-10-10'); assert.equal(saved.priority, 'high'); assert.equal(saved.history.length, 2); assert.equal(saved.history[0].note, 'Original legacy note');
  } finally { reopened.close(); }
});

test('history write failures roll back create, status change and reschedule with retry supported', () => {
  const store = fresh();
  try {
    const values = input(store, 'owner');
    const id = store.createAction({ ...values, dueDate: '2026-10-04', priority: 'high' });
    const before = JSON.stringify(store.getDashboard('owner'));
    store.db.exec("CREATE TRIGGER fail_action_history BEFORE INSERT ON action_history BEGIN SELECT RAISE(ABORT,'Injected history failure'); END;");
    assert.throws(() => store.createAction(values), /No partial/);
    assert.throws(() => store.updateAction(id, { status: 'in progress', note: 'Fail update' }), /previous state/);
    assert.throws(() => store.updateActionSchedule(id, { dueDate: '2026-10-12', priority: 'low', note: 'Fail schedule' }), /previous state/);
    assert.equal(JSON.stringify(store.getDashboard('owner')), before);
    store.db.exec('DROP TRIGGER fail_action_history');
    store.updateActionSchedule(id, { dueDate: '2026-10-12', priority: 'low', note: 'Retry worked' });
    assert.equal(store.getDashboard('owner')[0].actions[0].priority, 'low');
  } finally { store.close(); }
});

test('scheduled actions and schedule snapshots are included in JSON/CSV evidence', () => {
  const store = fresh();
  try {
    store.createAction({ ...input(store, 'owner'), dueDate: '2026-10-09', priority: 'high' });
    const report = buildEvidenceReport(store, 'owner', config);
    assert.equal(report.vehicles[0].actions[0].dueDate, '2026-10-09');
    assert.equal(report.vehicles[0].actions[0].history[0].priority, 'high');
    const csv = evidenceCsv(report);
    assert.ok(csv.includes('dueDate')); assert.ok(csv.includes('2026-10-09'));
  } finally { store.close(); }
});

test('HTTP scheduling validates requests for both profiles without changing status or warning linkage', async () => {
  const store = fresh(); const server = createApiServer(store, config, root);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const request = (url: string, method: string, body: unknown) => fetch(base + url, { method, body: JSON.stringify(body) });
  try {
    for (const profile of ['fleet', 'owner'] as const) {
      const values = input(store, profile);
      const created = await request('/api/actions', 'POST', { ...values, dueDate: '2026-10-04', priority: 'high' });
      assert.equal(created.status, 201); const { id } = await created.json();
      assert.equal((await request(`/api/actions/${id}/schedule`, 'PATCH', { dueDate: '2026-10-08', priority: 'low', note: 'Rescheduled via API' })).status, 200);
      assert.equal((await request(`/api/actions/${id}/schedule`, 'PATCH', { dueDate: '2026-02-30', priority: 'normal', note: 'Invalid date' })).status, 400);
      const dashboard = await (await fetch(base + `/api/dashboard?profile=${profile}`)).json();
      const action = dashboard.vehicles.flatMap((v: { actions: MaintenanceAction[] }) => v.actions).find((a: MaintenanceAction) => a.id === id);
      assert.equal(action.dueDate, '2026-10-08'); assert.equal(action.priority, 'low'); assert.equal(action.status, 'planned'); assert.equal(action.warningId, values.warningId); assert.equal(action.history.length, 2);
    }
    assert.equal((await request('/api/actions/9999/schedule', 'PATCH', { dueDate: null, priority: 'normal', note: 'Missing action' })).status, 400);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});

test('vehicle identity uses the newest valid mileage record without assuming a missing odometer', () => {
  const store = fresh();
  try {
    const vehicle = store.getDashboard('fleet')[1];
    assert.equal(latestOdometer(vehicle)!.kilometres, 121800);
    vehicle.details!.odometerHistory.reverse();
    assert.equal(latestOdometer(vehicle)!.kilometres, 121800);
    vehicle.details!.odometerHistory.push({ id: 99, kilometres: 0, recordedAt: 'invalid', source: 'test' });
    assert.equal(latestOdometer(vehicle)!.kilometres, 121800);
    vehicle.details!.odometerHistory = [];
    assert.equal(latestOdometer(vehicle), undefined);
  } finally { store.close(); }
});
