import type { DatabaseSync } from 'node:sqlite';
import { inspectionResults, type InspectionInput } from '../../../shared/inspection.ts';

export function validateInspection(raw: unknown, now: string): InspectionInput {
  const keys = ['profile', 'revision', 'result', 'inspectedAt', 'reportedBy', 'notes'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== keys.length || Object.keys(raw).some(key => !keys.includes(key))) throw new Error('Provide only profile, revision, result, inspectedAt, reportedBy and notes.');
  const value = raw as Record<string, unknown>;
  if (value.profile !== 'owner' && value.profile !== 'fleet') throw new Error('Profile must be fleet or owner.');
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) throw new Error('Inspection revision must be a non-negative integer.');
  if (!inspectionResults.includes(value.result as never)) throw new Error('Select confirmed, not confirmed or further investigation.');
  if (typeof value.inspectedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.inspectedAt)) throw new Error('Inspection time must be an explicit UTC date and time.');
  const time = Date.parse(value.inspectedAt);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== value.inspectedAt.slice(0, 19) || value.inspectedAt < '1900' || time > Date.parse(now)) throw new Error('Inspection time must be a real date, not in the future.');
  for (const [field, maximum] of [['reportedBy', 100], ['notes', 2000]] as const) {
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].trim().length > maximum) throw new Error(`${field === 'reportedBy' ? 'Reported inspector' : 'Inspection notes'} is required (maximum ${maximum} characters).`);
  }
  return { profile: value.profile, revision: value.revision as number, result: value.result as InspectionInput['result'], inspectedAt: new Date(time).toISOString(), reportedBy: (value.reportedBy as string).trim(), notes: (value.notes as string).trim() };
}

export function saveInspection(db: DatabaseSync, actionId: number, raw: unknown, now: string): number {
  const input = validateInspection(raw, now);
  db.exec('BEGIN IMMEDIATE');
  try {
    const action = db.prepare('SELECT a.status,v.profile FROM actions a JOIN vehicles v ON v.id=a.vehicle_id WHERE a.id=?').get(actionId);
    if (!action || action.profile !== input.profile) throw new Error('Action not found for this profile.');
    if (action.status === 'cancelled') throw new Error('Cancelled tasks cannot receive new inspection results. Existing evidence is retained.');
    const latest = db.prepare('SELECT COALESCE(MAX(id),0) revision FROM action_inspections WHERE action_id=?').get(actionId)!;
    if (latest.revision !== input.revision) throw new Error('Another inspection was saved. Your draft is retained; copy it before refreshing to review the latest result.');
    const record = db.prepare('INSERT INTO action_inspections(action_id,result,inspected_at,reported_by,notes,recorded_at,actor_profile) VALUES(?,?,?,?,?,?,?)').run(actionId, input.result, input.inspectedAt, input.reportedBy, input.notes, now, input.profile);
    db.exec('COMMIT');
    return Number(record.lastInsertRowid);
  } catch (error) {
    db.exec('ROLLBACK');
    if (error instanceof Error && /Action not found|Cancelled tasks|Another inspection/.test(error.message)) throw error;
    throw new Error('Could not save the inspection. No partial record was saved; your draft can be retried.', { cause: error });
  }
}
