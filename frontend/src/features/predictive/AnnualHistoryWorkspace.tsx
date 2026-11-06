import {useEffect,useId,useState} from 'react';
import type {Dashboard} from '../../../../shared/types.ts';
import type {AnnualSeries,StoredAnnualHistory} from '../../../../shared/annual-history.ts';
import type {ForecastRun} from '../../../../shared/forecast.ts';
import {ActionForm} from '../maintenance/ActionForms.tsx';
import './annual-history.css';

async function read<T>(url:string,body?:unknown):Promise<T>{
  const response=await fetch(url,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Request failed.');return result;
}
const date=(at:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}).format(new Date(at));
const numeric=(n:number)=>new Intl.NumberFormat('en-GB',{maximumFractionDigits:3}).format(n);

export function AnnualHistoryWorkspace({dashboard,reload}:{dashboard:Dashboard;reload:()=>Promise<void>}){
  const [vehicleId,setVehicleId]=useState(dashboard.vehicles[0]?.id??'');
  const [history,setHistory]=useState<StoredAnnualHistory|null>(),[seriesId,setSeriesId]=useState('tyres-0');
  const [runs,setRuns]=useState<ForecastRun[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [range,setRange]=useState(0),[tablePage,setTablePage]=useState(0);
  const base=`/api/vehicles/${encodeURIComponent(vehicleId)}`,profile=dashboard.profile;
  useEffect(()=>{
    let active=true;setHistory(undefined);setRuns([]);setError('');setTablePage(0);
    Promise.all([read<StoredAnnualHistory|null>(`${base}/annual-history?profile=${profile}`),read<ForecastRun[]>(`${base}/selected-forecasts?profile=${profile}`)])
      .then(([data,saved])=>{if(active){setHistory(data);setRuns(saved);}}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[base,profile]);
  const series=history?.series.find(s=>s.id===seriesId)??history?.series[0];
  const current=series?.input.points.filter(p=>p.segment===series.input.segment)??[];
  const points=series?.input.points.filter(p=>!range||Date.parse(p.observedAt)>=Date.parse(history!.periodEnd)-range*86400000)??[];
  const selected=runs.find(r=>r.input.evidenceReference===`${history?.version}/${vehicleId}`&&r.input.segment===series?.input.segment&&r.input.functionId===series?.input.functionId&&r.input.points[0]?.wheelPosition===series?.input.points[0]?.wheelPosition);
  const vehicle=dashboard.vehicles.find(v=>v.id===vehicleId)!;
  const warning=vehicle.warnings.find(w=>w.id===selected?.warningId);
  async function evaluate(){
    if(!series)return;setBusy(true);setError('');
    try{setRuns(await read<ForecastRun[]>(`${base}/annual-history/evaluate?profile=${profile}`,{seriesId:series.id}));await reload();}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  const rows=[...points].reverse();
  return <section className="annual-history" aria-label="One-year predictive maintenance history">
    <div className="annual-heading"><div><span className="section-kicker">12 MONTHS · SYNTHETIC DEMONSTRATION</span><h2>One year of vehicle history</h2><p>See long-term changes, maintenance boundaries and the observations used for the next estimate.</p></div><label>Vehicle<select disabled={busy} value={vehicleId} onChange={e=>setVehicleId(e.target.value)}>{dashboard.vehicles.map(v=><option key={v.id} value={v.id}>{v.registration} · {v.displayName}</option>)}</select></label></div>
    <p className="annual-notice">All readings and service events here are constructed examples. They are separate from the original vehicle measurements and reported service book. More synthetic history does not establish real predictive accuracy or verified compatibility.</p>
    {error&&<p role="alert" className="error">{error}</p>}
    {history===undefined&&!error&&<p role="status">Loading the saved one-year history…</p>}
    {history===null&&<p>No annual dataset is stored for this vehicle. Restart the updated local server to initialise the constructed history.</p>}
    {history&&series&&<>
      <div className="annual-summary"><div><small>Stored period · UTC</small><strong>{date(history.periodStart)} – {date(history.periodEnd)}</strong></div><div><small>All available signals</small><strong>{history.series.reduce((sum,s)=>sum+s.input.points.length,0).toLocaleString('en-GB')} readings</strong></div><div><small>Current forecast segment</small><strong>{current.length} comparable readings</strong><span>{current[0]&&date(current[0].observedAt)} – {current.at(-1)&&date(current.at(-1)!.observedAt)}</span></div></div>
      <div className="annual-controls"><label>History<select disabled={busy} value={series.id} onChange={e=>{setSeriesId(e.target.value);setTablePage(0);}}>{history.series.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label><label>Visible period<select value={range} onChange={e=>{setRange(Number(e.target.value));setTablePage(0);}}><option value={0}>Full year</option><option value={90}>Last 90 days</option><option value={30}>Last 30 days</option></select></label></div>
      <HistoryChart series={series} points={points}/>
      <p className="annual-legend"><span>━ Current fitting segment</span><span>┄ Earlier segments, excluded from this fit</span><span>│ Constructed maintenance event</span></p>
      <p>Showing {points.length} stored readings in {series.input.unit}. Gaps remain missing; lines only connect recorded points. The chart shows observations, with any forecast reported separately below.</p>
      <div className="annual-estimate"><h3>Estimate from the latest eligible segment</h3><p>The full year provides context. Inflation, oil service and DPF cleaning start separate segments; earlier cycles are retained without being fitted together. Assessment: {dashboard.assessmentTime}.</p>
        <button disabled={busy} onClick={evaluate}>{busy?'Evaluating…':'Evaluate saved history'}</button>
        {selected&&<div role="status"><h4>{selected.result.status}</h4>{selected.assessedAt!==dashboard.assessmentTime&&<p className="error">This saved result uses an earlier assessment. Evaluate again to check freshness.</p>}<p>{selected.result.reason}</p>{selected.result.crossingAfter!==undefined&&<p className="annual-result">Reference crossing after <strong>{numeric(selected.result.crossingAfter)} {selected.input.xUnit==='day'?'days':'km'}</strong> from the last eligible observation.<br/><small>Declared fixture bounds: {numeric(selected.result.lower!)}–{numeric(selected.result.upper!)} {selected.input.xUnit==='day'?'days':'km'}. Not calibrated predictive confidence.</small></p>}<p>Last-value baseline: {selected.result.baseline===undefined?'Unavailable':`${numeric(selected.result.baseline)} ${selected.input.unit}`}. Origin: {selected.result.origin}.</p>{warning&&<details><summary>{profile==='fleet'?'Assign a follow-up':'Record a chosen response'}</summary><ActionForm vehicle={vehicle} warning={warning} profile={profile} reload={reload}/></details>}<a href="#maintenance">Review saved tasks and outcomes →</a></div>}
      </div>
      <details><summary>Recorded maintenance boundaries ({series.input.events?.length??0})</summary><ul>{series.input.events?.map(e=><li key={`${e.type}-${e.observedAt}`}><strong>{date(e.observedAt)} · {e.type}</strong> — {e.evidence}</li>)}</ul></details>
      <details><summary>Exact observations and source evidence ({points.length})</summary><div className="table-scroll"><table><thead><tr><th>Observed at · UTC</th><th>Value</th><th>{series.input.xUnit==='km'?'Odometer · km':'Day'}</th><th>Forecast use</th><th>Source record</th></tr></thead><tbody>{rows.slice(tablePage*40,(tablePage+1)*40).map(p=><tr key={p.id}><td>{p.observedAt}</td><td>{p.value} {series.input.unit}</td><td>{p.x}</td><td>{p.segment===series.input.segment?'Current segment':'Earlier segment · excluded'}</td><td>{p.id}<br/>{p.contextEvidence}</td></tr>)}</tbody></table></div><div className="annual-controls"><button disabled={!tablePage} onClick={()=>setTablePage(p=>p-1)}>Newer readings</button><span>Page {tablePage+1} of {Math.max(1,Math.ceil(rows.length/40))}</span><button disabled={(tablePage+1)*40>=rows.length} onClick={()=>setTablePage(p=>p+1)}>Older readings</button></div></details>
      <details><summary>Assumptions and unavailable functions</summary><p>{history.description}</p><p>{series.input.referenceSource}. Fixture reference: {series.input.reference} {series.input.unit}. Forecast horizon: {series.input.horizon} {series.input.xUnit}. Minimum history: {series.input.policy.minPoints} points and {series.input.policy.minSpan} {series.input.xUnit}.</p><ul>{history.unavailable.map(item=><li key={item.label}><strong>{item.label}:</strong> {item.reason}</li>)}</ul><p>Dataset saved {history.createdAt}; source identifier {history.inputSha256}. Changing the assessment does not silently regenerate or refresh the historical source times.</p></details>
      <p><a href={`/api/evidence?profile=${profile}&format=json`}>Download saved vehicle evidence including the annual history</a></p>
    </>}
  </section>;
}

function HistoryChart({series,points}:{series:AnnualSeries;points:AnnualSeries['input']['points']}){
  const id=useId();if(!points.length)return <p>No observations in this period.</p>;
  const w=960,h=300,left=65,right=935,top=28,bottom=245;
  const start=Date.parse(points[0].observedAt),end=Date.parse(points.at(-1)!.observedAt);
  const values=[series.input.reference,...points.map(p=>p.value)],min=Math.min(...values),max=Math.max(...values),padding=Math.max((max-min)*0.12,0.03);
  const x=(at:string)=>left+(Date.parse(at)-start)/(end-start||1)*(right-left),y=(value:number)=>bottom-(value-min+padding)/(max-min+2*padding)*(bottom-top);
  const groups=new Map<string,typeof points>();for(const point of points){const group=groups.get(point.segment)??[];group.push(point);groups.set(point.segment,group);}
  return <div className="annual-chart-scroll"><svg className="annual-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-labelledby={`${id}-title ${id}-desc`}><title id={`${id}-title`}>{series.label} · constructed annual history</title><desc id={`${id}-desc`}>{points.length} observations from {date(points[0].observedAt)} to {date(points.at(-1)!.observedAt)}. Separate lines mark maintenance cycles. Solid teal is the current segment; muted dashed lines show earlier segments. Exact values are available in the table.</desc>
    {[0,1,2,3,4].map(k=>{const value=min-padding+(max-min+2*padding)*k/4;return <g key={k}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--line)"/><text x={left-10} y={y(value)+4} textAnchor="end">{numeric(value)}</text></g>;})}
    <text x={left} y={16}>{series.input.unit}</text><line x1={left} x2={right} y1={y(series.input.reference)} y2={y(series.input.reference)} stroke="var(--amber)" strokeDasharray="6 4"/><text x={right} y={y(series.input.reference)-7} textAnchor="end">Fictional planning reference · {series.input.reference} {series.input.unit}</text>
    {series.input.events?.filter(e=>Date.parse(e.observedAt)>=start&&Date.parse(e.observedAt)<=end).map(e=><line key={e.observedAt} x1={x(e.observedAt)} x2={x(e.observedAt)} y1={top} y2={bottom} stroke="var(--text-muted)" strokeOpacity="0.5" strokeDasharray="3 5"><title>{date(e.observedAt)} · {e.type} · constructed event</title></line>)}
    {[...groups].map(([segment,group])=><polyline key={segment} points={group.map(p=>`${x(p.observedAt)},${y(p.value)}`).join(' ')} fill="none" stroke={segment===series.input.segment?'var(--action)':'var(--text-muted)'} strokeWidth={segment===series.input.segment?2.5:1.5} strokeOpacity={segment===series.input.segment?1:0.6} strokeDasharray={segment===series.input.segment?undefined:'4 3'}/>)}
    {points.map(p=><circle key={p.id} cx={x(p.observedAt)} cy={y(p.value)} r={points.length>100?1.5:3} fill={p.segment===series.input.segment?'var(--action)':'var(--text-muted)'}><title>{p.observedAt}: {p.value} {series.input.unit} · {p.segment}</title></circle>)}
    {[0,1,2,3,4].map(k=>{const at=new Date(start+(end-start)*k/4).toISOString();return <text key={k} x={x(at)} y={270} textAnchor={k===0?'start':k===4?'end':'middle'}>{date(at)}</text>;})}
    <text x={(left+right)/2} y={295} textAnchor="middle">Observed time · UTC · constructed readings only</text>
  </svg></div>;
}
