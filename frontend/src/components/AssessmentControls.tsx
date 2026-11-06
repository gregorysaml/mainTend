import { Button } from './ui/button.tsx';
import { useEffect, useState } from 'react';
import type { Profile, ScenarioConfig } from '../../../shared/types.ts';
import { api } from '../api/client.ts';
import { formatUtc, utcInputTimestamp } from '../utils/date.ts';
import './vehicle-evidence.css';

export function AssessmentControls({ configuration, profile, reload }: { configuration: ScenarioConfig; profile: Profile; reload: () => Promise<void> }) {
  const [time, setTime] = useState(configuration.assessmentTime.slice(0, -1));
  const [hours, setHours] = useState(String(configuration.observationMaxAgeHours));
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTime(configuration.assessmentTime.slice(0, -1)); setHours(String(configuration.observationMaxAgeHours)); }, [configuration.assessmentTime, configuration.observationMaxAgeHours]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setFeedback('');
    try { await api.updateSettings({ assessmentTime: utcInputTimestamp(time), observationMaxAgeHours: Number(hours) }); await reload(); setFeedback('Settings saved. Assessments refreshed; historical warnings retained.'); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not save settings.'); }
    finally { setBusy(false); }
  }
  return <><section className="assessment-panel" aria-label="Assessment configuration and evidence">
    <span className="section-kicker">TIME & DATA QUALITY</span>
    <h2>Assessment settings</h2>
    <p className="assessment-current">Assessment: <strong>{formatUtc(configuration.assessmentTime)}</strong> · Maximum data age: <strong>{configuration.observationMaxAgeHours} h</strong></p>
      <p className="panel-note">Shared controlled-demo settings for both profiles. This is the time at which measurements are evaluated, not the current clock time. Future measurements are excluded; old measurements cause insufficient information. Rule thresholds are unchanged.</p>
      <form className="settings-form" onSubmit={save}><label>Assessment time (UTC)<input required type="datetime-local" step="0.001" value={time} onChange={event => setTime(event.target.value)} /></label><label>Maximum data age (hours)<input required type="number" min="0.01" max="8760" step="any" value={hours} onChange={event => setHours(event.target.value)} /></label><Button disabled={busy}>{busy ? 'Saving…' : 'Save & reassess'}</Button></form>
      {feedback && <p role="status">{feedback}</p>}
  </section><section className="evidence-export-card" aria-label="Export evidence"><span className="section-kicker">KEEP A RECORD</span><div className="report-export"><div><h3>Export evidence report</h3><p className="panel-note">{profile === 'owner' ? 'Your vehicle only' : 'Fleet vehicles only'}. Includes saved measurements, source units, settings history, assessments, warnings, actions, odometer records and tyres. This is evidence, not a test verdict.</p></div><a href={`/api/evidence?profile=${profile}&format=json`} download>Download JSON</a><a href={`/api/evidence?profile=${profile}&format=csv`} download>Download CSV</a></div>
  </section></>;
}
