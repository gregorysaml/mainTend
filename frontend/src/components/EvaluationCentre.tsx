import { useEffect, useState } from 'react';
import { evaluationApi } from '../api/client.ts';
import { formatUtc } from '../utils/date.ts';
import type { Profile } from '../../../shared/types.ts';
import type { EvaluationCase, EvaluationPlan, EvaluationResult, EvaluationRun, EvaluationSummary } from '../../../shared/evaluation.ts';
import './evaluation.css';

const pretty = (value: unknown) => JSON.stringify(value, null, 2) ?? 'Not available';
function ScenarioCard({ check }: { check: EvaluationCase | EvaluationResult }) {
  const result = 'status' in check ? check : null;
  return <article className="scenario-card">
    <div className="card-heading"><span className="section-kicker">{check.id} · {check.chapter}</span><span className={`badge ${result?.status === 'pass' ? 'ok' : result ? 'warning' : 'insufficient'}`}>{result ? result.status.toUpperCase() : 'NOT RUN'}</span></div>
    <h3>{check.title}</h3><p className="scenario-objective">{check.objective}</p>
    <div className="comparison-grid"><section><h4>Expected</h4><pre>{pretty(check.expected)}</pre></section><section><h4>Observed</h4>{result ? <pre>{pretty(result.observed)}</pre> : <p className="muted">Run the scenarios to collect an observation. No result is assumed.</p>}</section></div>
    <details><summary>Inspect scenario inputs{result ? ` · ${result.durationMs} ms execution` : ''}</summary><pre>{pretty(check.input)}</pre></details>
  </article>;
}

export function EvaluationCentre({ profile }: { profile: Profile }) {
  const [plan, setPlan] = useState<EvaluationPlan | null>(null);
  const [history, setHistory] = useState<EvaluationSummary[]>([]);
  const [report, setReport] = useState<EvaluationRun | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [filter, setFilter] = useState('all');
  const [note, setNote] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [catalogue, runs] = await Promise.all([evaluationApi.plan(profile), evaluationApi.history(profile)]);
        const latest = runs[0] ? await evaluationApi.get(runs[0].id, profile) : null;
        if (alive) { setPlan(catalogue); setHistory(runs); setReport(latest); }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Could not load the test centre.'); }
      finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, [profile]);
  async function run() {
    setBusy(true); setError(''); setFeedback('');
    try {
      const result = await evaluationApi.run(profile);
      setReport(result); setFilter('all'); setNote('');
      setHistory(await evaluationApi.history(profile));
      setFeedback('Run saved. Live vehicle records and assessment settings were not changed.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not execute scenarios.'); }
    finally { setBusy(false); }
  }
  async function selectRun(id: string) {
    setBusy(true); setError(''); setFeedback('');
    try { setReport(await evaluationApi.get(id, profile)); setFilter('all'); setNote(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not retrieve the run.'); }
    finally { setBusy(false); }
  }
  async function saveNote(event: React.FormEvent) {
    event.preventDefault(); if (!report) return;
    setBusy(true); setError(''); setFeedback('');
    try {
      setReport(await evaluationApi.note(report.id, profile, note));
      setNote(''); setHistory(await evaluationApi.history(profile)); setFeedback('Reviewer note appended. Automated results were not altered.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the note.'); }
    finally { setBusy(false); }
  }
  const checks = report?.cases ?? plan?.cases ?? [];
  const counts = { pass: report?.cases.filter(c => c.status === 'pass').length ?? 0, fail: report?.cases.filter(c => c.status === 'fail').length ?? 0, error: report?.cases.filter(c => c.status === 'error').length ?? 0 };
  const visible = checks.filter(c => filter === 'all' || ('status' in c && c.status === filter));
  return <section className="evaluation-centre" aria-label="Test centre">
    <div className="evaluation-intro"><div><span className="section-kicker">CHAPTER 6 · CONTROLLED FUNCTIONAL EVALUATION</span><h2>From requirements to evidence.</h2><p>{profile === 'owner' ? 'Private-owner' : 'Fleet'} workflow and shared data-quality checks. These are backend scenario checks, not predictive-accuracy or usability tests.</p></div><button className="run-scenarios" type="button" disabled={busy || !plan} onClick={run}>{busy ? 'Working…' : 'Run isolated scenarios'}</button></div>
    <div className="evaluation-safety"><strong>Your demo records stay untouched.</strong> Every scenario uses fixed fixtures and an isolated in-memory database. Only the evaluation report and your notes are saved, in separate evaluation storage.</div>
    {error && <p className="error" role="alert">{error}</p>}{feedback && <p className="evaluation-feedback" role="status">{feedback}</p>}
    {busy && <p className="muted" role="status">Loading or executing the selected evaluation…</p>}
    {plan && <>
      <div className="evaluation-metrics"><div><small>{report ? 'Executed checks' : 'Planned checks'}</small><strong>{checks.length}</strong></div><div><small>Passed</small><strong className="count-pass">{counts.pass}</strong></div><div><small>Mismatches</small><strong>{counts.fail}</strong></div><div><small>Execution errors</small><strong>{counts.error}</strong></div></div>
      <div className="evaluation-toolbar"><label>Saved run<select disabled={busy || !history.length} value={report?.id ?? ''} onChange={e => selectRun(e.target.value)}>{!history.length && <option value="">No saved runs yet</option>}{history.map(r => <option key={r.id} value={r.id}>{formatUtc(r.startedAt)} · {r.passed}/{r.total} passed · {r.id.slice(0, 8)}</option>)}</select></label><label>Result filter<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All checks</option><option value="pass">Passed</option><option value="fail">Mismatches</option><option value="error">Execution errors</option></select></label>{report && <div className="evaluation-downloads"><a href={`/api/evaluations/${report.id}/export?profile=${profile}&format=json`} download>Export JSON</a><a href={`/api/evaluations/${report.id}/export?profile=${profile}&format=csv`} download>Export CSV</a></div>}</div>
      {report && <p className="panel-note">Run {report.id} · {formatUtc(report.completedAt)} · {report.durationMs} ms backend execution. Latest 50 runs shown; all stored reports remain retrievable.</p>}
      {report && report.inputSha256 !== plan.inputSha256 && <p className="evaluation-safety">This saved run used different inputs or a previous suite definition. Inspect its metadata before comparing it with a new run.</p>}
      <div className="scenario-list">{visible.map(check => <ScenarioCard key={check.id} check={check} />)}</div>
      {!visible.length && <p className="gap">No checks match this filter.</p>}
      <details className="evaluation-method"><summary>Configuration, reproducibility & limitations</summary><p className="panel-note">Suite {(report ?? plan).suiteVersion}. Fixed assessment: {formatUtc((report ?? plan).configuration.assessmentTime)} · maximum data age {(report ?? plan).configuration.observationMaxAgeHours} h. This is not the editable live assessment configuration.</p><p className="hash-value">Input/expected-results SHA-256: {(report ?? plan).inputSha256}</p><pre>{pretty((report ?? plan).configuration)}</pre><h3>Versioned source fingerprints</h3><ul>{(report ?? plan).sources.map(source => <li key={source.file}><code>{source.file}</code><span className="hash-value">{source.sha256}</span></li>)}</ul><h3>What these results do not establish</h3><ul>{(report ?? plan).limitations.map(text => <li key={text}>{text}</li>)}</ul></details>
      {report && <section className="reviewer-panel"><h3>Reviewer notes</h3><p className="panel-note">Record your observations or a reference to a screenshot. Notes are appended with timestamps; they never change automated pass/fail results. Do not enter private information.</p>{report.notes.map((item, i) => <article className="reviewer-note" key={i}><small>{formatUtc(item.savedAt)}</small><p>{item.text}</p></article>)}<form onSubmit={saveNote}><label>Reviewer note<textarea required maxLength={2000} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="What did you observe when reviewing this run?" /></label><button disabled={busy || !note.trim()}>Append note to this run</button></form></section>}
    </>}
    {!busy && !plan && <button className="run-scenarios" type="button" onClick={() => window.location.reload()}>Retry loading</button>}
  </section>;
}
