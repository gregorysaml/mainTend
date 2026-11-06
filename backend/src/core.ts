import type { DataGap, Observation, ScenarioConfig, Trigger } from '../../shared/types.ts';

export function evaluateVehicle(observations: Observation[], config: ScenarioConfig): { dataStatus: 'Sufficient' | 'Insufficient information'; gaps: DataGap[]; triggers: Trigger[] } {
  const assessmentMs = Date.parse(config.assessmentTime), maxAgeMs = config.observationMaxAgeHours * 3_600_000;
  const latest = new Map<string, Observation>();
  const future = new Set<string>();
  for (const observation of observations) {
    if (Date.parse(observation.observedAt) > assessmentMs) { future.add(observation.parameter); continue; }
    const current = latest.get(observation.parameter);
    if (!current || Date.parse(observation.observedAt) > Date.parse(current.observedAt) || (Date.parse(observation.observedAt) === Date.parse(current.observedAt) && observation.id > current.id)) latest.set(observation.parameter, observation);
  }
  const gaps: DataGap[] = [];
  for (const parameter of config.requiredParameters) {
    const observation = latest.get(parameter);
    if (!observation) gaps.push({ parameter, reason: future.has(parameter) ? 'after assessment time' : 'missing' });
    else { const age = assessmentMs - Date.parse(observation.observedAt); if (age < 0 || age > maxAgeMs) gaps.push({ parameter, reason: age < 0 ? 'after assessment time' : 'outdated', observedAt: observation.observedAt }); }
  }
  if (gaps.length) return { dataStatus: 'Insufficient information', gaps, triggers: [] };
  const triggers: Trigger[] = [];
  for (const rule of config.rules) { const observation = latest.get(rule.parameter); if (observation && (rule.operator === '>' ? observation.value > rule.threshold : observation.value < rule.threshold)) triggers.push({ rule, observation }); }
  return { dataStatus: 'Sufficient', gaps: [], triggers };
}
