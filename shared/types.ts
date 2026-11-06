import type { MaintenancePriority } from './maintenance.ts';
import type { ProfileHistory } from './vehicle-profile.ts';
import type { InspectionRecord } from './inspection.ts';
import type { CoolingRun } from './cooling.ts';
import type { LubricationRun } from './lubrication.ts';
export type Profile = 'fleet' | 'owner';
export type ActionStatus = 'planned' | 'in progress' | 'completed' | 'cancelled';
export type DataStatus = 'Sufficient' | 'Insufficient information';

export interface ObservationInput { vehicleId: string; parameter: string; value: number; unit: string; observedAt: string }
export interface ObservationSource { value: number; unit: string; observedAt: string; conversion: string }
export interface Observation { id: number; parameter: string; value: number; unit: string; observedAt: string; importedAt?: string; source?: ObservationSource }
export interface AcceptedImport extends ObservationInput { rowNumber: number; source: ObservationSource; id?: number }
export interface RejectedImport { rowNumber: number; record: unknown; reason: string }
export interface ImportResult { accepted: AcceptedImport[]; rejected: RejectedImport[] }
export interface ImportParameter { unit: string; min: number; max: number; label: string; acceptedUnits: string[] }
export interface ImportSchema { parameters: Record<string, ImportParameter>; maxRecords: number; assessmentTime: string; example: ObservationInput[] }
export interface Rule { id: string; parameter: string; operator: '>' | '<'; threshold: number; unit: string; title: string; explanation: string }
export interface ScenarioConfig { assessmentTime: string; observationMaxAgeHours: number; requiredParameters: string[]; rules: Rule[] }
export interface DataGap { parameter: string; reason: 'missing' | 'outdated' | 'after assessment time'; observedAt?: string }
export interface Trigger { rule: Rule; observation: Observation }
export interface Assessment { vehicleId: string; dataStatus: DataStatus; gaps: DataGap[]; triggers: Trigger[] }
export interface Warning { id: string; sourceType: 'rule' | 'simulated_forecast' | 'computed_cooling' | 'computed_lubrication' | 'use_plan' | 'selected_forecast'; sourceRef: string; title: string; explanation: string; createdAt: string; active: number; current?: boolean; simulated: boolean; supportingObservations: Observation[]; attentionKind?:'current condition'|'forecast'; selectedEvidence?:import('./selected-warnings.ts').SelectedWarningEvidence }
export interface ActionHistory { status: ActionStatus; note: string; changedAt: string; dueDate?: string | null; priority?: MaintenancePriority | null }
export interface MaintenanceAction { id: number; warningId: string; actorProfile: Profile; task: string; assignedTo?: string; status: ActionStatus; outcome?: string; dueDate?: string | null; priority?: MaintenancePriority; createdAt: string; updatedAt: string; history: ActionHistory[]; inspections?: InspectionRecord[] }
export interface VehicleLocation { latitude: number; longitude: number; label: string; recordedAt: string; simulated: true }
export interface OdometerReading { id: number; kilometres: number; recordedAt: string; source: string }
export interface Tyre { position: 'front left' | 'front right' | 'rear left' | 'rear right'; brand: string; model: string; size: string; season: string; dotCode: string; installedAt: string; installedKm: number; pressureBar: number; treadMm: number; measuredAt: string; lastRotationAt: string }
export interface VehicleDetails { modelYear: number; fuelType: string; transmission: string; engineCc: number; colour: string; purchasedAt: string; lastServiceAt: string; lastServiceKm: number; photoUrl?: string; photoDescription?: string; equipment: string[]; odometerHistory: OdometerReading[]; tyres: Tyre[]; simulated: true }
export interface Vehicle { id: string; displayName: string; registration: string; profile: Profile; makeModel: string; details?: VehicleDetails; profileRevision?: number; profileHistory?: ProfileHistory[]; location?: VehicleLocation; journeys?:import('./journeys.ts').Journey[]; observations: Observation[]; warnings: Warning[]; actions: MaintenanceAction[] }
export interface Dashboard { profile: Profile; assessmentTime: string; configuration: ScenarioConfig; vehicles: Vehicle[]; assessments: Assessment[]; coolingRuns?: CoolingRun[]; lubricationRuns?: LubricationRun[] }
export interface AssessmentSettingsInput { assessmentTime: string; observationMaxAgeHours: number }
export interface ConfigurationHistory { id: number; configuration: ScenarioConfig; savedAt: string }
export interface ForecastRecord { id: string; vehicleId: string; title: string; explanation: string; forecastAt: string; suggestedWindow: string; simulated: true }
export interface StoredRejection { id: number; record: unknown; reason: string; rejectedAt: string }
export interface EvidenceReport {
  capabilityCards?:Record<string,import('./capabilities.ts').CapabilityCard>;
  capabilityHistory?:Record<string,unknown>;
  functionObservations?:Record<string,unknown[]>;
  annualHistories?: Record<string, import('./annual-history.ts').StoredAnnualHistory|null>;
  selectedForecasts?: Record<string, import('./forecast.ts').ForecastRun[]>;
  serviceRecords?: Record<string, import('./service.ts').ServiceRecords>;
  schemaVersion: '1.0'; generatedAt: string; profile: Profile; dataOrigin: 'synthetic demonstration';
  configuration: ScenarioConfig; configurationHistory: ConfigurationHistory[];
  vehicles: Vehicle[]; assessments: Assessment[]; simulatedForecasts: ForecastRecord[];
  importRejections: StoredRejection[]; dataDictionary: Record<string, ImportParameter>;
  inputSha256: string; limitations: string[];
  coolingRuns?: CoolingRun[];
  lubricationRuns?: LubricationRun[];
}
export interface CreateActionInput { vehicleId: string; warningId: string; actorProfile: Profile; task: string; assignedTo?: string; note?: string; dueDate?: string | null; priority?: MaintenancePriority; simulateFailure?: boolean }
export interface UpdateActionInput { status: ActionStatus; note: string; outcome?: string }
