import type { Profile } from './types.ts';

export const lubricationScenarios = [
  { id: 'gradual', label: 'Gradual pressure decline', description: 'Comparable warmed-up sessions show a falling pressure trend before a fictional reference is crossed.' },
  { id: 'stable', label: 'Stable behaviour', description: 'Small pressure variations; no adverse trend detected. Not proof of a fault-free engine.' },
  { id: 'abrupt', label: 'Sudden low-pressure anomaly', description: 'A low current reading is an anomaly, not a successfully predicted failure.' },
  { id: 'insufficient', label: 'Too few readings', description: 'Only two comparable sessions; no forecast is issued.' },
  { id: 'stale', label: 'Outdated readings', description: 'The latest comparable session exceeds the saved data-age limit.' },
  { id: 'noisy', label: 'Conflicting readings', description: 'The fit is too noisy for a bounded linear projection.' },
  { id: 'context', label: 'Different RPM / oil temperature', description: 'A reading outside the comparison window is excluded, not diagnosed as a fault.' },
] as const;
export type LubricationScenario = typeof lubricationScenarios[number]['id'];
export type LubricationStatus = 'stable' | 'deteriorating' | 'anomaly' | 'insufficient' | 'unreliable';
export const lubricationStatusLabels: Record<LubricationStatus, string> = {
  stable: 'No adverse trend detected', deteriorating: 'Falling oil-pressure trend', anomaly: 'Current low-pressure demo anomaly',
  insufficient: 'Insufficient comparable data', unreliable: 'Forecast withheld · noisy trend',
};
export interface LubricationReading { observedAt: string; oilPressureBar: number; oilTempC: number; rpm: number; loadPct: number; warmedUp: boolean }
export interface LubricationModelConfig {
  version: 'lubrication-comparable-linear-v1'; assessmentTime: string; maxAgeHours: number;
  referenceBar: number; thresholdBar: number; horizonHours: number;
  minReadings: number; minSpanHours: number; maxFitRmseBar: number; maxStepBar: number;
  context: { rpm: number; rpmTolerance: number; loadPct: number; loadTolerance: number; oilTempC: number; oilTempTolerance: number };
}
export interface LubricationPoint { at: string; valueBar: number }
export interface LubricationResult {
  status: LubricationStatus; explanation: string; included: LubricationReading[];
  excluded: { reading: LubricationReading; reason: string }[]; latestAgeHours: number | null;
  slopeBarPerDay: number | null; fitRmseBar: number | null; crossingAt: string | null; forecast: LubricationPoint[];
  evaluation: null | { samples: number; forecastMaeBar: number; persistenceMaeBar: number; firstHeldOutCrossingAt: string | null; syntheticWarningLeadHours: number | null };
}
export interface LubricationRun {
  id: string; vehicleId: string; profile: Profile; scenario: LubricationScenario; recordedAt: string;
  origin: 'synthetic lubrication demonstration'; inputSha256: string; configuration: LubricationModelConfig;
  readings: LubricationReading[]; heldOut: LubricationReading[]; result: LubricationResult; warningId: string | null;
  notificationReadAt: string | null; selected: boolean;
}
export interface LubricationInput { profile: Profile; vehicleId: string; scenario: LubricationScenario }
export function lubricationMatchesSettings(run: LubricationRun, time: string, age: number): boolean {
  return Date.parse(run.configuration.assessmentTime) === Date.parse(time) && run.configuration.maxAgeHours === age;
}
