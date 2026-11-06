import { Button } from '../../components/ui/button.tsx';
import { useEffect, useId, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog.tsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs.tsx';
import { Icon } from '../../components/Icon.tsx';
import type { Dashboard, Vehicle } from '../../../../shared/types.ts';
import { coolingMatchesSettings, coolingStatusLabels, type CoolingRun } from '../../../../shared/cooling.ts';
import type { LubricationRun } from '../../../../shared/lubrication.ts';
import { formatUtc } from '../../utils/date.ts';
import { latestOdometer } from '../../utils/vehicle-identity.ts';
import { ActionForm, type Reload } from '../maintenance/ActionForms.tsx';
import { CoolingChart } from './CoolingWorkspace.tsx';
import { coolingAdvice, lubricationAdvice, maintenanceViews, type MaintenanceView, type PredictiveSystem } from './presentation.ts';
import { LubricationPredictions } from './LubricationWorkspace.tsx';
import './cooling-dialog.css';

function Predictions({ run, dashboard }: { run?: CoolingRun; dashboard: Dashboard }) {
  if (!run) return <div className="maintenance-empty"><h3>No cooling prediction yet</h3><p>This vehicle has no saved cooling example. Missing data is not treated as normal.</p><a href="#predictive">Open demonstration controls →</a></div>;
  const result = run.result, config = run.configuration;
  const current = run.selected && coolingMatchesSettings(run, dashboard.assessmentTime, dashboard.configuration.observationMaxAgeHours);
  return <><div className="maintenance-prediction-heading"><span className={`badge ${result.status === 'deteriorating' ? 'forecast-label' : result.status === 'anomaly' ? 'warning' : 'insufficient'}`}>{coolingStatusLabels[result.status]}</span><small>{formatUtc(config.assessmentTime)}</small></div>
    {!current && <p className="maintenance-archive">Saved snapshot · not current under the selected assessment/settings.</p>}
    <div className="maintenance-prediction-metrics"><div><small>Demo reference crossing</small><strong>{result.crossingAt ? formatUtc(result.crossingAt) : result.forecast.length ? 'None within 72 hours' : 'Not estimated'}</strong></div><div><small>Comparable-session trend</small><strong>{result.slopeCPerDay === null ? 'Not estimated' : `${result.slopeCPerDay.toFixed(2)} °C/day`}</strong></div></div>
    <CoolingChart key={run.id} run={run} compact />
    <details className="maintenance-model-details"><summary>Why this result? · model & evidence</summary><p>{result.explanation}</p><p>{result.included.length} comparable inputs · latest age {result.latestAgeHours?.toFixed(1) ?? 'unknown'} h / {config.maxAgeHours} h limit. Fictional window: warmed-up, {config.context.rpm} ±{config.context.rpmTolerance} rpm, {config.context.loadPct} ±{config.context.loadTolerance}% load, {config.context.ambientC} ±{config.context.ambientTolerance} °C ambient.</p><p>Linear comparable-session projection, bounded to {config.horizonHours} hours. Demo reference {config.thresholdC} °C, not an OEM limit. No calibrated confidence interval or failure probability.</p>
      <p className="cooling-hash">Method: {config.version}<br />Snapshot: {run.id}<br />Input hash: {run.inputSha256}</p>
      {result.evaluation && <p>Synthetic held-out evaluation only: forecast error {result.evaluation.forecastMaeC.toFixed(3)} °C; keep-last-value baseline {result.evaluation.persistenceMaeC.toFixed(3)} °C. Targets are future fixture values, never fitted inputs; not real-world predictive accuracy.</p>}
      {result.excluded.length > 0 && <ul>{result.excluded.map((e, i) => <li key={i}>{formatUtc(e.reading.observedAt)}: {e.reason}</li>)}</ul>}
      <a href="#settings">Export full evidence →</a>
    </details></>;
}
function ServiceBook({ vehicle }: { vehicle: Vehicle }) {
  const actions = [...vehicle.actions].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id - a.id);
  return <section className="maintenance-service-book"><h3>Service book</h3><p className="maintenance-detail-note">Recorded service and task history. Not a verified workshop certificate.</p>
    {vehicle.details ? <article className="service-book-entry"><div><span className="section-kicker">LAST RECORDED SERVICE</span><h4>{vehicle.details.lastServiceAt}</h4></div><strong>{vehicle.details.lastServiceKm.toLocaleString('en-GB')} km</strong><p>Vehicle-profile record · synthetic baseline or unverified user entry.</p></article> : <p className="maintenance-empty">No recorded service details.</p>}
    {!!vehicle.profileHistory?.some(h => h.section === 'service') && <details className="service-record-changes"><summary>Service-record changes</summary><p className="maintenance-detail-note">Edits and corrections to the last-service record, not independently verified workshop visits.</p>{vehicle.profileHistory.filter(h => h.section === 'service').map(h => <article key={h.id}><strong>{formatUtc(h.changedAt)} · user entered</strong><p>{h.note}</p><pre>{JSON.stringify({ before: h.before, after: h.after }, null, 2)}</pre></article>)}</details>}
    <h4>Maintenance records · {actions.length}</h4>
    {!actions.length && <p className="maintenance-empty">No maintenance tasks recorded for this vehicle yet.</p>}
    {actions.map(action => <article className="service-book-entry" key={action.id}><div><span className="section-kicker">TASK #{action.id} · {formatUtc(action.updatedAt)}</span><h4>{action.task}</h4></div><span className="badge insufficient">{action.status}</span><p>{action.dueDate ? `Due ${action.dueDate}` : 'Unscheduled'} · {action.priority ?? 'normal'} priority{action.assignedTo ? ` · ${action.assignedTo}` : ''}</p>{action.outcome && <p>Reported outcome: {action.outcome}</p>}{action.inspections?.[0] && <p>Latest reported inspection: {action.inspections[0].result} · {formatUtc(action.inspections[0].inspectedAt)}</p>}<details><summary>Task & inspection history</summary>{action.history.map((h, i) => <p key={i}>{formatUtc(h.changedAt)} · {h.status}<br />{h.note}</p>)}{action.inspections?.map(i => <p key={i.id}>{formatUtc(i.inspectedAt)} · {i.result} · {i.reportedBy}<br />{i.notes} · unverified user report</p>)}</details></article>)}
  </section>;
}
export function MaintenancePredictionsDialog({ vehicle, run, lubricationRun, system = 'cooling', dashboard, reload, initialView, onClose }: { vehicle: Vehicle; run?: CoolingRun; lubricationRun?: LubricationRun; system?: PredictiveSystem; dashboard: Dashboard; reload: Reload; initialView: MaintenanceView; onClose: () => void }) {
  const [view, setView] = useState<MaintenanceView>(initialView), [planning, setPlanning] = useState(false);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [confirmClose, setConfirmClose] = useState(false);
  const headingId = useId(), descriptionId = useId();
  const pendingHref = useRef<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const snapshot = system === 'lubrication' ? lubricationRun : run;
  const advice = system === 'lubrication' ? lubricationAdvice(lubricationRun, dashboard) : coolingAdvice(run, dashboard), odometer = latestOdometer(vehicle);
  const warning = vehicle.warnings.find(w => w.id === snapshot?.warningId);
  const titles: Record<MaintenanceView, string> = { predictions: 'Predictions', recommendations: 'Recommendations', service: 'Service book' };
  useEffect(() => { body.current?.scrollTo(0, 0); }, [view]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  function close() { if (busy) return; onClose(); if (pendingHref.current) window.location.hash = pendingHref.current; }
  function requestClose() { if (busy) return; if (dirty) setConfirmClose(true); else close(); }
  return <Dialog open onOpenChange={open => { if (!open) requestClose(); }}><DialogContent className="cooling-maintenance-dialog" aria-labelledby={headingId} aria-describedby={descriptionId} onEscapeKeyDown={e => { e.preventDefault(); requestClose(); }} onPointerDownOutside={e => e.preventDefault()} onClickCapture={e => {
    const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    if (busy) { e.preventDefault(); return; }
    if (dirty) { e.preventDefault(); pendingHref.current = anchor.getAttribute('href'); setConfirmClose(true); }
  }}>
    <header className="maintenance-detail-header"><div><span className="section-kicker">MAINTENANCE · {vehicle.registration}</span><DialogTitle asChild><h2 id={headingId}>{vehicle.displayName}</h2></DialogTitle><p>{vehicle.makeModel}{odometer ? ` · ${odometer.kilometres.toLocaleString('en-GB')} km` : ' · mileage not recorded'}</p></div><Button variant="secondary" type="button" className="maintenance-dialog-close" aria-label="Close maintenance details" disabled={busy} onClick={requestClose}><Icon name="close" /></Button></header>
    <DialogDescription asChild><p id={descriptionId} className="maintenance-detail-disclaimer">{system === 'lubrication' ? 'Engine lubrication · oil pressure' : 'Cooling'} · synthetic demo, not a diagnosis or safe-driving assessment.</p></DialogDescription>
    <p className="maintenance-concern"><strong>{vehicle.registration}</strong> · {warning?.title ?? advice.title}{vehicle.actions.find(action => action.warningId === snapshot?.warningId && action.assignedTo)?.assignedTo ? ` · Assigned: ${vehicle.actions.find(action => action.warningId === snapshot?.warningId && action.assignedTo)?.assignedTo}` : ''}</p>
    <Tabs className="maintenance-tabs-root" value={view} onValueChange={value => { if (!busy) setView(value as MaintenanceView); }}><TabsList aria-label="Vehicle maintenance details">{maintenanceViews.map(item => <TabsTrigger key={item} value={item} disabled={busy}>{titles[item]}</TabsTrigger>)}</TabsList>
    <div className="maintenance-detail-body" ref={body}>
      <TabsContent value="predictions" forceMount hidden={view !== 'predictions'}>{system === 'lubrication' ? <LubricationPredictions run={lubricationRun} dashboard={dashboard} /> : <Predictions run={run} dashboard={dashboard} />}</TabsContent>
      <TabsContent value="recommendations" forceMount hidden={view !== 'recommendations'}><span className="section-kicker">SUGGESTED DEMO NEXT STEP</span><h3>{advice.title}</h3><p className="maintenance-advice">{advice.text}</p><p className="maintenance-detail-note">No automatic diagnosis, parts replacement, workshop booking or task completion. Date and priority remain your choice.</p>
        {advice.task && warning && !planning && <Button type="button" className="maintenance-primary" onClick={() => setPlanning(true)}>Plan this check</Button>}
        {planning && warning && <ActionForm vehicle={vehicle} warning={warning} profile={dashboard.profile} reload={reload} initialTask={advice.task ?? ''} onDirtyChange={setDirty} onBusyChange={setBusy} />}
        {!!vehicle.actions.filter(a => a.warningId === snapshot?.warningId && ['planned', 'in progress'].includes(a.status)).length && <p className="maintenance-detail-note">An open task already links to this snapshot. Review it in Service book before creating another.</p>}
      </TabsContent>
      <TabsContent value="service" forceMount hidden={view !== 'service'}><ServiceBook vehicle={vehicle} /></TabsContent>
    </div></Tabs>
    <footer className="maintenance-detail-footer">{confirmClose ? <><p role="alert">Discard the unsaved task draft? Saved records will stay.</p><div><Button type="button" disabled={busy} onClick={() => { pendingHref.current = null; setConfirmClose(false); }}>Keep editing</Button><Button type="button" disabled={busy} onClick={close}>Discard draft & close</Button></div></> : <><span>{busy ? 'Saving…' : dirty ? 'Unsaved task draft' : 'Your records. Clearer next steps.'}</span><div>{view !== 'service' && <Button type="button" disabled={busy} onClick={() => setView(view === 'predictions' ? 'recommendations' : 'service')}>{view === 'predictions' ? 'Next: Recommendations' : 'Next: Service book'} →</Button>}<Button type="button" disabled={busy} onClick={requestClose}>Done</Button></div></>}</footer>
  </DialogContent></Dialog>;
}
