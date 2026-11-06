import { useState, type FormEvent } from 'react';
import type { Dashboard, ScenarioConfig, Vehicle, Warning } from '../../../../shared/types.ts';
import { coolingMatchesSettings, coolingScenarios, coolingStatusLabels, type CoolingRun, type CoolingScenario } from '../../../../shared/cooling.ts';
import { coolingApi } from '../../api/client.ts';
import { formatUtc } from '../../utils/date.ts';
import { VehicleIdentity } from '../../components/VehicleIdentity.tsx';
import { ActionForm, type Reload } from '../maintenance/ActionForms.tsx';
import './cooling.css';
import { maintenanceHref, isCoolingDemoVehicle, coolingDemoVehicles } from './presentation.ts';
import { Icon } from '../../components/Icon.tsx';

const label = (run: CoolingRun) => coolingScenarios.find(s => s.id === run.scenario)!.label;
function tone(run: CoolingRun): string { return run.result.status === 'deteriorating' ? 'forecast-label' : run.result.status === 'anomaly' ? 'warning' : 'insufficient'; }
function link(run: CoolingRun): string { return maintenanceHref(run.vehicleId, run.id); }
export function CoolingSummary({ vehicle, runs, configuration }: { vehicle: Vehicle; runs: CoolingRun[]; configuration: ScenarioConfig }) {
  if (!isCoolingDemoVehicle(vehicle)) return null;
  const run = runs.find(r => r.vehicleId === vehicle.id && r.selected);
  const current = run && coolingMatchesSettings(run, configuration.assessmentTime, configuration.observationMaxAgeHours);
  const points = run ? [...run.result.included.map(r => r.coolantC), ...run.result.forecast.map(p => p.valueC)] : [];
  const min = Math.min(...points), range = Math.max(...points) - min || 1;
  const count = points.length, path = (start: number, end: number) => points.slice(start, end).map((v, i) => `${i ? 'L' : 'M'}${4 + (start + i) / Math.max(1, count - 1) * 128},${42 - (v - min) / range * 32}`).join(' ');
  const historicalCount = run?.result.included.length ?? 0;
  return <section className="cooling-summary" aria-label={`Cooling summary for ${vehicle.registration}`}>
    <a className="cooling-preview-link" data-maintenance-vehicle={vehicle.id} href={maintenanceHref(vehicle.id, run?.id)} aria-label={`Open maintenance for ${vehicle.registration} · cooling predictions`} aria-haspopup="dialog">
      <div className="cooling-preview-title"><span className="cooling-preview-icon"><Icon name="activity" /></span><div><span className="section-kicker">COOLING · SYNTHETIC DEMO</span><h3>{vehicle.registration} <span>Cooling system</span></h3><span className={`badge ${run && current ? tone(run) : 'insufficient'}`}>{run ? current ? coolingStatusLabels[run.result.status] : 'Settings changed · review needed' : 'No prediction yet'}</span></div></div>
      {count > 1 && <svg className="cooling-sparkline" viewBox="0 0 140 50" aria-hidden="true"><path d={path(0, historicalCount)} className="cooling-observed" /><path d={path(Math.max(0, historicalCount - 1), count)} className="cooling-forecast" /></svg>}
      <span className="cooling-preview-next">Predictions, next steps & service book <span aria-hidden="true">↗</span></span>
    </a>
  </section>;
}
export function CoolingNotifications({ dashboard, reload }: { dashboard: Dashboard; reload: Reload }) {
  const runs = (dashboard.coolingRuns ?? []).filter(r => r.warningId);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  async function read(run: CoolingRun) {
    setBusy(run.id); setError('');
    try { await coolingApi.read(run.id, dashboard.profile); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not mark notification as read.'); }
    finally { setBusy(''); }
  }
  return <section className="cooling-panel" aria-label="Cooling notifications"><div className="cooling-panel-heading"><div><span className="section-kicker">IN-APP ONLY · NO PUSH, EMAIL OR SMS</span><h2>Cooling notifications <span className="badge insufficient">{runs.filter(r => !r.notificationReadAt).length} unread</span></h2></div><a href="#predictive">Open scenarios →</a></div>
    {!runs.length && <p className="muted">No cooling notifications yet. Running a non-stable demo creates one retained notification per unique input snapshot.</p>}
    {runs.length > 0 && <details open><summary>Current and archived notifications · {runs.length}</summary>{runs.map(run => {
      const vehicle = dashboard.vehicles.find(v => v.id === run.vehicleId)!;
      const current = run.selected && coolingMatchesSettings(run, dashboard.assessmentTime, dashboard.configuration.observationMaxAgeHours);
      return <article className="cooling-notification" key={run.id}><div><span className={`badge ${tone(run)}`}>{coolingStatusLabels[run.result.status]}</span><span className="badge insufficient">{current ? 'Selected assessment' : 'Archived snapshot'}</span><h3>{vehicle.registration} · {vehicle.displayName}</h3><p>{run.result.explanation}</p><small>{formatUtc(run.configuration.assessmentTime)} · {run.notificationReadAt ? `Read ${formatUtc(run.notificationReadAt)}` : 'Unread'}</small></div><div className="cooling-notification-actions"><a href={link(run)}>View exact snapshot →</a>{!run.notificationReadAt && <button type="button" disabled={!!busy} onClick={() => read(run)}>{busy === run.id ? 'Saving…' : 'Mark as read'}</button>}</div></article>;
    })}</details>}{error && <p role="alert" className="error">{error}</p>}
    <p className="panel-note">Reading a notification does not clear its condition, complete a task or change forecast evidence.</p>
  </section>;
}
export function CoolingChart({ run, compact = false }: { run: CoolingRun; compact?: boolean }) {
  const [showHeldOut, setShowHeldOut] = useState(false);
  const r = run.result, c = run.configuration, hour = 3_600_000;
  const included = r.included.map(p => ({ at: p.observedAt, valueC: p.coolantC }));
  const targets = showHeldOut ? run.heldOut.map(p => ({ at: p.observedAt, valueC: p.coolantC })) : [];
  const points = [...included, ...r.forecast, ...targets];
  const cutoff = Date.parse(c.assessmentTime);
  const start = Math.min(cutoff - 24 * hour, ...points.map(p => Date.parse(p.at))), end = cutoff + c.horizonHours * hour;
  const low = Math.floor(Math.min(c.referenceC, ...points.map(p => p.valueC)) - 3), high = Math.ceil(Math.max(c.thresholdC, ...points.map(p => p.valueC)) + 3);
  const y = (v: number) => 242 - (v - low) / (high - low) * 202;
  const plot = (width: number) => {
    const right = width - 40, mobile = width < 500;
    const x = (at: string | number) => 58 + ((typeof at === 'number' ? at : Date.parse(at)) - start) / (end - start) * (right - 58);
    const path = (values: typeof points) => values.map((p, i) => `${i ? 'L' : 'M'}${x(p.at)},${y(p.valueC)}`).join(' ');
    return <svg className={mobile ? 'cooling-mobile-chart' : 'cooling-desktop-chart'} viewBox={`0 0 ${width} 300`} role="img" aria-label="Cooling history and computed projection. Solid teal: comparable synthetic observations. Dashed purple: forecast. Orange: fictional reference. Future evaluation points are hidden unless enabled.">
      <rect x={x(cutoff)} y="35" width={right - x(cutoff)} height="207" className="cooling-future" />
      {[0, 1, 2, 3, 4].map(i => { const v = low + (high - low) * i / 4; return <g key={i}><line x1="58" x2={right} y1={y(v)} y2={y(v)} className="cooling-grid" /><text x="49" y={y(v) + 4} textAnchor="end">{v.toFixed(1)}</text></g>; })}
      <text x="15" y="22">°C</text><line x1="58" x2={right} y1={y(c.thresholdC)} y2={y(c.thresholdC)} className="cooling-threshold" /><text x={right} y={y(c.thresholdC) - 6} textAnchor="end">{c.thresholdC} °C · demo reference</text>
      <line x1="58" x2={right} y1={y(c.referenceC)} y2={y(c.referenceC)} className="cooling-reference" />
      <line x1={x(cutoff)} x2={x(cutoff)} y1="35" y2="242" className="cooling-cutoff" /><text x={x(cutoff)} y="22" textAnchor="middle">{mobile ? 'Cutoff' : 'Assessment cutoff'}</text>
      <path d={path(included)} className="cooling-observed" />{included.map(p => <circle key={p.at} cx={x(p.at)} cy={y(p.valueC)} r="4" className="cooling-observed-dot"><title>{formatUtc(p.at)} · {p.valueC.toFixed(2)} °C · comparable synthetic observation</title></circle>)}
      <path d={path(r.forecast)} className="cooling-forecast" />
      {targets.map(p => <circle key={p.at} cx={x(p.at)} cy={y(p.valueC)} r="5" className="cooling-target"><title>Future synthetic evaluation target · {formatUtc(p.at)} · {p.valueC.toFixed(2)} °C · NOT used in forecast</title></circle>)}
      {[start, cutoff, end].map((at, i) => <text key={at} x={x(at)} y="266" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{mobile ? `${Math.round((at - cutoff) / hour)} h` : `${new Date(at).toISOString().slice(5, 16).replace('T', ' ')} UTC`}</text>)}
      <text x={width / 2} y="289" textAnchor="middle">{mobile ? 'Hours relative to assessment cutoff' : 'Historical sessions ← time → 72-hour synthetic projection'}</text>
    </svg>;
  };
  return <section className="cooling-panel cooling-chart-panel"><div className="cooling-panel-heading"><div><span className="section-kicker">COMPARABLE SESSIONS · NOT CONTINUOUS ENGINE TEMPERATURE</span><h3>Observed history & bounded projection</h3></div></div>
    <div className="cooling-chart-scroll">{plot(640)}{plot(360)}</div>
    <div className="cooling-legend"><span className="observed">● Observed · synthetic</span><span className="projected">┄ Computed forecast</span><span className="reference">— Demo reference</span>{showHeldOut && <span>○ Future evaluation targets</span>}</div>
    {!r.forecast.length && <p className="gap">Forecast withheld: {r.explanation}</p>}
    {!compact && <><label className="cooling-checkbox"><input type="checkbox" checked={showHeldOut} onChange={e => setShowHeldOut(e.target.checked)} /> Show future synthetic evaluation points — never used to fit the forecast</label>
    <p className="panel-note">The comparison window is fictional: warmed-up engine, {c.context.rpm} ± {c.context.rpmTolerance} rpm, {c.context.loadPct} ± {c.context.loadTolerance}% load and {c.context.ambientC} ± {c.context.ambientTolerance} °C ambient. Other contexts are excluded, not diagnosed. Exact UTC timestamps are available in the evidence table.</p></>}
  </section>;
}
function CoolingDetail({ run, vehicle, dashboard, reload }: { run: CoolingRun; vehicle: Vehicle; dashboard: Dashboard; reload: Reload }) {
  const r = run.result, c = run.configuration;
  const current = run.selected && coolingMatchesSettings(run, dashboard.assessmentTime, dashboard.configuration.observationMaxAgeHours);
  const warning: Warning | undefined = run.warningId ? vehicle.warnings.find(w => w.id === run.warningId) ?? { id: run.warningId, sourceType: 'computed_cooling', sourceRef: run.id, title: `Cooling · ${coolingStatusLabels[r.status]}`, explanation: r.explanation, createdAt: c.assessmentTime, active: current ? 1 : 0, current, simulated: false, supportingObservations: [] } : undefined;
  return <div className="cooling-detail"><section className="cooling-panel"><VehicleIdentity vehicle={vehicle} /><div className="cooling-panel-heading"><h2>{label(run)}</h2><span className={`badge ${tone(run)}`}>{coolingStatusLabels[r.status]}</span></div><p>{r.explanation}</p>
    {!current && <p className="gap">Archived snapshot, not the selected assessment under current settings. Its evidence is retained unchanged.</p>}
    <div className="cooling-metrics"><div><small>Projected demo-reference crossing</small><strong>{r.crossingAt ? formatUtc(r.crossingAt) : r.forecast.length ? 'None within 72-hour horizon' : 'Not estimated'}</strong></div><div><small>Comparable-session trend</small><strong>{r.slopeCPerDay === null ? 'Not estimated' : `${r.slopeCPerDay.toFixed(2)} °C / day`}</strong></div><div><small>Latest comparable data age</small><strong>{r.latestAgeHours === null ? 'No eligible reading' : `${r.latestAgeHours.toFixed(1)} h / ${c.maxAgeHours} h limit`}</strong></div></div>
    <p className="panel-note">SYNTHETIC CALCULATED DEMO · Not a diagnosis, safe-driving assessment, failure probability or time to engine failure. Current vehicle observations and their condition rules are separate.</p>
  </section>
  <CoolingChart key={run.id} run={run} />
  <section className="cooling-panel"><span className="section-kicker">FUTURE SYNTHETIC TARGETS · NOT REAL-WORLD ACCURACY</span><h3>Held-out evaluation vs a simple baseline</h3>{r.evaluation ? <><div className="cooling-metrics"><div><small>Forecast mean absolute error</small><strong>{r.evaluation.forecastMaeC.toFixed(3)} °C</strong></div><div><small>Keep-last-value baseline error</small><strong>{r.evaluation.persistenceMaeC.toFixed(3)} °C</strong></div><div><small>Synthetic warning lead time</small><strong>{r.evaluation.syntheticWarningLeadHours === null ? 'No applicable crossing' : `${r.evaluation.syntheticWarningLeadHours.toFixed(1)} h`}</strong></div></div><p className="panel-note">{r.evaluation.samples} future fixture points, excluded from fitting. Lead time is assessment cutoff to the first held-out sample meeting the reference, not a proven avoided breakdown. A small error on designed synthetic data is not evidence of generalisation.</p></> : <p className="muted">No forecast was issued, so prediction-error and lead-time metrics are not reported. Withholding is the expected behaviour for this example.</p>}</section>
  <section className="cooling-panel"><h3>Evidence & assumptions</h3><p className="panel-note">Ordinary least-squares linear fit to comparable-session temperature vs UTC time. Fictional healthy reference: {c.referenceC} °C; comparison reference: {c.thresholdC} °C. At least {c.minReadings} readings over {c.minSpanHours} h; maximum fit RMSE {c.maxFitRmseC} °C; maximum adjacent step {c.maxStepC} °C. Forecast is bounded to {c.horizonHours} h and assumes continued linear behaviour under unchanged conditions. No calibrated confidence interval is claimed.</p>
    <p className="panel-note">Assessment: {formatUtc(c.assessmentTime)} · Saved: {formatUtc(run.recordedAt)}<br />Method: {c.version}<br />Snapshot: <span className="cooling-hash">{run.id}</span><br />Input SHA-256: <span className="cooling-hash">{run.inputSha256}</span></p>
    <details><summary>Inspect input readings, exclusions and future targets</summary><div className="cooling-table-scroll"><table><caption>Isolated synthetic cooling data — not imported vehicle telemetry</caption><thead><tr><th>UTC time</th><th>Coolant °C</th><th>RPM / load / ambient</th><th>Use</th></tr></thead><tbody>{run.readings.map((reading, i) => <tr key={i}><td>{formatUtc(reading.observedAt)}</td><td>{reading.coolantC.toFixed(2)}</td><td>{reading.rpm} / {reading.loadPct}% / {reading.ambientC} °C</td><td>{r.excluded.find(e => e.reading.observedAt === reading.observedAt)?.reason ?? 'Historical comparable observation'}</td></tr>)}{run.heldOut.map((reading, i) => <tr key={`target-${i}`}><td>{formatUtc(reading.observedAt)}</td><td>{reading.coolantC.toFixed(2)}</td><td>{reading.rpm} / {reading.loadPct}% / {reading.ambientC} °C</td><td>Future synthetic evaluation target · never fitted</td></tr>)}</tbody></table></div></details>
    <a href="#settings">Export all cooling snapshots with the evidence report →</a>
  </section>
  {warning && <section className="cooling-panel"><h3>Choose a next step</h3><p className="panel-note">A task will link to this exact immutable snapshot, including when it is archived. Data-gap alerts may call for new measurements rather than a mechanical repair. Dates and priority are your choices.</p><details><summary>Plan a cooling-system check</summary><ActionForm key={run.id} vehicle={vehicle} warning={warning} profile={dashboard.profile} reload={reload} /></details><a href="#maintenance">Review tasks & record an inspection result →</a></section>}
  </div>;
}
export function CoolingWorkspace({ dashboard, reload }: { dashboard: Dashboard; reload: Reload }) {
  const runs = dashboard.coolingRuns ?? [];
  const vehicle = coolingDemoVehicles(dashboard)[0], vehicleId = vehicle?.id ?? '';
  const params = new URLSearchParams(window.location.search), requested = runs.find(r => r.id === params.get('coolingRun') && r.vehicleId === vehicleId);
  const [scenario, setScenario] = useState<CoolingScenario>('gradual');
  const [viewId, setViewId] = useState(requested?.id ?? ''), [savedRun, setSavedRun] = useState<CoolingRun | null>(null);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  const run = runs.find(r => r.id === viewId) ?? (savedRun?.id === viewId ? savedRun : null) ?? runs.find(r => r.vehicleId === vehicleId && r.selected);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setFeedback('');
    try { const result = await coolingApi.run({ profile: dashboard.profile, vehicleId, scenario }); setSavedRun(result); setViewId(result.id); await reload(); setFeedback('Cooling snapshot selected and saved. Identical inputs reuse the same evidence and notification. Vehicle observations were not changed.'); }
    catch (e) { setFeedback(e instanceof Error ? e.message : 'Could not run the example. Your selection is retained.'); }
    finally { setBusy(false); }
  }
  return <section className="cooling-workspace" aria-label="Predictive cooling workspace"><section className="cooling-panel cooling-intro"><span className="section-kicker">SCENARIO 1 · CALCULATED, NOT PRE-ENTERED</span><h2>See the trend. Understand the limits.</h2><p>Explore a bounded cooling-system projection using fictional comparable sessions. This is not live telemetry or a validated engine-failure predictor.</p>
    <form onSubmit={submit} className="cooling-run-form"><fieldset disabled={busy}><label>Demonstration vehicle<input readOnly value={vehicle ? `${vehicle.registration} · ${vehicle.displayName}` : 'Demonstration vehicle unavailable'} /></label><label>Cooling demo scenario<select value={scenario} onChange={e => setScenario(e.target.value as CoolingScenario)}>{coolingScenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label><button disabled={!vehicle}>{busy ? 'Calculating…' : 'Run cooling example'}</button></fieldset><p className="panel-note">One example vehicle only. Other vehicles do not receive simulated cooling assessments.</p><p className="panel-note">{coolingScenarios.find(s => s.id === scenario)!.description}</p><p className="panel-note">Uses saved assessment time {formatUtc(dashboard.assessmentTime)} and maximum data age {dashboard.configuration.observationMaxAgeHours} h. <a href="#settings">Change settings →</a> · Does not import or replace vehicle readings.</p>{feedback && <p role="status" className="form-feedback">{feedback}</p>}</form>
  </section>
  {vehicle && run ? <><CoolingSummary vehicle={vehicle} runs={runs} configuration={dashboard.configuration} /><details className="cooling-panel"><summary>Demonstration evidence & model evaluation</summary><CoolingDetail key={run.id} run={run} vehicle={vehicle} dashboard={dashboard} reload={reload} /></details></> : <div className="gap"><h3>No cooling snapshot for this vehicle yet</h3><p>Select an example and run it. Missing cooling-context history is not assumed normal.</p></div>}
  {vehicle && runs.some(r => r.vehicleId === vehicle.id) && <section className="cooling-panel"><h3>Saved snapshot history · {vehicle.registration}</h3><div className="cooling-history">{runs.filter(r => r.vehicleId === vehicle.id).map(r => <button type="button" key={r.id} className={run?.id === r.id ? 'selected' : ''} onClick={() => setViewId(r.id)}><strong>{label(r)}</strong><span>{coolingStatusLabels[r.result.status]}</span><small>{formatUtc(r.configuration.assessmentTime)}{r.selected ? ' · selected' : ' · archived'}</small></button>)}</div><p className="panel-note">Viewing an old snapshot does not activate it. Run the same example/settings to select it again without duplicate evidence.</p></section>}
  <CoolingNotifications dashboard={dashboard} reload={reload} />
  </section>;
}
