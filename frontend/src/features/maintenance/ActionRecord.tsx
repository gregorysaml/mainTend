import type { MaintenanceAction, Vehicle } from '../../../../shared/types.ts';
import { dueStatus, sortMaintenance } from '../../../../shared/maintenance.ts';
import { formatUtc } from '../../utils/date.ts';
import { ScheduleForm, UpdateForm, type Reload } from './ActionForms.tsx';
import './maintenance.css';
import { InspectionPanel } from './InspectionPanel.tsx';
import { maintenanceHref } from '../predictive/presentation.ts';

export function ActionRecord({ action, assessmentTime, reload, warningTitle, vehicleId }: { action: MaintenanceAction; assessmentTime: string; reload: Reload; warningTitle?: string; vehicleId?: string }) {
  const due = dueStatus(action, assessmentTime);
  return <article className="maintenance-task" aria-label={`Maintenance action ${action.id}`}>
    <div className="task-heading"><div><span className="section-kicker">TASK #{action.id}</span><h3>{action.task}</h3></div><span className={`badge ${action.status === 'completed' ? 'ok' : 'insufficient'}`}>{action.status}</span></div>
    <div className="task-schedule"><span className={`badge priority-${action.priority ?? 'normal'}`}>{action.priority ?? 'normal'} priority</span><span className={`badge due-${due.replaceAll(' ', '-')}`}>{due === 'closed' ? 'Schedule closed' : due}</span><span className="task-due-date">{action.dueDate ? `Due ${action.dueDate}` : 'No due date'}</span>{action.assignedTo && <span className="task-assignee">Assigned: {action.assignedTo}</span>}</div>
    {action.outcome && <p className="task-outcome"><strong>Task completion / outcome note:</strong> {action.outcome}</p>}
    {action.warningId.startsWith('WARN-COOLING-') && <p className="panel-note"><a href={vehicleId ? maintenanceHref(vehicleId, action.warningId.slice('WARN-COOLING-'.length)) : `?profile=${action.actorProfile}&coolingRun=${encodeURIComponent(action.warningId.slice('WARN-COOLING-'.length))}#predictive`}>View the original cooling snapshot & graph →</a> · Retained decision evidence, not a new assessment.</p>}
    {action.warningId.startsWith('WARN-LUBRICATION-') && vehicleId && <p className="panel-note"><a href={maintenanceHref(vehicleId, action.warningId.slice('WARN-LUBRICATION-'.length), 'predictions', 'lubrication')}>View the original lubrication snapshot & graph →</a> · Retained decision evidence, not a new assessment.</p>}
    <InspectionPanel action={action} warningTitle={warningTitle} reload={reload} />
    {due !== 'closed' && <div className="task-editors"><details><summary>Edit date & priority</summary><ScheduleForm action={action} reload={reload} /></details><details><summary>Update action status</summary><UpdateForm action={action} reload={reload} /></details></div>}
    <details className="task-history"><summary>Evidence & history ({action.history.length})</summary><p className="panel-note">Warning: {action.warningId}. Completing a task does not clear its warning.</p><ol>{action.history.map((entry, index) => <li key={index}><small>{formatUtc(entry.changedAt)}</small><strong>{entry.status}</strong><p>{entry.note}</p><small>{entry.priority ? `${entry.priority} priority · ${entry.dueDate ? `due ${entry.dueDate}` : 'unscheduled'}` : 'Legacy entry · schedule not recorded'}</small></li>)}</ol></details>
  </article>;
}

export function VehicleMaintenancePlan({ vehicle, assessmentTime, reload }: { vehicle: Vehicle; assessmentTime: string; reload: Reload }) {
  const pending = vehicle.actions.filter(action => action.status === 'planned' || action.status === 'in progress');
  return <section className="vehicle-maintenance-plan" aria-label={`Maintenance plan ${vehicle.registration}`}><div className="plan-heading"><h3>Maintenance plan <span>{pending.length} open</span></h3><a href="#maintenance">All maintenance →</a></div><p className="panel-note">Schedule as of {assessmentTime.slice(0, 10)} UTC · dates and priorities selected by the user.</p>{pending.length ? sortMaintenance(pending, assessmentTime).map(action => <ActionRecord key={action.id} vehicleId={vehicle.id} action={action} warningTitle={vehicle.warnings.find(w => w.id === action.warningId)?.title} assessmentTime={assessmentTime} reload={reload} />) : <p className="muted">No open tasks for this vehicle. Choose a next step from a warning to create one.</p>}</section>;
}
