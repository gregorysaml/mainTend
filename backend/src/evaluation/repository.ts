import { DatabaseSync } from 'node:sqlite';
import type { Profile } from '../../../shared/types.ts';
import type { EvaluationRun, EvaluationSummary } from '../../../shared/evaluation.ts';

export function summarizeRun(run: EvaluationRun): EvaluationSummary {
  return { id: run.id, profile: run.profile, startedAt: run.startedAt, completedAt: run.completedAt, total: run.cases.length, passed: run.cases.filter(c => c.status === 'pass').length, failed: run.cases.filter(c => c.status === 'fail').length, errors: run.cases.filter(c => c.status === 'error').length, durationMs: run.durationMs, inputSha256: run.inputSha256, noteCount: run.notes.length };
}
export class EvaluationRepository {
  private db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec('CREATE TABLE IF NOT EXISTS evaluation_runs(id TEXT PRIMARY KEY,profile TEXT NOT NULL,started_at TEXT NOT NULL,report TEXT NOT NULL,notes TEXT NOT NULL)');
  }
  close() { this.db.close(); }
  save(run: EvaluationRun) {
    this.db.prepare('INSERT INTO evaluation_runs VALUES(?,?,?,?,?)').run(run.id, run.profile, run.startedAt, JSON.stringify(run), JSON.stringify(run.notes));
  }
  get(id: string, profile: Profile): EvaluationRun | null {
    const row = this.db.prepare('SELECT report,notes FROM evaluation_runs WHERE id=? AND profile=?').get(id, profile);
    return row ? { ...JSON.parse(String(row.report)), notes: JSON.parse(String(row.notes)) } as EvaluationRun : null;
  }
  list(profile: Profile): EvaluationSummary[] {
    return this.db.prepare('SELECT report,notes FROM evaluation_runs WHERE profile=? ORDER BY started_at DESC,rowid DESC LIMIT 50').all(profile).map(row =>
      summarizeRun({ ...JSON.parse(String(row.report)), notes: JSON.parse(String(row.notes)) } as EvaluationRun));
  }
  addNote(id: string, profile: Profile, text: unknown): EvaluationRun {
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('Provide a reviewer note of 1–2000 characters.');
    const run = this.get(id, profile);
    if (!run) throw new Error('Evaluation run not found for this profile.');
    if (run.notes.length >= 100) throw new Error('Maximum 100 notes per run.');
    run.notes.push({ text: text.trim(), savedAt: new Date().toISOString() });
    this.db.prepare('UPDATE evaluation_runs SET notes=? WHERE id=? AND profile=?').run(JSON.stringify(run.notes), id, profile);
    return run;
  }
}

export function evaluationCsv(run: EvaluationRun): string {
  const cell = (value: unknown) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows: unknown[][] = [['recordType', 'runId', 'profile', 'caseId', 'title', 'chapter', 'status', 'durationMs', 'inputJson', 'expectedJson', 'observedJson', 'metadataJson']];
  rows.push(['run', run.id, run.profile, '', '', '', '', run.durationMs, '', '', '', { suiteVersion: run.suiteVersion, configuration: run.configuration, sources: run.sources, inputSha256: run.inputSha256, startedAt: run.startedAt, completedAt: run.completedAt, limitations: run.limitations }]);
  for (const c of run.cases) rows.push(['case', run.id, run.profile, c.id, c.title, c.chapter, c.status, c.durationMs, c.input, c.expected, c.observed, { objective: c.objective }]);
  for (const note of run.notes) rows.push(['reviewerNote', run.id, run.profile, '', '', '', '', '', '', '', '', note]);
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
