import { Button } from '../../components/ui/button.tsx';
import { useEffect, useState, type FormEvent } from 'react';
import type { ActionStatus, MaintenanceAction, Profile, Vehicle, Warning } from '../../../../shared/types.ts';
import type { MaintenancePriority } from '../../../../shared/maintenance.ts';
import { api, maintenanceApi } from '../../api/client.ts';
import './maintenance.css';

export type Reload = () => Promise<void>;
const message = (error: unknown) => error instanceof Error ? error.message : 'Could not save; please retry.';

function ScheduleFields({ date, priority, setPriority }: { date: string; priority: MaintenancePriority; setPriority: (value: MaintenancePriority) => void }) {
  // Read the native date from FormData at submit. Its visible value must not
  // depend on browser-specific date-picker change-event timing during rerenders.
  return <><label>Due date (optional)<input key={date} name="dueDate" type="date" min="1900-01-01" max="9999-12-31" defaultValue={date} /></label><label>Priority<select value={priority} onChange={event => setPriority(event.target.value as MaintenancePriority)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label></>;
}

export function ActionForm({ vehicle, warning, profile, reload, initialTask = '', onDirtyChange, onBusyChange }: { vehicle: Vehicle; warning: Warning; profile: Profile; reload: Reload; initialTask?: string; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void }) {
  const [task, setTask] = useState(initialTask), [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState<MaintenancePriority>('normal');
  const [feedback, setFeedback] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setFeedback(''); setBusy(true); onBusyChange?.(true);
    const form = event.currentTarget;
    const date = String(new FormData(form).get('dueDate') ?? '');
    try {
      await api.createAction({ task, assignedTo: profile === 'fleet' ? assignedTo : undefined, note: profile === 'owner' ? assignedTo : undefined, vehicleId: vehicle.id, warningId: warning.id, actorProfile: profile, dueDate: date || null, priority });
      form.reset(); setTask(''); setAssignedTo(''); setPriority('normal');
      onDirtyChange?.(false);
      await reload(); setFeedback('Planned action saved. Open Maintenance to review its schedule.');
    } catch (error) { setFeedback(message(error)); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  return <form className="maintenance-form create-maintenance" onSubmit={submit} onChange={() => onDirtyChange?.(true)}>
    <fieldset disabled={busy} className="create-action-fields">
    <label>{profile === 'fleet' ? 'Maintenance task' : 'Chosen next step'}<input required value={task} onChange={event => setTask(event.target.value)} placeholder="What needs to be done?" /></label>
    <label>{profile === 'fleet' ? 'Assigned role' : 'Optional note'}<input required={profile === 'fleet'} value={assignedTo} onChange={event => setAssignedTo(event.target.value)} /></label>
    <ScheduleFields date="" priority={priority} setPriority={setPriority} />
    <p className="schedule-guidance">Date and priority are user-selected, not an inferred service interval or fault prediction. Leave the date empty for an unscheduled task.</p>
    <Button disabled={busy}>{busy ? 'Saving…' : 'Save planned action'}</Button></fieldset>{feedback && <p className="form-feedback" role="status">{feedback}</p>}
  </form>;
}

export function UpdateForm({ action, reload }: { action: MaintenanceAction; reload: Reload }) {
  const [status, setStatus] = useState<ActionStatus>('in progress'), [note, setNote] = useState(''), [outcome, setOutcome] = useState('');
  const [feedback, setFeedback] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setFeedback(''); setBusy(true);
    try { await api.updateAction(action.id, { status, note, outcome }); setNote(''); setOutcome(''); await reload(); setFeedback('Action status saved.'); }
    catch (error) { setFeedback(message(error)); }
    finally { setBusy(false); }
  }
  return <form className="maintenance-form" onSubmit={submit}>
    <label>Action status<select value={status} onChange={event => setStatus(event.target.value as ActionStatus)}><option>in progress</option><option>completed</option><option>cancelled</option></select></label>
    <label>Status note<input required value={note} onChange={event => setNote(event.target.value)} /></label>
    <label className="form-wide">Task completion / outcome note<input required={status === 'completed'} value={outcome} onChange={event => setOutcome(event.target.value)} placeholder="Required when completed" /></label>
    <p className="schedule-guidance">This note records task progress, not a structured inspection verdict. Record that separately under Reported inspection.</p>
    <Button disabled={busy}>{busy ? 'Saving…' : 'Update status'}</Button>{feedback && <p className="form-feedback" role="status">{feedback}</p>}
  </form>;
}

export function ScheduleForm({ action, reload }: { action: MaintenanceAction; reload: Reload }) {
  const [priority, setPriority] = useState<MaintenancePriority>(action.priority ?? 'normal');
  const [note, setNote] = useState(''), [feedback, setFeedback] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { setPriority(action.priority ?? 'normal'); }, [action.priority]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFeedback(''); setBusy(true);
    const date = String(new FormData(event.currentTarget).get('dueDate') ?? '');
    try { await maintenanceApi.schedule(action.id, { dueDate: date || null, priority, note }); setNote(''); await reload(); setFeedback('Schedule saved; previous entries retained in history.'); }
    catch (error) { setFeedback(message(error)); }
    finally { setBusy(false); }
  }
  return <form className="maintenance-form" onSubmit={submit}><ScheduleFields date={action.dueDate ?? ''} priority={priority} setPriority={setPriority} /><label className="form-wide">Schedule change note<input required maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="Why is the schedule changing?" /></label><Button disabled={busy}>{busy ? 'Saving…' : 'Save schedule'}</Button>{feedback && <p className="form-feedback" role="status">{feedback}</p>}</form>;
}
