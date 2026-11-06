import {createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {serviceFunctions,type ServiceFunction} from '../../../shared/service.ts';
import {functionNames,functionApplicability,type CapabilityCard,type CapabilityChannel,type FunctionCapability,type CapabilityDisclosure} from '../../../shared/capabilities.ts';
import {calculateSelected} from '../predictive/selected.ts';
import {functionInputs,sourceSettings,vehicleConfiguration} from './capability-data.ts';

export function capabilityCard(db:DatabaseSync,id:string,assessmentTime:string,fail=false):CapabilityCard{
  if(fail)throw new Error('Capability refresh failed; verification is incomplete.');
  const vehicle=vehicleConfiguration(db,id),assessed=Date.parse(assessmentTime);
  const functions:FunctionCapability[]=serviceFunctions.map(fn=>{
    const applicability=functionApplicability(vehicle.configuration.fuelType,fn),settings=sourceSettings(db,id,fn);
    const binding=db.prepare('SELECT * FROM capability_bindings WHERE vehicle_id=? AND function_id=?').get(id,fn) as any;
    const bound=binding?.configuration_hash===vehicle.configuration.fingerprint;
    const support=applicability.status==='not applicable'?'not applicable':applicability.status!=='applicable'?'awaiting verification':settings.mode==='unsupported'?'unsupported':settings.mode==='unverified'||!bound?'awaiting verification':'supported';
    const channels:CapabilityChannel[]=functionInputs(db,id,fn,assessmentTime).map(s=>{
      const input=s.input,points=(input.points??[]).filter(p=>p.segment===input.segment),latest=points.reduce<string|undefined>((t,p)=>!t||Date.parse(p.observedAt)>Date.parse(t)?p.observedAt:t,undefined);
      const sourceTimes=input.charging?[input.charging.stateObservedAt,input.charging.issuedAt]:input.providerEstimate?[input.providerEstimate.issuedAt]:latest?[latest]:[];
      const c:CapabilityChannel={id:s.id,label:s.label,status:'missing',reason:'No required source observations are recorded.',latestAt:sourceTimes[0],points:points.length,requiredPoints:input.charging||input.providerEstimate?0:input.policy.minPoints};
      if(settings.feed!=='available')return {...c,status:'missing',reason:settings.feed==='paused'?'The demonstration feed is paused; retained readings do not imply a working connection.':'Required access permission is missing.'};
      if(!sourceTimes.length)return c;
      if(sourceTimes.some(t=>!Number.isFinite(Date.parse(t))||Date.parse(t)>assessed))return {...c,status:'unavailable',reason:'Source time is invalid or after the saved assessment.'};
      if(sourceTimes.some(t=>assessed-Date.parse(t)>input.policy.maxAgeHours*3600000))return {...c,status:'stale',reason:`Latest required source data exceed this function’s ${input.policy.maxAgeHours} h age limit.`};
      if(!input.charging&&!input.providerEstimate&&points.length<input.policy.minPoints)return {...c,status:'insufficient history',reason:`${points.length} comparable points are stored; at least ${input.policy.minPoints} are required in the current segment.`};
      const evaluation=structuredClone(input);delete evaluation.currentConcern;
      try{const result=calculateSelected(evaluation,assessmentTime);return {...c,status:result.status==='withheld'?'unavailable':'ready',reason:result.status==='withheld'?result.reason:'The recorded demonstration data meet the function-specific checks. This is data readiness, not a healthy-vehicle verdict.'};}
      catch(e){return {...c,status:'unavailable',reason:e instanceof Error?e.message:'Source validation failed.'};}
    });
    let readiness:FunctionCapability['readiness']=channels.every(c=>c.status==='ready')?'ready':channels.some(c=>c.status==='ready')?'partial':channels.some(c=>c.status==='stale')?'stale':channels.some(c=>c.status==='insufficient history')?'insufficient history':channels.every(c=>c.status==='missing')?'missing':'unavailable';
    if(support!=='supported')readiness='unavailable';
    const reason=support==='not applicable'?applicability.reason:support==='unsupported'?'The selected source is recorded as unsupported for this function.':support==='awaiting verification'?settings.mode==='unverified'?'Manual/provider configuration entries are unverified. No real vehicle support is confirmed.':!bound&&binding?'Vehicle configuration changed since the demonstration source was associated. Review it before evaluation.':'No configuration-specific source evidence is established.':readiness==='ready'?'Required demonstration data are available and current under the saved assessment.':readiness==='partial'?`${channels.filter(c=>c.status==='ready').length} of ${channels.length} channels are ready; inspect individual wheels before forecasting.`:channels.find(c=>c.status!=='ready')?.reason??'Required data are unavailable.';
    const nextStep=support==='not applicable'?'Review the recorded vehicle configuration if it is incorrect.':support==='unsupported'?'Select a source that supplies the required signal.':support==='awaiting verification'?'Verify the exact configuration and source. A catalogue entry or manual statement is not verified coverage.':settings.feed!=='available'?'Restore the demonstration feed or required permission.':readiness==='stale'?'Supply newer observations or review the saved assessment time.':readiness==='missing'||readiness==='insufficient history'?'Collect additional comparable observations in the current segment.':readiness==='unavailable'?'Review source units, context, reference and intervention boundaries.':'Review the evidence and current warnings before planning.';
    return {functionId:fn,label:functionNames[fn],applicability:applicability.status,supportStatus:support,supportLabel:support==='supported'?'Supported in demonstration only':support,supportReason:applicability.reason,supportCheckedAt:support==='supported'?binding?.checked_at:undefined,evidenceReference:support==='supported'?binding?.evidence_reference:undefined,readiness,reason,nextStep,latestAt:channels.map(c=>c.latestAt).filter((t):t is string=>!!t).sort((a,b)=>Date.parse(b)-Date.parse(a))[0],channels,settings,canEvaluate:support==='supported'&&['ready','partial'].includes(readiness),dataOrigin:settings.mode==='demo'?'constructed fixture':'unverified user entry'};
  });
  const body={...vehicle,assessedAt:assessmentTime,functions};
  const signature=createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const previous=db.prepare('SELECT * FROM capability_card_history WHERE vehicle_id=? ORDER BY id DESC LIMIT 1').get(id) as any;
  if(previous?.signature===signature)return JSON.parse(previous.card_json);
  const checkedAt=new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');try{
    const inserted=db.prepare('INSERT INTO capability_card_history(vehicle_id,signature,card_json,checked_at) VALUES(?,?,?,?)').run(id,signature,'{}',checkedAt);
    const card:CapabilityCard={...body,checkedAt,revision:Number(inserted.lastInsertRowid)};
    db.prepare('UPDATE capability_card_history SET card_json=? WHERE id=?').run(JSON.stringify(card),card.revision);
    db.exec('COMMIT');return JSON.parse(JSON.stringify(card)) as CapabilityCard;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
export function discloseCapabilities(db:DatabaseSync,id:string,stage:unknown,assessmentTime:string,fail=false):CapabilityDisclosure{
  if(!['During use','Before purchase','Before proposed payment'].includes(String(stage)))throw new Error('Select a disclosure stage.');
  if(fail)throw new Error('Capability refresh failed; verification is incomplete. Previous disclosures are retained.');
  const card=capabilityCard(db,id,assessmentTime),prior=db.prepare('SELECT card_json FROM capability_disclosures WHERE vehicle_id=? ORDER BY id DESC LIMIT 1').get(id) as {card_json:string}|undefined;
  const old=prior?JSON.parse(prior.card_json) as CapabilityCard:undefined;
  const changes=old?card.functions.filter(f=>{const p=old.functions.find(p=>p.functionId===f.functionId);return !p||p.supportStatus!==f.supportStatus||p.readiness!==f.readiness||p.reason!==f.reason;}).map(f=>`${f.label}: ${f.supportLabel}; data ${f.readiness}. ${f.reason}`):['Initial disclosure. No real compatibility or payment is confirmed.'];
  const disclosedAt=new Date().toISOString(),saved=db.prepare('INSERT INTO capability_disclosures(vehicle_id,stage,disclosed_at,card_json,changes_json) VALUES(?,?,?,?,?)').run(id,String(stage),disclosedAt,JSON.stringify(card),JSON.stringify(changes));
  return {id:Number(saved.lastInsertRowid),stage:String(stage),disclosedAt,card,changes};
}
export function capabilityHistory(db:DatabaseSync,id:string){
  return {cards:(db.prepare('SELECT card_json FROM capability_card_history WHERE vehicle_id=? ORDER BY id DESC').all(id) as {card_json:string}[]).map(r=>JSON.parse(r.card_json) as CapabilityCard),disclosures:(db.prepare('SELECT * FROM capability_disclosures WHERE vehicle_id=? ORDER BY id DESC').all(id) as any[]).map(r=>({id:r.id,stage:r.stage,disclosedAt:r.disclosed_at,card:JSON.parse(r.card_json),changes:JSON.parse(r.changes_json)})),sourceChanges:db.prepare('SELECT function_id AS functionId,settings_json AS settings,changed_at AS changedAt FROM capability_source_history WHERE vehicle_id=? ORDER BY id DESC').all(id)};
}
