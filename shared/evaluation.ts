import type { Profile, ScenarioConfig } from './types.ts';

export interface EvaluationCase {
  id: string; title: string; objective: string; chapter: string;
  input: unknown; expected: unknown;
}
export interface EvaluationPlan {
  suiteVersion: '1.0'; profile: Profile; configuration: ScenarioConfig;
  sources: { file: string; sha256: string }[]; inputSha256: string;
  cases: EvaluationCase[]; limitations: string[];
}
export type CheckStatus = 'pass' | 'fail' | 'error';
export interface EvaluationResult extends EvaluationCase {
  status: CheckStatus; observed: unknown; durationMs: number;
}
export interface ReviewerNote { text: string; savedAt: string }
export interface EvaluationRun extends Omit<EvaluationPlan, 'cases'> {
  id: string; startedAt: string; completedAt: string; durationMs: number;
  cases: EvaluationResult[]; notes: ReviewerNote[];
}
export interface EvaluationSummary {
  id: string; profile: Profile; startedAt: string; completedAt: string;
  total: number; passed: number; failed: number; errors: number;
  durationMs: number; inputSha256: string; noteCount: number;
}
