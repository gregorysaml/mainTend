import {useEffect,useState} from 'react';
import type {CapabilityCard} from '../../../../shared/capabilities.ts';
import type {Profile} from '../../../../shared/types.ts';
import './capabilities.css';

export function CapabilitySummary({vehicleId,profile,assessmentTime}:{vehicleId:string;profile:Profile;assessmentTime:string}){
  const [card,setCard]=useState<CapabilityCard>(),[failed,setFailed]=useState(false);
  useEffect(()=>{let active=true;setCard(undefined);setFailed(false);
    fetch(`/api/vehicles/${encodeURIComponent(vehicleId)}/capabilities?profile=${profile}`).then(async r=>{if(!r.ok)throw new Error('Check unavailable');return r.json() as Promise<CapabilityCard>;}).then(c=>{if(active)setCard(c);}).catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;};
  },[vehicleId,profile,assessmentTime]);
  return <section className="capability-summary"><span className="section-kicker">CAPABILITIES & CARE</span><h3>What applies to this vehicle?</h3>
    {card?<ul>{card.functions.map(f=><li key={f.functionId}><span>{f.label}</span><strong>{f.supportStatus==='supported'?`Demo · ${f.readiness}`:f.supportStatus}</strong></li>)}</ul>:<p>{failed?'Verification incomplete. Review the capability card.':'Checking recorded support and data…'}</p>}
    <small>Constructed data. Real vehicle compatibility is unverified.</small><a href={`#service?vehicle=${encodeURIComponent(vehicleId)}`}>Open capabilities & everyday care →</a>
  </section>;
}
