import {useEffect,useState} from 'react';
import type {ForecastRun} from '../../../../shared/forecast.ts';
import type {Vehicle,Warning} from '../../../../shared/types.ts';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../../components/ui/dialog.tsx';
import {Button} from '../../components/ui/button.tsx';
import {Icon} from '../../components/Icon.tsx';
import {warningOrigin} from '../../utils/warning-origin.ts';
import {Badge} from '../../components/ui/badge.tsx';
import {formatUtc} from '../../utils/date.ts';

export function SelectedEvidenceDialog({vehicle,warning,onClose}:{vehicle:Vehicle;warning:Warning;onClose:()=>void}){
  const [run,setRun]=useState<ForecastRun>(),[error,setError]=useState(''),[page,setPage]=useState(0);
  useEffect(()=>{let active=true;setRun(undefined);setError('');fetch(`/api/vehicles/${encodeURIComponent(vehicle.id)}/selected-forecasts/${warning.selectedEvidence?.runId}?profile=${vehicle.profile}`).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(active)setRun(data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[vehicle.id,vehicle.profile,warning.id]);
  const points=run?.input.points??[],latest=warning.selectedEvidence?.latestSourceAt;
  return <Dialog open onOpenChange={value=>{if(!value)onClose();}}><DialogContent className="records-dialog">
    <header className="records-header"><div><span className="section-kicker">EXACT DECISION EVIDENCE · {vehicle.registration}</span><DialogTitle>{warning.title}</DialogTitle><DialogDescription>Saved input and result. Task progress does not resolve the underlying condition.</DialogDescription></div><Button variant="secondary" size="icon" aria-label="Close decision evidence" onClick={onClose}><Icon name="close"/></Button></header>
    <div className="records-body"><Badge tone={warningOrigin(warning).tone}>{warningOrigin(warning).label}</Badge><p>{warning.selectedEvidence?.statusReason}</p>{error&&<p role="alert" className="error">{error}</p>}{!run&&!error&&<p role="status">Loading the saved snapshot…</p>}
      {run&&<><p>{run.result.reason}</p><dl><dt>Origin</dt><dd>{run.result.origin} · {run.input.source}</dd><dt>Assessment</dt><dd>{formatUtc(run.assessedAt)}</dd><dt>Source time</dt><dd>{latest?formatUtc(latest):'Not available'}</dd><dt>Method</dt><dd>{run.result.methodVersion}</dd><dt>Recorded reference</dt><dd>{run.input.reference} {run.input.unit} · {run.input.referenceSource}</dd></dl>
      {run.result.crossingAfter!==undefined&&<p>Conditional reference crossing after {run.result.crossingAfter.toFixed(3)} {run.input.xUnit}. Declared bounds: {run.result.lower?.toFixed(3)}–{run.result.upper?.toFixed(3)}. No failure time is inferred.</p>}
      {run.result.forecastValue!==undefined&&<p>Conditional capacity outlook: {run.result.forecastValue.toFixed(3)}%; declared bounds {run.result.lower?.toFixed(3)}–{run.result.upper?.toFixed(3)}%. This does not prescribe replacement.</p>}
      {run.result.marginMinutes!==undefined&&<p>Charging margin: {run.result.marginMinutes} minutes. Target: {run.input.charging?.estimateTarget}. A response does not confirm source-reported charging completion.</p>}
      <h3>Saved observations ({points.length})</h3>{!points.length&&<p>The source estimate/session is retained in the evidence below.</p>}
      {!!points.length&&<><div className="table-scroll"><table><thead><tr><th>Source time</th><th>Value</th><th>Use in fit</th></tr></thead><tbody>{points.slice(page*30,(page+1)*30).map(p=><tr key={p.id}><td>{formatUtc(p.observedAt)}</td><td>{p.value} {run.input.unit}</td><td>{p.segment===run.input.segment?'Selected segment':'Earlier segment · excluded'}</td></tr>)}</tbody></table></div><div style={{display:'flex',gap:12,alignItems:'center'}}><Button variant="secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page+1} of {Math.ceil(points.length/30)}</span><Button variant="secondary" disabled={(page+1)*30>=points.length} onClick={()=>setPage(p=>p+1)}>Next</Button></div></>}
      <details><summary>Full source, assumptions and immutable snapshot</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(run,null,2)}</pre></details></>}
    </div>
  </DialogContent></Dialog>;
}
