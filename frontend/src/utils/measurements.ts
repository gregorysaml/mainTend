import type { Observation, ScenarioConfig } from '../../../shared/types.ts';

export function measurementSeries(observations: Observation[], parameter: string): Observation[] {
  return observations.filter(o => o.parameter === parameter).toSorted((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || a.id - b.id);
}
export function measurementAge(observation: Observation, configuration: ScenarioConfig): 'Within age limit' | 'Outdated' | 'After assessment time' {
  const ageHours = (Date.parse(configuration.assessmentTime) - Date.parse(observation.observedAt)) / 3_600_000;
  return ageHours < 0 ? 'After assessment time' : ageHours > configuration.observationMaxAgeHours ? 'Outdated' : 'Within age limit';
}
