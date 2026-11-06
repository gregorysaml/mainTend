// Re-export canonical contracts; do not create a competing frontend data model.
// The current source is a controlled demonstration, not a live telematics stream.
export type { Vehicle, VehicleLocation, Observation, ObservationSource, Assessment, Warning, MaintenanceAction, Dashboard } from '../../../shared/types.ts';
export type { CoolingRun } from '../../../shared/cooling.ts';
export type { LubricationRun } from '../../../shared/lubrication.ts';
