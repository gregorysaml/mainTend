import type { ForecastInput } from './forecast.ts';
import type { ServiceFunction } from './service.ts';
// All references, policies and observations below are fictional test assumptions.
export function forecastFixture(functionId:ServiceFunction,assessedAt:string,variant='eligible'):ForecastInput {
  const now=Date.parse(assessedAt), stamp=(days:number)=>new Date(now+days*86400000).toISOString();
  const i:ForecastInput={functionId,source:'Constructed provider fixture — no live connection',evidenceReference:'Fictional configuration and signal contract',configurationVersion:'fixture-v1',dataOrigin:'constructed fixture',signalMeaning:'per-wheel pressure',unit:'bar',xUnit:'day',reference:2.2,referenceSource:'Fictional planning reference; not a manufacturer limit',horizon:7,policy:{minPoints:3,minSpan:2,minR2:0.9,maxAgeHours:48,maxStepResidual:0.1,uncertainty:0.01},segment:'segment-1',points:[]};
  if(functionId==='oil')Object.assign(i,{signalMeaning:'condition/usage-based oil-life',unit:'%',xUnit:'km',reference:20,horizon:3000,policy:{...i.policy,minSpan:1000,maxStepResidual:2,uncertainty:1}});
  if(functionId==='dpf')Object.assign(i,{signalMeaning:'post-regeneration differential pressure',unit:'kPa',xUnit:'km',reference:15,horizon:500,dpfContextPolicy:{maxFlowDifference:1,maxTemperatureDifference:5},policy:{...i.policy,minSpan:100,maxStepResidual:1,uncertainty:0.2}});
  if(functionId==='battery')Object.assign(i,{signalMeaning:'capacity-based SOH',unit:'%',xUnit:'month',reference:80,horizon:3,batteryId:'fixture-battery-1',chemistry:'fictional chemistry',modelConditions:'Comparable capacity method, 20–25 C, charge throughput in kWh',futureUseAssumptions:'Future age 210 days and cumulative throughput 1500 kWh',futureBattery:{at:stamp(60),ageDays:210,chargeThroughput:1500,temperatureContext:'20–25 C'},policy:{...i.policy,minPoints:4,minSpan:2,maxStepResidual:0.2,uncertainty:1}});
  if(functionId==='charging'){
    i.charging={sessionId:'fixture-session-1',continuityEvidence:'Fictional uninterrupted session',plugState:'plugged',chargingState:'charging',stateObservedAt:assessedAt,issuedAt:assessedAt,estimateRevision:1,estimateId:'fixture-estimate',completionAt:new Date(now+40*60000).toISOString(),estimateTarget:'full charge',requestedTarget:'full charge',departureAt:new Date(now+60*60000).toISOString(),displayTimeZone:'Europe/Athens'};
  } else {
    const count=functionId==='battery'?6:functionId==='oil'?3:4;
    for(let k=0;k<count;k++){
      const battery=functionId==='battery',observedAt=stamp(battery?(k-count+1)*30:k-count+1);
      const x=functionId==='oil'?20000+k*1000:functionId==='dpf'?k*100:k;
      const ageDays=k*30,chargeThroughput=[0,100,300,400,800,1000][k];
      const value=functionId==='tyres'?2.5-k*0.05:functionId==='oil'?60-k*10:functionId==='dpf'?8+k:100-ageDays*0.01-chargeThroughput*0.001;
      i.points.push({id:`${functionId}-${k}`,observedAt,receivedAt:observedAt,value,x,segment:'segment-1',context:'verified fictional comparable protocol',contextEvidence:'Constructed context evidence',...(functionId==='tyres'?{wheelPosition:'front left'}:{}),...(functionId==='dpf'?{exhaustFlow:30,exhaustTemperature:300,regenerationEvidence:`Fictional completed regeneration ${k}`} : {}),...(battery?{batteryId:i.batteryId,chemistry:i.chemistry,ageDays,chargeThroughput,temperatureContext:'20–25 C'}:{})});
    }
  }
  if(variant==='stable'){const value=functionId==='battery'?97.5:i.points[0]?.value;i.points.forEach(p=>p.value=value);}
  if(variant==='current')i.currentConcern={source:'Constructed present warning',reason:'Current concern requires review',observedAt:assessedAt};
  if(variant==='missing')i.points=[];
  if(variant==='stale'){i.points.forEach(p=>{p.observedAt=new Date(Date.parse(p.observedAt)-10*86400000).toISOString();p.receivedAt=p.observedAt;});if(i.charging)i.charging.issuedAt=stamp(-10);}
  if(variant==='incompatible'){if(i.points[1])i.points[1].context='incomparable';if(i.charging)i.charging.requestedTarget='80%';}
  if(variant==='intervention')i.events=[{type:functionId==='tyres'?'inflation':functionId==='oil'?'indicator reset':functionId==='dpf'?'cleaning':'BMS recalibration',observedAt:stamp(-1),evidence:'Constructed event; not independently confirmed service'}];
  if(variant==='provider'&&functionId==='oil')i.providerEstimate={id:'fixture-oil-estimate',revision:1,issuedAt:assessedAt,validUntil:stamp(30),remainingDistanceKm:1200,eligible:true,restrictions:'Fictional eligible provider forecast with required oil-life access and 30 days of recorded driving; not verified coverage'};
  if(i.charging&&variant==='late'){i.charging.completionAt=new Date(now+80*60000).toISOString();i.charging.estimateRevision=2;}
  if(i.charging&&variant==='boundary'){i.charging.completionAt=i.charging.departureAt;i.charging.estimateRevision=3;}
  if(i.charging&&variant==='paused'){i.charging.chargingState='paused';i.charging.estimateRevision=4;}
  return i;
}
