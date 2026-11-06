import { useEffect, useState } from 'react';
import type { Dashboard } from '../../../../shared/types.ts';
import { dueStatus, sortMaintenance } from '../../../../shared/maintenance.ts';
import { VehicleIdentity } from '../../components/VehicleIdentity.tsx';
import { ActionRecord } from './ActionRecord.tsx';
import type { Reload } from './ActionForms.tsx';
import './maintenance.css';
import { needsInspection } from '../../../../shared/inspection.ts';
import { CoolingSummary } from '../predictive/CoolingWorkspace.tsx';
import { MaintenancePredictionsDialog } from '../predictive/MaintenancePredictionsDialog.tsx';
import { LubricationSummary } from '../predictive/LubricationWorkspace.tsx';
import { coolingDemoVehicles, lubricationDemoVehicles, readMaintenanceRequest, resolveMaintenanceRequest } from '../predictive/presentation.ts';

export function MaintenanceWorkspace({ dashboard, reload }: { dashboard: Dashboard; reload: Reload }) {
  const [filter, setFilter] = useState('all');
  const [request, setRequest] = useState(() => readMaintenanceRequest(window.location.hash));
  useEffect(() => { const navigate = () => setRequest(readMaintenanceRequest(window.location.hash)); window.addEventListener('hashchange', navigate); return () => window.removeEventListener('hashchange', navigate); }, []);
  const detail = request ? resolveMaintenanceRequest(dashboard, request) : null;
  function closeDetails() { const url = new URL(window.location.href); url.hash = 'maintenance'; window.history.replaceState(null, '', url); setRequest(null); }
  const all = dashboard.vehicles.flatMap(vehicle => vehicle.actions);
  const overdue = all.filter(action => dueStatus(action, dashboard.assessmentTime) === 'overdue').length;
  const soon = all.filter(action => ['due soon', 'due today'].includes(dueStatus(action, dashboard.assessmentTime))).length;
  const open = all.filter(action => dueStatus(action, dashboard.assessmentTime) !== 'closed').length;
  const matches = (action: typeof all[number]) => filter === 'all' || (filter === 'inspection' && needsInspection(action)) || (filter === 'open' && dueStatus(action, dashboard.assessmentTime) !== 'closed') || (filter === 'overdue' && dueStatus(action, dashboard.assessmentTime) === 'overdue') || (filter === 'soon' && ['due soon', 'due today'].includes(dueStatus(action, dashboard.assessmentTime))) || (filter === 'closed' && dueStatus(action, dashboard.assessmentTime) === 'closed');
  const count = all.filter(matches).length;
  return <section className="maintenance-v3" aria-label="Maintenance scheduling">
    {detail?.error && <p role="alert" className="error">{detail.error} <button type="button" className="fleet-reset" onClick={closeDetails}>Dismiss</button></p>}
    {request && detail && !detail.error && <MaintenancePredictionsDialog key={`${request.system ?? 'cooling'}:${detail.vehicle.id}:${detail.run?.id ?? detail.lubricationRun?.id ?? 'none'}`} vehicle={detail.vehicle} run={detail.run} lubricationRun={detail.lubricationRun} system={request.system} dashboard={dashboard} reload={reload} initialView={request.view} onClose={closeDetails} />}
    <div className="summary-grid"><div className="summary-card"><div><small>Open tasks</small><strong>{open}</strong></div></div><div className="summary-card"><div><small>Overdue</small><strong>{overdue}</strong></div></div><div className="summary-card"><div><small>Due today / next 7 days</small><strong>{soon}</strong></div></div></div>
    <div className="maintenance-preview-heading"><div><span className="section-kicker">VEHICLE CARE</span><h2>Predictions & next steps</h2></div><a href="#predictive">Demonstration controls →</a></div>
    <div className="maintenance-preview-list">{coolingDemoVehicles(dashboard).map(vehicle => <CoolingSummary key={`cooling-${vehicle.id}`} vehicle={vehicle} runs={dashboard.coolingRuns ?? []} configuration={dashboard.configuration} />)}{lubricationDemoVehicles(dashboard).map(vehicle => <LubricationSummary key={`lubrication-${vehicle.id}`} vehicle={vehicle} runs={dashboard.lubricationRuns ?? []} configuration={dashboard.configuration} />)}</div>
    <div className="maintenance-toolbar"><div><h2>Maintenance schedule & inspections</h2><p>As of <strong>{dashboard.assessmentTime.slice(0, 10)} UTC</strong> (saved assessment date, not the live clock). <a href="#settings">Change assessment time →</a></p><p>Dates and priorities are user-selected. No workshop booking, external reminder or manufacturer service interval is inferred.</p><p>{all.filter(needsInspection).length} tasks have no reported inspection or need further investigation, including completed tasks. Cancelled tasks are excluded. This is a follow-up list, not a risk score.</p></div><label>Maintenance filter<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All tasks</option><option value="open">Open tasks</option><option value="overdue">Overdue</option><option value="soon">Due today / next 7 days</option><option value="closed">Completed / cancelled</option><option value="inspection">Inspection / follow-up needed</option></select></label></div>
    <div className="schedule-layout"><p className="panel-note" role="status">Showing {count} of {all.length} tasks. Within each vehicle: due state, date, priority, then task ID.</p>
    {dashboard.vehicles.filter(vehicle => vehicle.actions.some(matches)).map(vehicle => <section className="vehicle maintenance-vehicle" key={vehicle.id}><VehicleIdentity vehicle={vehicle} />{sortMaintenance(vehicle.actions.filter(matches), dashboard.assessmentTime).map(action => <ActionRecord key={action.id} vehicleId={vehicle.id} action={action} warningTitle={vehicle.warnings.find(w => w.id === action.warningId)?.title} assessmentTime={dashboard.assessmentTime} reload={reload} />)}</section>)}
    {!count && <div className="gap"><strong>{all.length ? 'No tasks match this filter' : 'No maintenance tasks recorded'}</strong><p>{all.length ? 'Choose another filter to see the saved tasks.' : 'Open a warning to record a task with an optional due date and priority.'}</p>{all.length ? <button className="fleet-reset" onClick={() => setFilter('all')}>Show all tasks</button> : <a href="#warnings">Review warnings →</a>}</div>}
    </div>
  </section>;
}
