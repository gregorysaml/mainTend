export const serviceFunctions = ['tyres', 'oil', 'dpf', 'battery', 'charging'] as const;
export type ServiceFunction = typeof serviceFunctions[number];
export interface Capability {
  functionId: ServiceFunction;
  supportStatus: 'supported' | 'awaiting verification' | 'unsupported' | 'not applicable';
  readinessStatus: 'ready' | 'insufficient history' | 'stale' | 'missing' | 'unavailable';
  configurationVersion: string;
  source: string;
  evidenceReference: string;
  checkedAt: string;
  reason: string;
  nextStep: string;
  dataOrigin: 'constructed fixture' | 'unverified user entry';
}
export interface UsePlan {
  planId: string;
  description: string;
  periodStart: string;
  maintenanceAt: string;
  timeZone: string;
  plannedDistanceKm: number;
  forecastId: string;
  forecastRevision: number;
  issuedAt: string;
  validUntil: string;
  source: string;
  reference: string;
  eligible: boolean;
  remainingDistanceKm?: number;
  serviceDueAt?: string;
  lowerDistanceKm?: number;
  upperDistanceKm?: number;
  earliestDueAt?: string;
  latestDueAt?: string;
  manufacturerDistanceKm?: number;
  manufacturerDueAt?: string;
  dataOrigin: 'constructed fixture' | 'unverified user entry';
  validityKind?:'source valid until'|'freshness at comparison';
  distanceHorizonKm?:number;
}
export interface PlanResult { status: 'unavailable' | 'current warning' | 'manufacturer limit' | 'uncertain' | 'exceeds window' | 'at reference' | 'within estimate'; reason: string; distanceMarginKm?: number; timeMarginMinutes?: number }
export interface ServiceRevision<T> { id: number; vehicleId: string; revision: number; savedAt: string; input: T; result?: PlanResult; warningId?: string }
export interface Disclosure { stage:string; assessedAt:string; capabilities: ServiceRevision<Capability>[] }
export interface ServiceRecords { capabilities: ServiceRevision<Capability>[]; plans: ServiceRevision<UsePlan>[]; disclosures:ServiceRevision<Disclosure>[] }
