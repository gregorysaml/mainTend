import type { AssessmentSettingsInput } from '../../../shared/types.ts';
import { isoTimestamp } from '../imports/normalization.ts';

export function validateSettings(input: unknown): AssessmentSettingsInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provide assessmentTime and observationMaxAgeHours');
  const value = input as Record<string, unknown>;
  const assessmentTime = isoTimestamp(value.assessmentTime);
  if (!assessmentTime) throw new Error('Assessment time must be a valid ISO date-time with a timezone');
  const hours = value.observationMaxAgeHours;
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0 || hours > 8760) throw new Error('Observation age limit must be a number greater than 0 and at most 8760 hours');
  const unsupported = Object.keys(value).filter(key => !['assessmentTime', 'observationMaxAgeHours'].includes(key));
  if (unsupported.length) throw new Error(`Unsupported setting(s): ${unsupported.join(', ')}`);
  return { assessmentTime, observationMaxAgeHours: hours };
}
