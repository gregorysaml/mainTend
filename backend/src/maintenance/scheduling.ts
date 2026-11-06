import { validDueDate, type ActionScheduleInput, type MaintenancePriority } from '../../../shared/maintenance.ts';

export function validateScheduleFields(input: { dueDate?: unknown; priority?: unknown }): { dueDate: string | null; priority: MaintenancePriority } {
  const dueDate = input.dueDate === undefined || input.dueDate === null ? null : input.dueDate;
  if (dueDate !== null && !validDueDate(dueDate)) throw new Error('Due date must be a valid YYYY-MM-DD calendar date (1900–9999), or null for unscheduled.');
  const priority = input.priority === undefined ? 'normal' : input.priority;
  if (priority !== 'low' && priority !== 'normal' && priority !== 'high') throw new Error('Priority must be low, normal or high.');
  return { dueDate, priority };
}

export function validateScheduleChange(input: unknown): ActionScheduleInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provide dueDate, priority and a schedule note.');
  const fields = input as Record<string, unknown>;
  if (Object.keys(fields).some(key => !['dueDate', 'priority', 'note'].includes(key)) || !Object.hasOwn(fields, 'dueDate') || !Object.hasOwn(fields, 'priority')) throw new Error('Provide only dueDate, priority and a schedule note.');
  if (typeof fields.note !== 'string' || !fields.note.trim() || fields.note.trim().length > 2000) throw new Error('A schedule note of 1–2000 characters is required.');
  if (fields.priority === undefined || fields.dueDate === undefined) throw new Error('Due date and priority are required; use null for unscheduled.');
  return { ...validateScheduleFields(fields), note: fields.note.trim() };
}
