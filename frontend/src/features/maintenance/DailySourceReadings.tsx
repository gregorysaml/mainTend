import {useEffect,useState} from 'react';
import type {ForecastInput} from '../../../../shared/forecast.ts';
import type {ServiceFunction} from '../../../../shared/service.ts';

export function DailySourceReadings({base,query,functionId,channelId,revision}:{base:string;query:string;functionId:ServiceFunction;channelId?:string;revision:number}){
  const [series,setSeries]=useState<{id:string;input:ForecastInput}[]>([]),[error,setError]=useState('');
  useEffect(()=>{let active=true;setSeries([]);setError('');
    fetch(`${base}/capabilities/inputs${query}&function=${functionId}`).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}).then(data=>{if(active)setSeries(data);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[base,query,functionId,revision]);
  const input=series.find(s=>s.id===channelId)?.input;
  return <details className="daily-source-readings"><summary>Latest source observations</summary>{error?<p role="alert">{error}</p>:input?<><p>{input.source} · {input.dataOrigin}<br/>Reference: {input.reference} {input.unit} · {input.referenceSource}</p>{input.points.length?<div className="daily-table-scroll"><table><caption>Latest eight stored observations; earlier history remains retained.</caption><thead><tr><th>Observed at · UTC</th><th>Value</th><th>Distance / model axis</th><th>Segment</th></tr></thead><tbody>{input.points.slice(-8).reverse().map(p=><tr key={p.id}><td>{new Date(p.observedAt).toLocaleString('en-GB',{timeZone:'UTC'})}</td><td>{Number(p.value.toFixed(4))} {input.unit}</td><td>{Number(p.x.toFixed(2))} {input.xUnit}</td><td>{p.segment===input.segment?'Current':'Earlier'}</td></tr>)}</tbody></table></div>:<p>No numerical history is available. An attributed provider estimate, when present, is retained separately.</p>}</>:<p>Loading stored source evidence…</p>}</details>;
}
