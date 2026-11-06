import { useEffect, useState } from 'react';
import type { Vehicle, Warning } from '../../../../shared/types.ts';
import { ActionForm, type Reload } from './ActionForms.tsx';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Icon } from '../../components/Icon.tsx';
import { warningOrigin } from '../../utils/warning-origin.ts';
export function TaskDialog({ vehicle, warning, reload, onClose }: { vehicle: Vehicle; warning: Warning; reload: Reload; onClose: () => void }) {
  const [dirty,setDirty] = useState(false), [busy,setBusy] = useState(false), [confirm,setConfirm] = useState(false);
  function requestClose() { if (busy) return; if (dirty) setConfirm(true); else onClose(); }
  useEffect(() => { if (!dirty && !busy) return; const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue=''; }; window.addEventListener('beforeunload',guard); return () => window.removeEventListener('beforeunload',guard); },[dirty,busy]);
  return <Dialog open onOpenChange={value => { if (!value) requestClose(); }}><DialogContent className="task-dialog" onEscapeKeyDown={e => { e.preventDefault(); requestClose(); }} onPointerDownOutside={e => e.preventDefault()}><header className="records-header"><div><span className="section-kicker">PLAN A RESPONSE · {vehicle.registration}</span><DialogTitle>Plan a maintenance action</DialogTitle><DialogDescription>{vehicle.displayName} · {vehicle.makeModel}</DialogDescription></div><Button variant="secondary" size="icon" aria-label="Close task planner" disabled={busy} onClick={requestClose}><Icon name="close" /></Button></header><div className="task-dialog-concern"><Badge tone={warningOrigin(warning).tone}>{warningOrigin(warning).label}</Badge><strong>{warning.title}</strong><small>Original warning: {warning.id}</small></div><div className="task-dialog-body"><ActionForm key={warning.id} vehicle={vehicle} warning={warning} profile={vehicle.profile} reload={reload} onDirtyChange={setDirty} onBusyChange={setBusy} /></div><footer className="task-dialog-footer">{confirm ? <><p role="alert">Discard the unsaved task draft? Saved records stay.</p><div><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>Keep editing</Button><Button variant="secondary" disabled={busy} onClick={onClose}>Discard draft & close</Button></div></> : <><small>{busy ? 'Saving…' : dirty ? 'Unsaved draft' : 'Recorded task only · no automatic dispatch or booking'}</small><Button variant="secondary" disabled={busy} onClick={requestClose}>Done</Button></>}</footer></DialogContent></Dialog>;
}
