import type { ServiceFunction } from './service.ts';
export interface ForecastPoint {
  id: string; observedAt: string; receivedAt: string; value: number; x: number;
  segment: string; context: string; contextEvidence: string;
  wheelPosition?: string; regenerationEvidence?: string; exhaustFlow?: number; exhaustTemperature?: number;
  batteryId?: string; chemistry?: string; ageDays?: number; chargeThroughput?: number; temperatureContext?: string;
}
export interface ForecastInput {
  functionId: ServiceFunction; source: string; evidenceReference: string; configurationVersion: string;
  dataOrigin: 'constructed fixture' | 'unverified user entry'; signalMeaning: string; unit: string; xUnit: 'day' | 'km' | 'month';
  reference: number; referenceSource: string; horizon: number;
  policy: { minPoints: number; minSpan: number; minR2: number; maxAgeHours: number; maxStepResidual: number; uncertainty: number };
  segment: string; points: ForecastPoint[]; currentConcern?: {reason:string; observedAt:string; source:string};
  events?: {type: 'inflation'|'rotation'|'replacement'|'oil service'|'indicator reset'|'unexplained jump'|'cleaning'|'BMS recalibration'; observedAt:string; evidence:string}[];
  batteryId?: string; chemistry?: string; futureUseAssumptions?: string; modelConditions?: string;
  futureBattery?: {at:string;ageDays:number;chargeThroughput:number;temperatureContext:string};
  dpfContextPolicy?: {maxFlowDifference:number;maxTemperatureDifference:number};
  providerEstimate?: {id:string;revision:number;issuedAt:string;validUntil:string;remainingDistanceKm?:number;serviceDueAt?:string;eligible:boolean;restrictions:string};
  charging?: {sessionId:string;continuityEvidence:string;plugState:'plugged'|'unplugged';chargingState:'charging'|'paused'|'faulted'|'completed';stateObservedAt:string;issuedAt:string;estimateRevision:number;estimateId:string;completionAt?:string;remainingDuration?:number;durationUnit?:'minute'|'second';durationAnchor?:string;estimateTarget:string;requestedTarget:string;departureAt:string;displayTimeZone:string};
}
export interface ForecastResult {
  status:'withheld'|'current concern'|'stable'|'beyond horizon'|'crossing estimate'|'capacity outlook'|'provider estimate'|'charging comparison';
  reason:string; origin:string; methodVersion:string; slope?:number; r2?:number; crossingAfter?:number; forecastValue?:number;
  lower?:number; upper?:number; marginMinutes?:number; completionAt?:string; baseline?:number;
}
export interface ForecastRun {id:number;vehicleId:string;savedAt:string;assessedAt:string;input:ForecastInput;result:ForecastResult;warningId:string;inputSha256:string;superseded:boolean;selectionHistory?:string[]}
