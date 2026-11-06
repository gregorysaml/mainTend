import type {ForecastInput,ForecastRun,ForecastResult} from './forecast.ts';
import type {Warning} from './types.ts';

export const selectedFunctionLabels={tyres:'Tyre pressure',oil:'Oil service',dpf:'DPF inspection',battery:'EV battery health',charging:'Charging readiness'};
export interface SelectedWarningEvidence {
  runId:number; functionId:ForecastInput['functionId']; result:ForecastResult;
  source:string; dataOrigin:ForecastInput['dataOrigin']; assessedAt:string; latestSourceAt?:string;
  wheelPosition?:string; methodVersion:string; inputSha256:string;
  reference:number; referenceSource:string; unit:string; horizon:number; horizonUnit:string;
  currentSegmentPoints:number; statusReason:string;
}
export function selectedSeriesKey(input:ForecastInput):string {
  const wheel=input.functionId==='tyres'?(Array.isArray(input.points)?input.points.find(p=>p.segment===input.segment)?.wheelPosition:undefined)??'unknown':'';
  // A new segment, source or fixture for the same function/wheel supersedes its previous decision.
  return JSON.stringify([input.functionId,wheel]);
}
export function selectedAttention(result:ForecastResult,input:ForecastInput):'current condition'|'forecast'|undefined {
  if(result.status==='current concern')return 'current condition';
  if(result.status==='crossing estimate'||result.status==='provider estimate')return 'forecast';
  if(result.status==='capacity outlook'&&result.lower!==undefined&&result.lower<=input.reference)return 'forecast';
  if(result.status==='charging comparison'&&result.marginMinutes!==undefined&&result.marginMinutes<=0)return 'forecast';
  return undefined;
}
export function selectedWarningState(run:ForecastRun,assessmentTime:string){
  const input=run.input,points=Array.isArray(input.points)?input.points.filter(p=>p.segment===input.segment):[];
  const latest=points.reduce<string|undefined>((at,p)=>!at||Date.parse(p.observedAt)>Date.parse(at)?p.observedAt:at,undefined);
  const sourceTimes=input.currentConcern&&run.result.status==='current concern'?[input.currentConcern.observedAt]:input.charging?[input.charging.stateObservedAt,input.charging.issuedAt]:input.providerEstimate?[input.providerEstimate.issuedAt]:latest?[latest]:[];
  const now=Date.parse(assessmentTime),same=Date.parse(run.assessedAt)===now;
  const maxAge=input.policy?.maxAgeHours;
  const fresh=Number.isFinite(maxAge)&&maxAge>0&&sourceTimes.length>0&&sourceTimes.every(at=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=now&&now-Date.parse(at)<=maxAge*3600000);
  const attentionKind=selectedAttention(run.result,input);
  const current=!run.superseded&&same&&fresh&&!!attentionKind;
  const statusReason=run.superseded?'Replaced by a later decision for this function and wheel.':!same?'Assessment changed. Re-evaluate the saved evidence before planning.':!fresh?'Required source evidence is missing, stale or after assessment time.':!attentionKind?'Retained evaluation record; no current concern or supported planning alert.':attentionKind==='current condition'?'Current observed concern. Review it before any future planning estimate.':'Conditional planning alert, distinct from a current observed condition.';
  const evidence:SelectedWarningEvidence={runId:run.id,functionId:input.functionId,result:run.result,source:input.source,dataOrigin:input.dataOrigin,assessedAt:run.assessedAt,latestSourceAt:sourceTimes[0],wheelPosition:points.at(-1)?.wheelPosition,methodVersion:run.result.methodVersion,inputSha256:run.inputSha256,reference:input.reference,referenceSource:input.referenceSource,unit:input.unit,horizon:input.horizon,horizonUnit:input.xUnit,currentSegmentPoints:points.length,statusReason};
  return {current,attentionKind,evidence};
}
export function isCurrentCondition(warning:Warning):boolean {
  return warning.current!==false&&(warning.sourceType==='rule'||warning.attentionKind==='current condition');
}
export function warningPriority(a:Warning,b:Warning):number {
  return Number(isCurrentCondition(b))-Number(isCurrentCondition(a))||Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id);
}
