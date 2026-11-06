import type { MaintenanceAction } from './types.ts';

export type MaintenancePriority = 'low' | 'normal' | 'high';
export type DueStatus = 'unscheduled' | 'upcoming' | 'due soon' | 'due today' | 'overdue' | 'closed';
export interface ActionScheduleInput { dueDate: string | null; priority: MaintenancePriority; note: string }

export function validDueDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function dueStatus(action: Pick<MaintenanceAction, 'status' | 'dueDate'>, assessmentTime: string): DueStatus {
  if (action.status === 'completed' || action.status === 'cancelled') return 'closed';
  if (!validDueDate(action.dueDate)) return 'unscheduled';
  const day = new Date(assessmentTime).toISOString().slice(0, 10);
  if (action.dueDate < day) return 'overdue';
  if (action.dueDate === day) return 'due today';
  const days = (Date.parse(`${action.dueDate}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
  return days <= 7 ? 'due soon' : 'upcoming';
}

export function sortMaintenance(actions: MaintenanceAction[], assessmentTime: string): MaintenanceAction[] {
  const rank: Record<DueStatus, number> = { overdue: 0, 'due today': 1, 'due soon': 2, upcoming: 3, unscheduled: 4, closed: 5 };
  const priorities = { high: 0, normal: 1, low: 2 };
  return [...actions].sort((a, b) => rank[dueStatus(a, assessmentTime)] - rank[dueStatus(b, assessmentTime)] || (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || priorities[a.priority ?? 'normal'] - priorities[b.priority ?? 'normal'] || a.id - b.id);
}
