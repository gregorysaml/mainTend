import type { Assessment, ScenarioConfig, Vehicle } from '../../../shared/types.ts';
import { coolingMatchesSettings, coolingStatusLabels, type CoolingRun } from '../../../shared/cooling.ts';
import { isCoolingDemoVehicle, isLubricationDemoVehicle, maintenanceHref } from '../features/predictive/presentation.ts';
import { lubricationMatchesSettings, lubricationStatusLabels, type LubricationRun } from '../../../shared/lubrication.ts';
import { formatUtc } from './date.ts';

export interface VehicleSignal {
  id: string; icon: 'warnings' | 'activity'; tone: 'warning' | 'prediction' | 'neutral';
  title: string; detail: string; href?: string;
}
export function vehicleSignals(vehicle: Vehicle, assessment: Assessment, configuration: ScenarioConfig, runs: CoolingRun[], lubricationRuns: LubricationRun[] = []): VehicleSignal[] {
  const signals: VehicleSignal[] = [];
  for(const w of vehicle.warnings.filter(w=>w.sourceType==='selected_forecast'&&w.current===true))signals.push({id:w.id,icon:w.attentionKind==='current condition'?'warnings':'activity',tone:w.attentionKind==='current condition'?'warning':'prediction',title:w.title,detail:w.attentionKind==='current condition'?'Current recorded concern · synthetic':'Conditional planning forecast · synthetic',href:'#warnings'});
  if (assessment.dataStatus !== 'Sufficient') signals.push({ id: 'data', icon: 'warnings', tone: 'neutral', title: 'Data needs attention', detail: 'Rule assessment withheld · incomplete usable data', href: '#warnings' });
  else for (const trigger of assessment.triggers) signals.push({ id: trigger.rule.id, icon: 'warnings', tone: 'warning', title: trigger.rule.title, detail: `${trigger.observation.value} ${trigger.observation.unit} · condition rule`, href: '#warnings' });

  if (isCoolingDemoVehicle(vehicle)) {
    const run = runs.find(r => r.vehicleId === vehicle.id && r.profile === vehicle.profile && r.selected);
    if (run) {
      const current = coolingMatchesSettings(run, configuration.assessmentTime, configuration.observationMaxAgeHours);
      signals.push({ id: `cooling-${run.id}`, icon: current && run.result.status === 'anomaly' ? 'warnings' : 'activity',
        tone: !current ? 'neutral' : run.result.status === 'deteriorating' ? 'prediction' : run.result.status === 'anomaly' ? 'warning' : 'neutral',
        title: !current ? 'Cooling demo · review needed' : run.result.status === 'deteriorating' ? 'Cooling demo · rising trend' : 'Cooling demo',
        detail: !current ? 'Saved assessment no longer matches settings' : run.result.crossingAt ? `Demo reference: ${formatUtc(run.result.crossingAt)}` : coolingStatusLabels[run.result.status],
        href: maintenanceHref(vehicle.id, run.id) });
    }
  }
  if (isLubricationDemoVehicle(vehicle)) {
    const run = lubricationRuns.find(r => r.vehicleId === vehicle.id && r.profile === vehicle.profile && r.selected);
    if (run) {
      const current = lubricationMatchesSettings(run, configuration.assessmentTime, configuration.observationMaxAgeHours);
      signals.push({ id: `lubrication-${run.id}`, icon: current && run.result.status === 'anomaly' ? 'warnings' : 'activity',
        tone: !current ? 'neutral' : run.result.status === 'deteriorating' ? 'prediction' : run.result.status === 'anomaly' ? 'warning' : 'neutral',
        title: !current ? 'Lubrication demo · review needed' : run.result.status === 'deteriorating' ? 'Oil-pressure demo · falling trend' : 'Lubrication demo',
        detail: !current ? 'Saved assessment no longer matches settings' : run.result.crossingAt ? `Demo reference: ${formatUtc(run.result.crossingAt)}` : lubricationStatusLabels[run.result.status],
        href: maintenanceHref(vehicle.id, run.id, 'predictions', 'lubrication') });
    }
  }
  for (const warning of vehicle.warnings.filter(w => w.sourceType === 'simulated_forecast' && w.current === true)) signals.push({ id: warning.id, icon: 'activity', tone: 'prediction', title: warning.title, detail: 'Pre-entered demo forecast', href: '#warnings' });
  if (!signals.length) signals.push({ id: 'no-rule-alert', icon: 'activity', tone: 'neutral', title: 'No current rule alert', detail: 'Not a fault-free assessment' });
  return signals;
}
