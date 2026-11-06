import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ForecastInput, ForecastResult, ForecastRun } from '../../../shared/forecast.ts';
import { serviceFunctions } from '../../../shared/service.ts';
import { instant } from '../maintenance/service.ts';
import {selectedSeriesKey,selectedFunctionLabels} from '../../../shared/selected-warnings.ts';
import {gateFunction} from '../vehicles/capability-data.ts';
export const selectedSchema=`CREATE TABLE IF NOT EXISTS selected_forecasts(id INTEGER PRIMARY KEY AUTOINCREMENT,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),saved_at TEXT NOT NULL,assessed_at TEXT NOT NULL,input_json TEXT NOT NULL,result_json TEXT NOT NULL,warning_id TEXT NOT NULL REFERENCES warnings(id),input_sha256 TEXT NOT NULL,UNIQUE(vehicle_id,input_sha256));
CREATE TABLE IF NOT EXISTS selected_forecast_selections(vehicle_id TEXT NOT NULL REFERENCES vehicles(id),series_key TEXT NOT NULL,run_id INTEGER NOT NULL REFERENCES selected_forecasts(id),PRIMARY KEY(vehicle_id,series_key));
CREATE TABLE IF NOT EXISTS selected_forecast_selection_history(id INTEGER PRIMARY KEY AUTOINCREMENT,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),run_id INTEGER NOT NULL REFERENCES selected_forecasts(id),selected_at TEXT NOT NULL);`;
const finite=(n:unknown):n is number=>typeof n==='number' && Number.isFinite(n);
function required(v:unknown):v is string{return typeof v==='string' && !!v.trim();}
export function calculateSelected(i:ForecastInput, assessedAt:string):ForecastResult {
  const origin = i?.dataOrigin === 'constructed fixture' ? 'Calculated constructed fixture' : 'Unverified manual input';
  const base={origin,methodVersion:'selected-linear-v1'};
  const withheld=(reason:string):ForecastResult=>({...base,status:'withheld',reason});
  if (!i || !serviceFunctions.includes(i.functionId)) throw new Error('Unknown forecast function.');
  const now=instant(assessedAt,'Assessment time');
  if (!['constructed fixture','unverified user entry'].includes(i.dataOrigin)) throw new Error('No live data route is configured. Label the data origin.');
  if (![i.source,i.evidenceReference,i.configurationVersion].every(required)) return withheld('Configuration-specific source evidence is required.');
  if (i.dataOrigin !== 'constructed fixture') return withheld('Real source mappings and configuration support remain unverified. Manual entries cannot enable forecasts.');
  const p=i.policy;
  if (!p || !finite(p.maxAgeHours) || p.maxAgeHours<=0) throw new Error('Declare a positive source freshness policy.');
  const fresh=(time:string)=>{const t=instant(time,'Source time');return t<=now && now-t<=p.maxAgeHours*3600000;};
  if(i.currentConcern){if(!required(i.currentConcern.reason)||!required(i.currentConcern.source))throw new Error('Current concern needs source and reason.');if(fresh(i.currentConcern.observedAt))return {...base,status:'current concern',reason:`${i.currentConcern.source}: ${i.currentConcern.reason}. Current follow-up takes precedence.`};}
  if(i.functionId==='charging'){
    const c=i.charging;
    if(!c || ![c.sessionId,c.continuityEvidence,c.estimateId,c.estimateTarget,c.requestedTarget].every(required))return withheld('Known session, continuity evidence and explicit estimate target are required.');
    if(!fresh(c.stateObservedAt))return withheld('Charging state is stale or future-dated.');
    if(c.plugState==='unplugged'||c.chargingState==='paused'||c.chargingState==='faulted')return {...base,status:'current concern',reason:`Present session state: ${c.plugState==='unplugged'?'unplugged':c.chargingState}. This is not a predicted component failure.`};
    if(c.plugState!=='plugged'||!['charging','completed'].includes(c.chargingState))return withheld('Unsupported session state.');
    if(c.estimateTarget!==c.requestedTarget)return withheld('Estimate target does not match requested readiness target. Full charge cannot stand for 80%.');
    if(!fresh(c.issuedAt))return withheld('Completion estimate is stale or future-dated; receipt time does not refresh it.');
    if(!Number.isInteger(c.estimateRevision)||c.estimateRevision<1)return withheld('Estimate revision is required.');
    try{new Intl.DateTimeFormat('en',{timeZone:c.displayTimeZone});}catch{return withheld('Invalid display time zone.');}
    if(!c.displayTimeZone)return withheld('Display time zone is required.');
    let completion:number;
    if(c.completionAt && c.remainingDuration!==undefined)return withheld('Supply a completion instant or an anchored duration, not both.');
    if(c.completionAt)completion=instant(c.completionAt,'Completion estimate');
    else if(finite(c.remainingDuration)&&c.remainingDuration>=0&&c.durationAnchor&&['minute','second'].includes(c.durationUnit!)){
      if(instant(c.durationAnchor,'Duration anchor')!==instant(c.issuedAt,'Issue time'))return withheld('Duration anchor must match the documented source issue time.');
      completion=Date.parse(c.durationAnchor)+c.remainingDuration*(c.durationUnit==='minute'?60000:1000);
    }else return withheld('Missing completion estimate or unsupported duration units/anchor.');
    const departure=instant(c.departureAt,'Departure');
    if(departure<now||completion<Date.parse(c.issuedAt))return withheld('Departure is past or completion precedes estimate issue time.');
    return {...base,origin:`Attributed estimate: ${i.source} · ${i.dataOrigin}`,status:'charging comparison',completionAt:new Date(completion).toISOString(),marginMinutes:(departure-completion)/60000,reason:'Departure minus attributed completion estimate; no hidden buffer. Conditional on the recorded target and session. No source-confirmed completion is inferred.'};
  }
  if(i.functionId==='oil' && i.providerEstimate){
    const e=i.providerEstimate;
    if(i.signalMeaning!=='condition/usage-based oil-life'||!e.eligible||!required(e.restrictions)||!required(e.id)||!Number.isInteger(e.revision)||e.revision<1||!fresh(e.issuedAt)||instant(e.validUntil,'Estimate validity')<now)return withheld('Provider estimate eligibility, meaning, restrictions, revision or validity is unsupported.');
    if(e.remainingDistanceKm!==undefined&&(!finite(e.remainingDistanceKm)||e.remainingDistanceKm<0))return withheld('Provider distance must be nonnegative kilometres.');
    if(e.serviceDueAt)instant(e.serviceDueAt,'Provider service time');
    if(e.remainingDistanceKm===undefined&&!e.serviceDueAt)return withheld('Provider estimate needs an explicit distance or time reference.');
    return {...base,origin:`Provider estimate: ${i.source} · ${i.dataOrigin}`,status:e.remainingDistanceKm===0||(e.serviceDueAt && Date.parse(e.serviceDueAt)<=now)?'current concern':'provider estimate',reason:'Attributed upstream oil-service estimate. Not a MainTend-trained model or fixed-interval reminder. Manufacturer requirements still apply.'};
  }
  const meanings={tyres:'per-wheel pressure',oil:'condition/usage-based oil-life',dpf:'post-regeneration differential pressure',battery:'capacity-based SOH'};
  const units={tyres:'bar',oil:'%',dpf:'kPa',battery:'%'};
  if(i.signalMeaning!==meanings[i.functionId]||i.unit!==units[i.functionId])return withheld('Unsupported signal meaning or units. TPMS, oil pressure/level, SoC and DTCs cannot replace the required numerical signals.');
  if(i.xUnit!==(i.functionId==='tyres'?'day':i.functionId==='battery'?'month':'km'))return withheld('Unsupported forecast axis units.');
  if(!finite(i.reference)||!required(i.referenceSource)||!finite(i.horizon)||i.horizon<=0)return withheld('A documented configuration-specific reference and bounded horizon are required.');
  if(!Number.isInteger(p.minPoints)||p.minPoints<3||!finite(p.minSpan)||p.minSpan<=0||!finite(p.minR2)||p.minR2<0||p.minR2>1||!finite(p.maxStepResidual)||p.maxStepResidual<0||!finite(p.uncertainty)||p.uncertainty<0)throw new Error('Declare history, fit, residual and uncertainty policies before calculation.');
  if(!Array.isArray(i.points))throw new Error('History is required.');
  const ids=new Map<string,string>(); const points:typeof i.points=[];
  for(const point of i.points){
    if(!required(point.id))return withheld('Source record identity is required for duplicate protection.');
    const raw=JSON.stringify(point);if(ids.has(point.id)){if(ids.get(point.id)!==raw)return withheld('Conflicting duplicate source identity.');continue;}ids.set(point.id,raw);
    const observed=instant(point.observedAt,'Observation time'),received=instant(point.receivedAt,'Receipt time');
    if(observed>now||received>now||received<observed)return withheld('Future or inconsistent source/receipt time.');
    if(!finite(point.x)||point.x<0||!finite(point.value)||!required(point.segment)||!required(point.context)||!required(point.contextEvidence))return withheld('Invalid numerical history or missing context evidence.');
    if(point.value<0||((i.functionId==='oil'||i.functionId==='battery')&&point.value>100))return withheld('Signal value is outside its declared scale.');
    if(point.segment===i.segment)points.push(point);
  }
  points.sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
  if(points.length<p.minPoints)return withheld('Insufficient comparable history in the selected segment.');
  if(!fresh(points.at(-1)!.observedAt))return withheld('Latest source observation is stale.');
  if(new Set(points.map(x=>x.context)).size!==1)return withheld('Incomparable operating context.');
  for(let k=1;k<points.length;k++)if(points[k].x<=points[k-1].x || Date.parse(points[k].observedAt)<=Date.parse(points[k-1].observedAt))return withheld('Non-increasing or repeated independent observations cannot form dense history.');
  const latest=points.at(-1)!;
  if(i.functionId==='tyres' && points.some(x=>Math.abs((Date.parse(x.observedAt)-Date.parse(points[0].observedAt))/86400000-(x.x-points[0].x))>0.00001))return withheld('Pressure day-axis does not match source timestamps.');
  if(i.events?.some(e=>{instant(e.observedAt,'Event time');return Date.parse(e.observedAt)>Date.parse(points[0].observedAt)&&Date.parse(e.observedAt)<=Date.parse(latest.observedAt);}))return withheld('An intervention, reset or recalibration divides this segment. Select a new eligible segment; the event is not proof of service or forecast confirmation.');
  if(i.functionId==='tyres'&&(new Set(points.map(x=>x.wheelPosition)).size!==1||!['front left','front right','rear left','rear right'].includes(latest.wheelPosition!)))return withheld('Wheel identity and continuity must be established.');
  if(i.functionId==='dpf' && points.some(x=>!required(x.regenerationEvidence)||!finite(x.exhaustFlow)||x.exhaustFlow<=0||!finite(x.exhaustTemperature)))return withheld('DPF requires completed regeneration evidence, exhaust flow and temperature in the documented comparable context.');
  if(i.functionId==='dpf'){
    const c=i.dpfContextPolicy;
    if(!c||!finite(c.maxFlowDifference)||c.maxFlowDifference<0||!finite(c.maxTemperatureDifference)||c.maxTemperatureDifference<0)return withheld('Declare numerical flow and temperature comparability tolerances. Flow is g/s, temperature is Celsius.');
    if(Math.max(...points.map(x=>x.exhaustFlow!))-Math.min(...points.map(x=>x.exhaustFlow!))>c.maxFlowDifference||Math.max(...points.map(x=>x.exhaustTemperature!))-Math.min(...points.map(x=>x.exhaustTemperature!))>c.maxTemperatureDifference)return withheld('Exhaust flow or temperature lies outside declared comparability tolerances.');
  }
  if(i.functionId==='battery' && (!required(i.batteryId)||!required(i.chemistry)||!required(i.futureUseAssumptions)||!required(i.modelConditions)||points.some(x=>x.batteryId!==i.batteryId||x.chemistry!==i.chemistry||!finite(x.ageDays)||x.ageDays<0||!finite(x.chargeThroughput)||x.chargeThroughput<0||!required(x.temperatureContext))))return withheld('Capacity forecasting requires matching battery identity/chemistry, age, throughput, temperature context and future-use/model assumptions.');
  const current=i.functionId==='dpf'?latest.value>=i.reference:latest.value<=i.reference;
  if(current)return {...base,status:'current concern',reason:'Latest eligible observation already reaches the recorded reference. Do not defer follow-up to a forecast date.',baseline:latest.value};
  const xs=points.map(x=>x.x),ys=points.map(x=>x.value),n=points.length,span=xs.at(-1)!-xs[0];
  if(span<p.minSpan)return withheld('History span is below the predeclared reliability minimum.');
  if(i.functionId==='oil' && ys.some((y,k)=>k>0&&y>=ys[k-1]))return withheld('Flat, stepwise or increasing oil-life history requires review of cycle and usage; no supported extrapolation.');
  const mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;
  const slope=xs.reduce((s,x,k)=>s+(x-mx)*(ys[k]-my),0)/xs.reduce((s,x)=>s+(x-mx)**2,0),intercept=my-slope*mx;
  const residual=ys.reduce((s,y,k)=>s+(y-(intercept+slope*xs[k]))**2,0),total=ys.reduce((s,y)=>s+(y-my)**2,0),r2=total===0?1:1-residual/total;
  if(i.functionId!=='battery'&&(Math.max(...ys.map((y,k)=>Math.abs(y-(intercept+slope*xs[k]))))>p.maxStepResidual||r2<p.minR2))return withheld('Fit or residual checks fail; numerical extrapolation is withheld.');
  if(i.functionId==='battery'){
    const f=i.futureBattery;
    if(!f||!finite(f.ageDays)||!finite(f.chargeThroughput)||f.ageDays<latest.ageDays!||f.chargeThroughput<latest.chargeThroughput!||points.some(x=>x.temperatureContext!==f.temperatureContext))return withheld('Declare future age, charge throughput and a matching temperature operating range.');
    const target=instant(f.at,'Capacity forecast time'),limit=new Date(latest.observedAt);limit.setUTCMonth(limit.getUTCMonth()+i.horizon);
    if(!Number.isInteger(i.horizon)||target<=Date.parse(latest.observedAt)||target>limit.getTime()||Math.abs((target-Date.parse(latest.observedAt))/86400000-(f.ageDays-latest.ageDays!))>0.00001)return withheld('Future age and time must agree within the declared calendar-month horizon.');
    if(points.length<4)return withheld('Age and throughput regression requires at least four comparable capacity estimates.');
    for(let k=1;k<points.length;k++)if(points[k].ageDays!<=points[k-1].ageDays!||points[k].chargeThroughput!<points[k-1].chargeThroughput!)return withheld('Age or cumulative charge-throughput history is inconsistent.');
    // Centred two-exposure regression avoids treating SoC or calendar time as capacity.
    const ages=points.map(x=>x.ageDays!),charges=points.map(x=>x.chargeThroughput!),ma=ages.reduce((a,b)=>a+b,0)/n,mc=charges.reduce((a,b)=>a+b,0)/n;
    let aa=0,cc=0,ac=0,ay=0,cy=0;
    points.forEach((q,k)=>{const a=ages[k]-ma,c=charges[k]-mc;aa+=a*a;cc+=c*c;ac+=a*c;ay+=a*(q.value-my);cy+=c*(q.value-my);});
    const determinant=aa*cc-ac*ac;
    if(determinant<=1e-10*aa*cc)return withheld('Age and throughput effects cannot be identified independently from this history.');
    const ba=(ay*cc-cy*ac)/determinant,bc=(cy*aa-ay*ac)/determinant;
    if(ba>0||bc>0)return withheld('Increasing age/throughput capacity effects require model or recalibration review.');
    const fitted=points.map(q=>my+ba*(q.ageDays!-ma)+bc*(q.chargeThroughput!-mc));
    const batteryResidual=points.reduce((s,q,k)=>s+(q.value-fitted[k])**2,0),batteryR2=total===0?1:1-batteryResidual/total;
    if(batteryR2<p.minR2||Math.max(...points.map((q,k)=>Math.abs(q.value-fitted[k])))>p.maxStepResidual)return withheld('Capacity regression fails its declared fit or residual criteria.');
    const forecastValue=my+ba*(f.ageDays-ma)+bc*(f.chargeThroughput-mc);
    if(forecastValue-p.uncertainty<0||forecastValue+p.uncertainty>100)return withheld('Projected uncertainty lies outside the capacity scale.');
    return {...base,methodVersion:'capacity-age-throughput-v1',status:'capacity outlook',r2:batteryR2,forecastValue,lower:forecastValue-p.uncertainty,upper:forecastValue+p.uncertainty,baseline:latest.value,reason:'Capacity regression uses age and cumulative throughput under declared temperature and future-use assumptions. Uncertainty is a declared fixture bound, not calibrated coverage. No battery replacement is prescribed.'};
  }
  if((i.functionId==='dpf'&&slope<=0)||(i.functionId!=='dpf'&&slope>=0))return {...base,status:'stable',slope,r2,baseline:latest.value,reason:'No supported trend towards the planning reference. This is not evidence of fault-free condition.'};
  const crossingAfter=(i.reference-intercept)/slope-latest.x;
  if(crossingAfter>i.horizon)return {...base,status:'beyond horizon',slope,r2,baseline:latest.value,reason:'Reference crossing lies beyond the declared forecast horizon; no crossing date is offered.'};
  const delta=p.uncertainty/Math.abs(slope);
  return {...base,status:'crossing estimate',slope,r2,crossingAfter,lower:Math.max(0,crossingAfter-delta),upper:crossingAfter+delta,baseline:latest.value,reason:'Bounded synthetic linear reference-crossing estimate, not failure prediction or diagnosis. Manufacturer requirements and current warnings take precedence. Uncertainty is a declared fixture bound.'};
}
export function selectedRuns(db:DatabaseSync,vehicleId:string):ForecastRun[]{
  const rows=db.prepare('SELECT * FROM selected_forecasts WHERE vehicle_id=? ORDER BY id DESC').all(vehicleId) as any[];
  const choices=new Map((db.prepare('SELECT series_key,run_id FROM selected_forecast_selections WHERE vehicle_id=?').all(vehicleId) as {series_key:string;run_id:number}[]).map(row=>[row.series_key,row.run_id]));
  const history=db.prepare('SELECT run_id,selected_at FROM selected_forecast_selection_history WHERE vehicle_id=? ORDER BY id').all(vehicleId) as {run_id:number;selected_at:string}[];
  const seen=new Set<string>();
  return rows.map(r=>{
    const input=JSON.parse(r.input_json) as ForecastInput;
    const key=selectedSeriesKey(input);
    const superseded=choices.has(key)?choices.get(key)!==r.id:seen.has(key);seen.add(key);
    return {id:r.id,vehicleId,savedAt:r.saved_at,assessedAt:r.assessed_at,input,result:JSON.parse(r.result_json),warningId:r.warning_id,inputSha256:r.input_sha256,superseded,selectionHistory:history.filter(h=>h.run_id===r.id).map(h=>h.selected_at)};
  });
}
function chooseSelected(db:DatabaseSync,vehicleId:string,input:ForecastInput,runId:number){
  db.prepare('INSERT INTO selected_forecast_selections(vehicle_id,series_key,run_id) VALUES(?,?,?) ON CONFLICT(vehicle_id,series_key) DO UPDATE SET run_id=excluded.run_id').run(vehicleId,selectedSeriesKey(input),runId);
  db.prepare('INSERT INTO selected_forecast_selection_history(vehicle_id,run_id,selected_at) VALUES(?,?,?)').run(vehicleId,runId,new Date().toISOString());
}
export function saveSelected(db:DatabaseSync,vehicleId:string,profile:string,input:ForecastInput,assessedAt:string,simulateFailure=false){
  if(!db.prepare('SELECT id FROM vehicles WHERE id=? AND profile=?').get(vehicleId,profile))throw new Error('Vehicle not found for selected profile.');
  if(!input)throw new Error('Forecast input is required.');
  gateFunction(db,vehicleId,input.functionId);
  const result=calculateSelected(input,assessedAt),hash=createHash('sha256').update(JSON.stringify({input,assessedAt})).digest('hex');
  const previous=selectedRuns(db,vehicleId),same=previous.find(r=>r.inputSha256===hash);
  if(same){
    if(!same.superseded)return previous;
    if(input.charging)throw new Error('A superseded charging estimate cannot be selected again. Supply fresh session evidence and a newer revision.');
    db.exec('BEGIN IMMEDIATE');try{chooseSelected(db,vehicleId,input,same.id);if(simulateFailure)throw new Error('Simulated storage failure; previous selection retained.');db.exec('COMMIT');return selectedRuns(db,vehicleId);}catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(input.charging){const latest=previous.find(r=>r.input.functionId==='charging'&&r.input.charging?.sessionId===input.charging!.sessionId);if(latest && (Date.parse(input.charging.issuedAt)<Date.parse(latest.input.charging!.issuedAt)||input.charging.estimateRevision<=latest.input.charging!.estimateRevision))throw new Error('Out-of-order or repeated estimate revision; earlier evidence remains retained.');}
  db.exec('BEGIN IMMEDIATE');try{
    const warningId=`SELECTED-${vehicleId}-${hash}`;
    db.prepare('INSERT INTO warnings(id,vehicle_id,source_type,source_ref,title,explanation,created_at,active) VALUES(?,?,?,?,?,?,?,0)').run(warningId,vehicleId,'selected_forecast',hash,`${selectedFunctionLabels[input.functionId]}: ${result.status}`,`${input.dataOrigin}. ${result.reason}`,assessedAt);
    const saved=db.prepare('INSERT INTO selected_forecasts(vehicle_id,saved_at,assessed_at,input_json,result_json,warning_id,input_sha256) VALUES(?,?,?,?,?,?,?)').run(vehicleId,new Date().toISOString(),assessedAt,JSON.stringify(input),JSON.stringify(result),warningId,hash);
    chooseSelected(db,vehicleId,input,Number(saved.lastInsertRowid));
    if(simulateFailure)throw new Error('Simulated storage failure; no forecast or evidence link was saved.');
    db.exec('COMMIT');return selectedRuns(db,vehicleId);
  }catch(e){db.exec('ROLLBACK');throw e;}
}
