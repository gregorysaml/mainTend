import type {ServiceFunction} from './service.ts';
export const functionNames:Record<ServiceFunction,string>={tyres:'Tyre pressure',oil:'Oil service',dpf:'DPF inspection',battery:'EV battery health',charging:'Charging readiness'};
export type Applicability='applicable'|'not applicable'|'awaiting verification';
export type Readiness='ready'|'partial'|'missing'|'stale'|'insufficient history'|'unavailable';
export interface FunctionSourceSettings {functionId:ServiceFunction;mode:'demo'|'unverified'|'unsupported';feed:'available'|'paused'|'permission missing';source:string;note:string}
export interface CapabilityChannel {id:string;label:string;status:Readiness;reason:string;latestAt?:string;points:number;requiredPoints:number}
export interface FunctionCapability {
  functionId:ServiceFunction;label:string;applicability:Applicability;
  supportStatus:'supported'|'awaiting verification'|'unsupported'|'not applicable';
  supportLabel:string;supportReason:string;supportCheckedAt?:string;evidenceReference?:string;
  readiness:Readiness;reason:string;nextStep:string;latestAt?:string;channels:CapabilityChannel[];
  settings:FunctionSourceSettings;canEvaluate:boolean;dataOrigin:'constructed fixture'|'unverified user entry';
}
export interface CapabilityCard {
  vehicleId:string;registration:string;configuration:{makeModel:string;modelYear?:number;fuelType:string;fingerprint:string};
  assessedAt:string;checkedAt:string;revision:number;functions:FunctionCapability[];
}
export interface CapabilityDisclosure {id:number;stage:string;disclosedAt:string;card:CapabilityCard;changes:string[]}
export interface ObservationEntry {
  functionId:ServiceFunction;recordId:string;observedAt:string;source:string;dataOrigin:'constructed fixture'|'unverified user entry';
  value?:number;unit?:string;odometer?:number;odometerUnit?:'km'|'mi';wheelPosition?:string;
  context:string;event?:string;exhaustFlow?:number;exhaustTemperature?:number;temperatureUnit?:'C'|'F';
  batteryId?:string;chemistry?:string;ageDays?:number;chargeThroughput?:number;temperatureContext?:string;
}
export function functionApplicability(fuelType:string,fn:ServiceFunction):{status:Applicability;reason:string}{
  const fuel=fuelType.trim().toLowerCase(),bev=/\bbev\b|battery electric|^electric$|^ev$/.test(fuel),plug=/phev|plug.?in/.test(fuel),diesel=/diesel/.test(fuel),combustion=/petrol|gasoline|diesel|hybrid|phev/.test(fuel);
  if(fn==='tyres')return {status:'applicable',reason:'Per-wheel pressure may be assessed when the required source and context are available.'};
  if(fn==='oil')return bev?{status:'not applicable',reason:'The recorded battery-electric configuration has no combustion-engine oil service.'}:combustion?{status:'applicable',reason:'This configuration has a combustion engine. Oil-life signal access still needs separate evidence.'}:{status:'awaiting verification',reason:'Combustion-engine applicability is not established from the recorded fuel type.'};
  if(fn==='dpf')return diesel?{status:'applicable',reason:'The recorded diesel configuration may support a DPF function; signal access is checked separately.'}:bev||/petrol|gasoline/.test(fuel)?{status:'not applicable',reason:'A diesel DPF function is not applicable to the recorded configuration.'}:{status:'awaiting verification',reason:'A diesel engine and DPF configuration have not been established.'};
  if(bev||plug)return {status:'applicable',reason:'The recorded plug-in configuration may support this function; the required source is checked separately.'};
  if(combustion)return {status:'not applicable',reason:fn==='charging'?'No plug-in charging capability is established for this configuration.':'The EV capacity-health function is not established for this non-plug-in configuration.'};
  return {status:'awaiting verification',reason:'A suitable EV or plug-in configuration has not been established.'};
}
