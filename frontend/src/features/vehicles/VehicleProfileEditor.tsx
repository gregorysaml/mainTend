import { Button } from '../../components/ui/button.tsx';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog.tsx';
import { Icon } from '../../components/Icon.tsx';
import type { Tyre, Vehicle } from '../../../../shared/types.ts';
import { tyrePositions, type ProfileChange } from '../../../../shared/vehicle-profile.ts';
import { vehicleApi } from '../../api/client.ts';
import type { Reload } from '../maintenance/ActionForms.tsx';
import { prepareVehiclePhoto } from './photo.ts';
import { formatUtc } from '../../utils/date.ts';
import './vehicle-profile-editor.css';

const sections: ProfileChange['section'][] = ['mileage', 'service', 'tyres', 'equipment', 'photo'];
const utcLocal = (time: string) => time.slice(0, 16);
const toUtc = (value: string) => value + (value.length === 16 ? ':00.000Z' : 'Z');
const today = () => new Date().toISOString().slice(0, 10);
function Field({ label, name, value, type = 'text', max, step }: { label: string; name: string; value?: string | number; type?: string; max?: number | string; step?: string }) {
  return <label>{label}<input name={name} type={type} defaultValue={value} required min={type === 'number' ? 0 : type === 'date' ? '1900-01-01' : undefined} max={max} step={step} maxLength={type === 'text' ? 100 : undefined} /></label>;
}
function ProfileForm({ vehicle, section, reload, saved, changed, saving, locked }: { vehicle: Vehicle; section: ProfileChange['section']; reload: Reload; saved: (section: ProfileChange['section'], message: string) => void; changed: () => void; saving: (busy: boolean) => void; locked: boolean }) {
  const details = vehicle.details!;
  const [rows, setRows] = useState<Tyre[]>(details.tyres);
  const [photo, setPhoto] = useState<string | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [message, setMessage] = useState('');
  const photoRequest = useRef(0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked) return; const form = event.currentTarget; const data = new FormData(form);
    const get = (key: string) => String(data.get(key) ?? '');
    let change: ProfileChange;
    if (section === 'mileage') change = { section, value: { kilometres: Number(get('kilometres')), recordedAt: toUtc(get('recordedAt')) } };
    else if (section === 'service') change = { section, value: { lastServiceAt: get('lastServiceAt'), lastServiceKm: Number(get('lastServiceKm')) } };
    else if (section === 'equipment') change = { section, value: get('equipment').split('\n').map(v => v.trim()).filter(Boolean) };
    else if (section === 'tyres') change = { section, value: rows.map(t => {
      const read = (key: string) => get(`${t.position}.${key}`);
      return { position: t.position, brand: read('brand'), model: read('model'), size: read('size'), season: read('season'), dotCode: read('dotCode'), installedAt: read('installedAt'), installedKm: Number(read('installedKm')), pressureBar: Number(read('pressureBar')), treadMm: Number(read('treadMm')), measuredAt: toUtc(read('measuredAt')), lastRotationAt: read('lastRotationAt') };
    }) };
    else {
      if (photo === undefined) { setMessage('Choose a new photo or explicitly remove the saved photo.'); return; }
      change = { section: 'photo', value: photo === null ? null : { dataUrl: photo, description: get('description') } };
    }
    setBusy(true); saving(true); setMessage('');
    try { await vehicleApi.save(vehicle.id, { ...change, profile: vehicle.profile, revision: vehicle.profileRevision ?? 0, note: get('note') }); saved(section, `Saved ${section} for ${vehicle.registration}.`); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed. Your draft is retained.'); }
    finally { setBusy(false); saving(false); }
  }
  function addTyre() {
    const position = tyrePositions.find(p => !rows.some(t => t.position === p));
    if (position) { changed(); setRows([...rows, { position, brand: '', model: '', size: '', season: '', dotCode: '', installedAt: today(), installedKm: 0, pressureBar: 0, treadMm: 0, measuredAt: new Date().toISOString(), lastRotationAt: today() }]); }
  }
  return <form className="profile-edit-form" onSubmit={submit} onChange={changed} aria-label={`Edit ${section} ${vehicle.registration}`}>
    <fieldset className="profile-form-content" disabled={locked}>
    {section === 'mileage' && <><p className="panel-note">Add a reading; existing records cannot be overwritten. Mileage must not decrease over time. Times are UTC, not local time.</p><div className="profile-fields"><Field label="New mileage (km)" name="kilometres" type="number" max={2_000_000} step="1" /><Field label="Recorded at (UTC)" name="recordedAt" type="datetime-local" value={utcLocal(new Date().toISOString())} /></div></>}
    {section === 'service' && <><p className="panel-note">Record the latest service, not a service-due prediction. Add mileage first if needed.</p><div className="profile-fields"><Field label="Last service date" name="lastServiceAt" type="date" value={details.lastServiceAt} max={today()} /><Field label="Mileage at service (km)" name="lastServiceKm" type="number" value={details.lastServiceKm} max={2_000_000} step="1" /></div></>}
    {section === 'equipment' && <label>Equipment — one entry per line (up to 40)<textarea name="equipment" rows={7} defaultValue={details.equipment.join('\n')} maxLength={3240} /><small>Saving an empty list removes the current equipment entries; the previous list remains in the change history.</small></label>}
    {section === 'tyres' && <><p className="panel-note">Recorded values only, not recommended pressures, live TPMS or a safety verdict. Saving replaces the current tyre list; previous records remain in the change history.</p>{rows.map(t => <fieldset key={t.position}><legend>{t.position}</legend><div className="profile-fields">{(['brand', 'model', 'size', 'season', 'dotCode'] as const).map(key => <Field key={key} label={key === 'dotCode' ? 'DOT week/year (WWYY)' : key[0].toUpperCase() + key.slice(1)} name={`${t.position}.${key}`} value={t[key]} />)}<Field label="Installation date" name={`${t.position}.installedAt`} value={t.installedAt} type="date" max={today()} /><Field label="Installation mileage (km)" name={`${t.position}.installedKm`} value={t.installedKm} type="number" step="1" max={2_000_000} /><Field label="Recorded pressure (bar)" name={`${t.position}.pressureBar`} value={t.pressureBar} type="number" step="0.01" max={10} /><Field label="Recorded tread (mm)" name={`${t.position}.treadMm`} value={t.treadMm} type="number" step="0.01" max={30} /><Field label="Measured at (UTC)" name={`${t.position}.measuredAt`} value={utcLocal(t.measuredAt)} type="datetime-local" /><Field label="Last rotation date" name={`${t.position}.lastRotationAt`} value={t.lastRotationAt} type="date" max={today()} /></div><Button variant="secondary" type="button" className="profile-secondary" onClick={() => { changed(); setRows(rows.filter(row => row.position !== t.position)); }}>Remove {t.position} record</Button></fieldset>)}{!rows.length && <p className="muted">No tyre records. Add a position to record one.</p>}<Button variant="secondary" type="button" className="profile-secondary" disabled={rows.length === 4} onClick={addTyre}>Add tyre position</Button></>}
    {section === 'photo' && <><p className="panel-note">Local upload only: JPEG, PNG or WebP up to 5 MB. Resized to 1280 px and stripped of metadata in your browser; stored with this vehicle, not sent to an image service.</p><label>Choose vehicle photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy || busy} onChange={async event => {
      const file = event.target.files?.[0]; const ticket = ++photoRequest.current; if (!file) return;
      setPhotoBusy(true); saving(true); setMessage('');
      try { const prepared = await prepareVehiclePhoto(file); if (ticket === photoRequest.current) setPhoto(prepared); }
      catch (error) { if (ticket === photoRequest.current) setMessage(error instanceof Error ? error.message : 'The image could not be decoded.'); }
      finally { if (ticket === photoRequest.current) { setPhotoBusy(false); saving(false); } }
    }} /></label>{photoBusy && <p role="status">Preparing photo…</p>}{(photo ?? (photo === undefined ? details.photoUrl : undefined)) && <img className="profile-photo-preview" src={photo ?? details.photoUrl} alt="Vehicle photo preview — not saved until you submit" />}{photo !== null && <Field label="Photo description" name="description" value={details.photoUrl?.startsWith('data:') ? details.photoDescription : ''} />}<Button variant="secondary" type="button" className="profile-secondary" disabled={photoBusy || busy} onClick={() => { changed(); setPhoto(null); setMessage('Photo will be removed when you save.'); }}>Remove saved photo</Button></>}
    <label>Reason / change note<textarea name="note" required maxLength={1000} rows={2} placeholder="What did you record or change?" /></label><Button className="profile-save" disabled={busy || photoBusy}>{busy ? 'Saving…' : `Save ${section}`}</Button>
    </fieldset>{message && <p role="status" className="profile-feedback">{message}</p>}
  </form>;
}
export function VehicleProfileEditor({ vehicle, reload, compact = false }: { vehicle: Vehicle; reload: Reload; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState<Set<ProfileChange['section']>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const titleId = useId(); const descriptionId = useId();
  function close() { if (busy) return; setOpen(false); setConfirmClose(false); setDirty(new Set()); }
  function requestClose() { if (busy) return; if (dirty.size) setConfirmClose(true); else close(); }
  if (!vehicle.details) return null;
  return <Dialog open={open} onOpenChange={value => { if (!value) requestClose(); }}><div className={`profile-editor${compact ? ' profile-editor-compact' : ''}`}><Button variant="secondary" type="button" className="profile-open" aria-label={`Edit vehicle profile · ${vehicle.registration}`} aria-haspopup="dialog" onClick={() => { setSavedMessage(''); setOpen(true); }}>{compact ? 'Edit profile' : `Edit vehicle profile · ${vehicle.registration}`}<span aria-hidden="true">↗</span></Button>{open && <DialogContent className="profile-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onEscapeKeyDown={event => { event.preventDefault(); requestClose(); }} onPointerDownOutside={event => event.preventDefault()}>
    <header className="profile-dialog-header"><div><span className="section-kicker">VEHICLE PROFILE · {vehicle.profile === 'fleet' ? 'FLEET' : 'OWNER'}</span><DialogTitle asChild><h2 id={titleId}>Edit vehicle profile</h2></DialogTitle><p>{vehicle.displayName} · <strong>{vehicle.registration}</strong> · {vehicle.makeModel}</p></div><Button variant="secondary" type="button" className="profile-close" aria-label="Close vehicle profile" disabled={busy} onClick={requestClose}><Icon name="close" /></Button></header>
    <div className="profile-dialog-body"><DialogDescription asChild><p id={descriptionId} className="panel-note">All vehicle details in one place. Save each section separately; drafts in other sections stay here until you close. Synthetic baseline + unverified user entries, not live measurements or a change to the condition assessment.</p></DialogDescription>{savedMessage && <p role="status" className="profile-feedback">{savedMessage}</p>}
      {sections.map(section => <section className={`profile-edit-section profile-section-${section}`} key={section} aria-label={`${section} section`}><h3>{section === 'mileage' ? 'Mileage records' : section === 'service' ? 'Last recorded service' : section === 'tyres' ? 'Tyre records' : section === 'equipment' ? 'Equipment' : 'Vehicle photo'}</h3><ProfileForm key={`${vehicle.id}-${vehicle.profileHistory?.find(h => h.section === section)?.id ?? 0}-${section}`} vehicle={vehicle} section={section} reload={reload} locked={busy} saving={setBusy} changed={() => setDirty(current => new Set(current).add(section))} saved={(savedSection, message) => { setSavedMessage(message); setDirty(current => { const next = new Set(current); next.delete(savedSection); return next; }); }} /></section>)}
      <details className="profile-history"><summary>Profile change history ({vehicle.profileHistory?.length ?? 0})</summary>{!vehicle.profileHistory?.length && <p className="muted">No user-entered changes yet.</p>}{vehicle.profileHistory?.map(h => <article key={h.id}><strong>{h.section} · user entered</strong><small>{formatUtc(h.changedAt)}</small><p>{h.note}</p><details><summary>Before / after record</summary><pre>{JSON.stringify({ before: h.before, after: h.after }, null, 2)}</pre></details></article>)}</details>
    </div><footer className="profile-dialog-footer">{confirmClose ? <><p role="alert">Discard unsaved changes? Saved records will stay.</p><div><Button variant="secondary" type="button" className="profile-secondary" disabled={busy} onClick={() => setConfirmClose(false)}>Keep editing</Button><Button variant="secondary" type="button" className="profile-secondary" disabled={busy} onClick={close}>Discard drafts & close</Button></div></> : <><p>{busy ? 'Saving / preparing photo…' : dirty.size ? `${dirty.size} section(s) with unsaved changes` : 'Each section saves independently.'}</p><Button variant="secondary" type="button" className="profile-secondary" disabled={busy} onClick={requestClose}>Done</Button></>}</footer>
  </DialogContent>}</div></Dialog>;
}
