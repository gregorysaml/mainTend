import { useState, type FormEvent } from 'react';
import type { MaintenanceAction } from '../../../../shared/types.ts';
import type { InspectionResult } from '../../../../shared/inspection.ts';
import { maintenanceApi } from '../../api/client.ts';
import { formatUtc } from '../../utils/date.ts';
import type { Reload } from './ActionForms.tsx';

export function InspectionPanel({ action, warningTitle, reload }: { action: MaintenanceAction; warningTitle?: string; reload: Reload }) {
  const records = action.inspections ?? [], latest = records[0];
  const [result, setResult] = useState<InspectionResult | ''>('');
  const [reportedBy, setReportedBy] = useState(''), [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result || busy) return;
    const form = event.currentTarget;
    const date = String(new FormData(form).get('inspectedAt') ?? '');
    setBusy(true); setFeedback('');
    try {
      await maintenanceApi.inspect(action.id, { profile: action.actorProfile, revision: latest?.id ?? 0, result, inspectedAt: date + (date.length === 16 ? ':00.000Z' : 'Z'), reportedBy, notes });
      form.reset(); setResult(''); setReportedBy(''); setNotes('');
      setFeedback('Inspection saved. Task status and warning are unchanged.');
      try { await reload(); } catch { setFeedback('Inspection saved, but the view could not refresh. Refresh before adding another result.'); }
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not save; your draft is retained.'); }
    finally { setBusy(false); }
  }
  return <section className="inspection-panel" aria-label={`Inspection result for task ${action.id}`}>
    <div className="inspection-heading"><h4>Reported inspection</h4><span className="badge inspection-badge">{latest?.result ?? 'Not recorded'}</span></div>
    <p className="inspection-concern">Concern: <strong>{warningTitle ?? action.warningId}</strong></p>
    {latest && <div className="inspection-latest"><p>{latest.notes}</p><small>Inspected {formatUtc(latest.inspectedAt)} · reported by {latest.reportedBy}</small><small>User reported · saved {formatUtc(latest.recordedAt)}</small></div>}
    <p className="panel-note">Unverified user report, not a diagnosis. “Not confirmed” does not mean fault-free. Saving any result does not clear the warning or complete the task.</p>
    {action.status !== 'cancelled' && <details className="inspection-editor"><summary>{latest ? 'Add follow-up / correction' : 'Record inspection result'}</summary>
      <form className="maintenance-form" onSubmit={submit}>
        <fieldset disabled={busy} className="inspection-fields">
          <label>Inspection result<select required value={result} onChange={event => setResult(event.target.value as InspectionResult | '')}><option value="" disabled>Select a result</option><option value="confirmed">Concern confirmed</option><option value="not confirmed">Concern not confirmed</option><option value="further investigation">Further investigation needed</option></select></label>
          <label>Inspection time (UTC)<input required name="inspectedAt" type="datetime-local" min="1900-01-01T00:00" defaultValue={new Date().toISOString().slice(0, 16)} /></label>
          <label className="form-wide">Reported inspector / role<input required maxLength={100} value={reportedBy} onChange={event => setReportedBy(event.target.value)} placeholder="Who reported this inspection?" /></label>
          <label className="form-wide">Inspection notes<textarea required maxLength={2000} rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="What was checked, what was found, and any follow-up needed. Use fictional details for demo testing." /></label>
          <p className="schedule-guidance">Time is entered in UTC, separate from the assessment time. Each save adds a new record; earlier evidence is retained. Inspector names are self-reported, not verified accounts.</p>
          <button>{busy ? 'Saving…' : 'Save inspection result'}</button>
        </fieldset>
        {feedback && <p className="form-feedback" role="status">{feedback}</p>}
      </form>
    </details>}
    {!!records.length && <details className="task-history inspection-history"><summary>Inspection history ({records.length})</summary><p className="panel-note">Latest above means latest saved. A correction may refer to an earlier inspection time.</p><ol>{records.map(record => <li key={record.id}><strong>{record.result} · report #{record.id}</strong><p>{record.notes}</p><small>Inspected {formatUtc(record.inspectedAt)} · {record.reportedBy}</small><small>Saved {formatUtc(record.recordedAt)} · {record.actorProfile} · {record.source}</small></li>)}</ol></details>}
  </section>;
}
