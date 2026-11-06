import type { Profile, Tyre } from './types.ts';

export const tyrePositions = ['front left', 'front right', 'rear left', 'rear right'] as const;
export type ProfileChange =
  | { section: 'mileage'; value: { kilometres: number; recordedAt: string } }
  | { section: 'service'; value: { lastServiceAt: string; lastServiceKm: number } }
  | { section: 'equipment'; value: string[] }
  | { section: 'tyres'; value: Tyre[] }
  | { section: 'photo'; value: { dataUrl: string; description: string } | null };
export type VehicleProfileInput = ProfileChange & { profile: Profile; revision: number; note: string };
export interface ProfileHistory { id: number; section: ProfileChange['section']; note: string; changedAt: string; source: 'user entered'; before: unknown; after: unknown }
