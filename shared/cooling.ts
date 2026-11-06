import type { Profile } from './types.ts';

export const coolingScenarios = [
  { id: 'gradual', label: 'Gradual deterioration', description: 'Comparable sessions warm progressively; compute a trend before the demo reference is crossed.' },
  { id: 'stable', label: 'Stable behaviour', description: 'Small variations around the fictional healthy reference; no adverse trend detected.' },
  { id: 'abrupt', label: 'Abrupt anomaly', description: 'A sudden high reading is a current anomaly, not a successfully predicted failure.' },
  { id: 'insufficient', label: 'Too few readings', description: 'Only two comparable sessions; do not invent a forecast.' },
  { id: 'stale', label: 'Outdated readings', description: 'The last comparable reading is outside the saved data-age limit.' },
  { id: 'noisy', label: 'Conflicting readings', description: 'The trend fit is too noisy; withhold extrapolation.' },
  { id: 'context', label: 'Different operating conditions', description: 'Higher-load readings are excluded from the comparable-session trend, not diagnosed as faults.' },
] as const;
export type CoolingScenario = typeof coolingScenarios[number]['id'];
export type CoolingStatus = 'stable' | 'deteriorating' | 'anomaly' | 'insufficient' | 'unreliable';
export const coolingStatusLabels: Record<CoolingStatus, string> = {
  stable: 'No adverse trend detected', deteriorating: 'Deteriorating trend', anomaly: 'Current demo anomaly',
  insufficient: 'Insufficient data', unreliable: 'Forecast withheld · noisy trend',
};
export interface CoolingReading { observedAt: string; coolantC: number; rpm: number; loadPct: number; ambientC: number; warmedUp: boolean }
export interface CoolingModelConfig {
  version: 'cooling-comparable-linear-v1'; assessmentTime: string; maxAgeHours: number;
  referenceC: number; thresholdC: number; horizonHours: number;
  minReadings: number; minSpanHours: number; maxFitRmseC: number; maxStepC: number;
  context: { rpm: number; rpmTolerance: number; loadPct: number; loadTolerance: number; ambientC: number; ambientTolerance: number };
}
export interface CoolingPoint { at: string; valueC: number }
export interface CoolingResult {
  status: CoolingStatus; explanation: string; included: CoolingReading[];
  excluded: { reading: CoolingReading; reason: string }[]; latestAgeHours: number | null;
  slopeCPerDay: number | null; fitRmseC: number | null; crossingAt: string | null;
  forecast: CoolingPoint[];
  evaluation: null | { samples: number; forecastMaeC: number; persistenceMaeC: number; firstHeldOutCrossingAt: string | null; syntheticWarningLeadHours: number | null };
}
export interface CoolingRun {
  id: string; vehicleId: string; profile: Profile; scenario: CoolingScenario; recordedAt: string;
  origin: 'synthetic cooling demonstration'; inputSha256: string; configuration: CoolingModelConfig;
  readings: CoolingReading[]; heldOut: CoolingReading[]; result: CoolingResult; warningId: string | null;
  notificationReadAt: string | null;
  selected: boolean;
}
export interface CoolingInput { profile: Profile; vehicleId: string; scenario: CoolingScenario }
export function coolingMatchesSettings(run: CoolingRun, time: string, age: number): boolean {
  return Date.parse(run.configuration.assessmentTime) === Date.parse(time) && run.configuration.maxAgeHours === age;
}
