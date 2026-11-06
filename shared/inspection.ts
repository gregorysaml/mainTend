import type { MaintenanceAction, Profile } from './types.ts';

export const inspectionResults = ['confirmed', 'not confirmed', 'further investigation'] as const;
export type InspectionResult = typeof inspectionResults[number];
export interface InspectionInput {
  profile: Profile;
  revision: number;
  result: InspectionResult;
  inspectedAt: string;
  reportedBy: string;
  notes: string;
}
export interface InspectionRecord {
  id: number;
  result: InspectionResult;
  inspectedAt: string;
  reportedBy: string;
  notes: string;
  recordedAt: string;
  actorProfile: Profile;
  source: 'user reported';
}

export function needsInspection(action: Pick<MaintenanceAction, 'status' | 'inspections'>): boolean {
  return action.status !== 'cancelled' && (!action.inspections?.length || action.inspections[0].result === 'further investigation');
}
