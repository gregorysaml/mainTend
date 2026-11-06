import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { performance } from 'node:perf_hooks';
import { Store } from '../../../lib/store.mjs';
import { evaluateVehicle } from '../core.ts';
import { prepareImport } from '../imports/normalization.ts';
import { buildEvidenceReport } from '../evidence/report.ts';
import type { Observation, ObservationInput, Profile, ScenarioConfig } from '../../../shared/types.ts';
import type { EvaluationCase, EvaluationPlan, EvaluationResult, EvaluationRun } from '../../../shared/evaluation.ts';

interface ExecutableCase extends EvaluationCase { observe: () => unknown }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const limitations = [
  'Synthetic, controlled backend checks; not predictive accuracy, usability or maintenance savings.',
  'Checks run in isolated in-memory SQLite databases, never against the live vehicle database.',
  'The fixed versioned scenario configuration is used, not the live editable assessment settings.',
  'Disk-restart persistence, browser layout and accessibility require separate checks; they are not tested by this runner.',
  'The simulated forecast is pre-entered. This suite does not run a trained predictive model.',
  'Execution durations are diagnostic timings, not user task times or fleet-scale performance benchmarks.'
];

export function executeCase(check: ExecutableCase): EvaluationResult {
  const started = performance.now();
  const { observe, ...definition } = check;
  try {
    const observed = observe();
    return { ...definition, observed, status: isDeepStrictEqual(observed, check.expected) ? 'pass' : 'fail', durationMs: Math.round((performance.now() - started) * 100) / 100 };
  } catch (error) {
    return { ...definition, observed: { executionError: error instanceof Error ? error.message : 'Check could not execute' }, status: 'error', durationMs: Math.round((performance.now() - started) * 100) / 100 };
  }
}

function suite(root: string, profile: Profile) {
  const files = ['config/scenario.json', 'data/vehicles.json', 'data/observations.json', 'data/forecasts.json', 'data/locations.json', 'data/vehicle-details.json', 'data/owner-history.json'];
  const fixtures: Record<string, unknown> = {};
  const sources = files.map(file => {
    const contents = fs.readFileSync(path.join(root, file), 'utf8');
    fixtures[file] = JSON.parse(contents);
    return { file, sha256: createHash('sha256').update(contents).digest('hex') };
  });
  const configuration = fixtures['config/scenario.json'] as ScenarioConfig;
  const raw = fixtures['data/observations.json'] as ObservationInput[];
  const vehicleId = profile === 'owner' ? 'OWNER-001' : 'FLEET-001';
  const observations = (id: string): Observation[] => raw.filter(o => o.vehicleId === id).map((o, index) => ({ id: index + 1, parameter: o.parameter, value: o.value, unit: o.unit, observedAt: o.observedAt }));
  const pair = (time: string): Observation[] => [
    { id: 1, parameter: 'engine_coolant_temperature', value: 90, unit: '°C', observedAt: time },
    { id: 2, parameter: 'battery_voltage', value: 12.5, unit: 'V', observedAt: time }
  ];
  const isolate = <T>(work: (store: Store) => T): T => {
    const store = new Store(':memory:', root);
    try { store.seed(); return work(store); } finally { store.close(); }
  };
  const checks: ExecutableCase[] = [];
  const add = (id: string, title: string, objective: string, chapter: string, input: unknown, expected: unknown, observe: () => unknown) =>
    checks.push({ id, title, objective, chapter, input, expected, observe });
  const assessmentSummary = (values: Observation[]) => {
    const result = evaluateVehicle(values, configuration);
    return { dataStatus: result.dataStatus, triggeredRules: result.triggers.map(t => t.rule.id), gapReasons: result.gaps.map(g => g.reason) };
  };

  if (profile === 'fleet') {
    add('F01', 'Usable data without a condition trigger', 'Distinguish no rule trigger from missing information; do not claim a fault-free car.', '5.2 / 6.1 fleet scenario', observations('FLEET-001'), { dataStatus: 'Sufficient', triggeredRules: [], gapReasons: [] }, () => assessmentSummary(observations('FLEET-001')));
    add('F02', 'High coolant condition warning', 'Apply the configured rule and retain its supporting measurement.', '5.2 / 6.1 fleet scenario', observations('FLEET-002'), { dataStatus: 'Sufficient', triggeredRules: ['DEMO-COOLANT-HIGH'], gapReasons: [] }, () => assessmentSummary(observations('FLEET-002')));
    add('F03', 'Missing and outdated observations', 'Withhold assessment instead of substituting normal values.', '5.1–5.2 / 6.1 data limitations', observations('FLEET-003'), { dataStatus: 'Insufficient information', triggeredRules: [], gapReasons: ['missing', 'outdated'] }, () => assessmentSummary(observations('FLEET-003')));
  } else {
    add('O01', 'Owner observations and condition rules', 'Evaluate the single-vehicle scenario separately from its supplied forecast.', '5.2 / 6.1 owner scenario', observations(vehicleId), { dataStatus: 'Sufficient', triggeredRules: [], gapReasons: [] }, () => assessmentSummary(observations(vehicleId)));
    add('O02', 'Explicitly simulated forecast', 'Keep the pre-entered predictive input visibly distinct from rule results.', '5.2 / 6.1 owner scenario', fixtures['data/forecasts.json'], { simulated: true, sourceType: 'simulated_forecast', hasExplanation: true }, () => isolate(store => {
      const warning = store.getDashboard('owner')[0].warnings[0];
      return { simulated: warning.simulated, sourceType: warning.sourceType, hasExplanation: Boolean(warning.explanation) };
    }));
  }
  const conversions = [
    { vehicleId, parameter: 'engine_coolant_temperature', value: 203, unit: '°F', observedAt: configuration.assessmentTime },
    { vehicleId, parameter: 'battery_voltage', value: 12600, unit: 'mV', observedAt: configuration.assessmentTime }
  ];
  add('C01', 'Unit conversion with original evidence', 'Normalize supported units without discarding original values.', '5.1 import component', conversions, { canonical: [95, 12.6], units: ['°C', 'V'], originals: [203, 12600], rejections: 0 }, () => {
    const result = prepareImport(conversions, new Set([vehicleId]));
    return { canonical: result.accepted.map(o => o.value), units: result.accepted.map(o => o.unit), originals: result.accepted.map(o => o.source.value), rejections: result.rejected.length };
  });
  const invalid = [{ vehicleId: 'UNKNOWN', parameter: 'battery_voltage', value: 12, unit: 'V', observedAt: configuration.assessmentTime }, { ...conversions[0], value: 'normal' }, {}];
  add('C02', 'Invalid input rejection', 'Reject unknown vehicles, non-numeric values and missing required fields with reasons.', '5.1 / 6.1 invalid data', invalid, { accepted: 0, rejected: 3, categories: [true, true, true] }, () => {
    const result = prepareImport(invalid, new Set([vehicleId]));
    return { accepted: result.accepted.length, rejected: result.rejected.length, categories: [/Unknown vehicle/, /finite number/, /Missing required/].map((pattern, i) => pattern.test(result.rejected[i]?.reason ?? '')) };
  });
  const boundary = new Date(Date.parse(configuration.assessmentTime) - configuration.observationMaxAgeHours * 3_600_000).toISOString();
  const expired = new Date(Date.parse(boundary) - 1).toISOString();
  add('C03', 'Maximum data-age boundary', 'Accept data at the exact age limit and withhold output one millisecond beyond it.', '5.1–5.2 observation age', { boundary: pair(boundary), expired: pair(expired) }, { atLimit: 'Sufficient', beyondLimit: 'Insufficient information', reasons: ['outdated', 'outdated'] }, () => {
    const result = evaluateVehicle(pair(expired), configuration);
    return { atLimit: evaluateVehicle(pair(boundary), configuration).dataStatus, beyondLimit: result.dataStatus, reasons: result.gaps.map(g => g.reason) };
  });
  const future = pair(new Date(Date.parse(configuration.assessmentTime) + 1).toISOString());
  add('C04', 'Future-only measurements', 'Exclude later-than-assessment records without assuming a normal vehicle.', '5.1–5.2 data limitations', future, { dataStatus: 'Insufficient information', triggeredRules: [], gapReasons: ['after assessment time', 'after assessment time'] }, () => assessmentSummary(future));
  add('C05', 'Repeatable rule assessment', 'Same inputs and configuration produce identical results, independent of array order.', '5.2 deterministic checks', observations(vehicleId), { identical: true }, () => {
    const values = observations(vehicleId);
    return { identical: isDeepStrictEqual(evaluateVehicle(values, configuration), evaluateVehicle(values.toReversed(), structuredClone(configuration))) };
  });
  const actionVehicle = profile === 'owner' ? 'OWNER-001' : 'FLEET-002';
  const outcome = 'Fictional inspection: the suspected issue was not confirmed.';
  add('C06', 'Complete linked maintenance workflow', 'Retain planned → in progress → completed, mandatory outcome and original warning.', '5.2 / 6.1 end-to-end workflow', { vehicleId: actionVehicle, task: 'Synthetic inspection', assignedTo: profile === 'fleet' ? 'Demo technician' : null, outcome, times: ['2026-10-04T09:05:00.000Z', '2026-10-04T09:10:00.000Z', '2026-10-04T09:20:00.000Z'] }, { statuses: ['planned', 'in progress', 'completed'], missingOutcomeRejected: true, warningLinked: true, warningRetained: true, outcome }, () => isolate(store => {
    const vehicle = store.getSnapshot(profile, configuration).vehicles.find(v => v.id === actionVehicle)!;
    const warning = vehicle.warnings[0];
    const id = store.createAction({ vehicleId: vehicle.id, warningId: warning.id, actorProfile: profile, task: 'Synthetic inspection', assignedTo: profile === 'fleet' ? 'Demo technician' : undefined }, '2026-10-04T09:05:00.000Z');
    store.updateAction(id, { status: 'in progress', note: 'Synthetic inspection started' }, '2026-10-04T09:10:00.000Z');
    let missingOutcomeRejected = false;
    try { store.updateAction(id, { status: 'completed', note: 'Synthetic inspection ended' }); } catch (error) { missingOutcomeRejected = error instanceof Error && /outcome/.test(error.message); }
    store.updateAction(id, { status: 'completed', note: 'Synthetic inspection ended', outcome }, '2026-10-04T09:20:00.000Z');
    const saved = store.getSnapshot(profile, configuration).vehicles.find(v => v.id === vehicle.id)!;
    const action = saved.actions.find(a => a.id === id)!;
    return { statuses: action.history.map(h => h.status), missingOutcomeRejected, warningLinked: action.warningId === warning.id, warningRetained: saved.warnings.some(w => w.id === warning.id && w.current), outcome: action.outcome };
  }));
  add('C07', 'Profile-scoped evidence export', 'Export only the selected demonstration vehicles, with inputs and a reproducibility hash.', '5.1 / 6.1 demonstration evidence', { profile }, { vehicleCount: profile === 'fleet' ? 3 : 1, scoped: true, hashPresent: true, syntheticOrigin: true }, () => isolate(store => {
    const report = buildEvidenceReport(store, profile, configuration);
    return { vehicleCount: report.vehicles.length, scoped: report.vehicles.every(v => v.profile === profile), hashPresent: /^[a-f0-9]{64}$/.test(report.inputSha256), syntheticOrigin: report.dataOrigin === 'synthetic demonstration' };
  }));
  const settings = { assessmentTime: '2026-10-07T09:00:00.000Z', observationMaxAgeHours: 24 };
  add('C08', 'Reassessment retains history', 'An assessment time outside the usable-data window withholds output without erasing the earlier warning or its linked action.', '5.2 warning and action independence', { vehicleId: actionVehicle, settings }, { dataStatus: 'Insufficient information', historicalWarning: true, actionLinkRetained: true }, () => isolate(store => {
    const before = store.getSnapshot(profile, configuration).vehicles.find(v => v.id === actionVehicle)!;
    const warning = before.warnings[0];
    const id = store.createAction({ vehicleId: before.id, warningId: warning.id, actorProfile: profile, task: 'Retain synthetic action', assignedTo: profile === 'fleet' ? 'Demo technician' : undefined });
    // A supplied forecast is not age-expired by condition reassessment; for owners
    // use the earlier assessment time to demonstrate the forecast becoming historical.
    const change = profile === 'owner' ? { ...settings, assessmentTime: '2026-09-30T09:00:00.000Z' } : settings;
    store.updateConfig(change, configuration);
    const snapshot = store.getSnapshot(profile, configuration);
    const saved = snapshot.vehicles.find(v => v.id === before.id)!;
    return { dataStatus: snapshot.assessments.find(a => a.vehicleId === before.id)!.dataStatus, historicalWarning: saved.warnings.find(w => w.id === warning.id)!.current === false, actionLinkRetained: saved.actions.find(a => a.id === id)!.warningId === warning.id };
  }));
  // Keep the documented owner reassessment input identical to the executed input.
  if (profile === 'owner') checks.at(-1)!.input = { vehicleId: actionVehicle, settings: { ...settings, assessmentTime: '2026-09-30T09:00:00.000Z' } };
  const cases = checks.map(({ observe, ...definition }) => definition);
  const inputSha256 = hash({ suiteVersion: '1.0', profile, configuration, sources, cases });
  return { checks, plan: { suiteVersion: '1.0' as const, profile, configuration, sources, inputSha256, cases, limitations } };
}

export function evaluationPlan(root: string, profile: Profile): EvaluationPlan { return suite(root, profile).plan; }
export function runEvaluation(root: string, profile: Profile): EvaluationRun {
  const { checks, plan } = suite(root, profile);
  const startedAt = new Date().toISOString(), started = performance.now();
  return { ...plan, id: randomUUID(), startedAt, cases: checks.map(executeCase), completedAt: new Date().toISOString(), durationMs: Math.round((performance.now() - started) * 100) / 100, notes: [] };
}
