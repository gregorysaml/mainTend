import { useState } from 'react';
import type { Assessment, ScenarioConfig, Vehicle } from '../../../../shared/types.ts';
import type { CoolingRun } from '../../../../shared/cooling.ts';
import type { LubricationRun } from '../../../../shared/lubrication.ts';
import type { Reload } from '../maintenance/ActionForms.tsx';
import { VehicleAvatar } from '../vehicles/VehicleAvatar.tsx';
import { VehicleProfileEditor } from '../vehicles/VehicleProfileEditor.tsx';
import { ReadingCard } from '../../components/telematics/ReadingCard.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Tabs,TabsList,TabsTrigger,TabsContent } from '../../components/ui/tabs.tsx';
import { Icon } from '../../components/Icon.tsx';
import { warningOrigin } from '../../utils/warning-origin.ts';
import { latestOdometer } from '../../utils/vehicle-identity.ts';
import { formatUtc } from '../../utils/date.ts';
import { maintenanceHref } from '../predictive/presentation.ts';
import { MeasurementHistory } from '../../components/MeasurementHistory.tsx';
import { VehicleProfile } from '../../components/VehicleProfile.tsx';
import { FleetMap } from '../../components/FleetMap.tsx';
import {OwnerJourneys} from './OwnerJourneys.tsx';
import {CapabilitySummary} from '../maintenance/CapabilitySummary.tsx';
import {isCurrentCondition} from '../../../../shared/selected-warnings.ts';
import { VehicleMaintenancePlan } from '../maintenance/ActionRecord.tsx';
import { CoolingSummary } from '../predictive/CoolingWorkspace.tsx';
import { LubricationSummary } from '../predictive/LubricationWorkspace.tsx';
import '../../components/dashboard.css';
export function OwnerOverview({ vehicle, assessment, configuration, reload, coolingRuns, lubricationRuns }: { vehicle:Vehicle; assessment:Assessment; configuration:ScenarioConfig; reload:Reload; coolingRuns:CoolingRun[]; lubricationRuns:LubricationRun[] }) {
  const [tab,setTab] = useState('history');
  const details=vehicle.details, odometer=latestOdometer(vehicle), warnings=vehicle.warnings.filter(w => w.current !== false);
  const prediction=warnings.find(w => ['computed_cooling','computed_lubrication'].includes(w.sourceType));
  const next=warnings.some(isCurrentCondition)?'#warnings':prediction ? maintenanceHref(vehicle.id,prediction.sourceRef,'predictions',prediction.sourceType === 'computed_lubrication' ? 'lubrication' : 'cooling') : warnings.length || assessment.gaps.length ? '#warnings' : '#maintenance';
  return <div className="owner-v3">
    <section className="owner-identity-band"><VehicleAvatar vehicle={vehicle} large /><div className="owner-name"><span className="section-kicker">MY VEHICLE</span><h2>{vehicle.displayName}</h2><p>{vehicle.makeModel} · {details?.modelYear ?? 'Year not recorded'}</p><span className="unit-plate">{vehicle.registration}</span></div><div className="owner-odometer"><small>Recorded mileage</small><strong>{odometer?.kilometres.toLocaleString('en-GB') ?? '—'} <span>km</span></strong><small>{odometer ? formatUtc(odometer.recordedAt) : 'Not recorded'} · not live</small><VehicleProfileEditor vehicle={vehicle} reload={reload} compact /></div></section>
    <div className="owner-care-grid"><div className="owner-care-primary">
      <section className="care-focus"><div className="care-focus-heading"><span className="section-kicker">WHAT NEEDS YOUR ATTENTION</span><Badge tone={warnings.length ? 'warning' : 'neutral'}>{warnings.length} current warnings</Badge></div><h2>{warnings.some(isCurrentCondition) ? 'A current concern needs attention.' : assessment.dataStatus !== 'Sufficient' ? 'Complete the picture first.' : warnings.length ? 'A concern worth reviewing.' : 'Your records, in one place.'}</h2><p>{assessment.dataStatus !== 'Sufficient' ? 'The assessment needs more usable measurements. Missing values are not treated as normal.' : warnings.length ? 'Understand the evidence, then choose a maintenance response.' : 'No configured demonstration rule triggered. This does not establish that your vehicle is fault-free.'}</p>
        {assessment.gaps.length > 0 && <div className="owner-gap"><Icon name="help" /><p>{assessment.gaps.map(g => `${g.parameter.replaceAll('_',' ')}: ${g.reason}`).join(' · ')}</p></div>}
        {warnings.map(w => <article className="care-concern" key={w.id}><div><Icon name={isCurrentCondition(w) ? 'warnings' : 'activity'} /><Badge tone={warningOrigin(w).tone}>{warningOrigin(w).label}</Badge></div><h3>{w.title}</h3><details><summary>Why this warning?</summary><p>{w.explanation}</p><small>Source: {w.sourceRef} · {formatUtc(w.createdAt)}</small></details></article>)}
        <Button asChild><a href={next}>{warnings.length || assessment.gaps.length ? 'Review next steps' : 'Review maintenance records'} <Icon name="arrow" size={16} /></a></Button><small className="care-limitation">Synthetic examples, not diagnoses or safe-driving assessments.</small>
      </section>
      <section className="owner-predictions"><div className="section-heading"><div><span className="section-kicker">LOOK AHEAD</span><h2>Predictive examples</h2></div><Icon name="activity" /></div><CoolingSummary vehicle={vehicle} runs={coolingRuns} configuration={configuration} /><LubricationSummary vehicle={vehicle} runs={lubricationRuns} configuration={configuration} /></section>
      <section className="owner-tasks"><VehicleMaintenancePlan vehicle={vehicle} assessmentTime={configuration.assessmentTime} reload={reload} /></section>
    </div><aside className="owner-care-aside"><section className="owner-readings"><div className="section-heading"><div><span className="section-kicker">LATEST STORED DATA</span><h2>Recorded readings</h2></div><Icon name="activity" /></div><div className="owner-reading-grid"><ReadingCard vehicle={vehicle} configuration={configuration} parameter="battery_voltage" title="Battery voltage" /><ReadingCard vehicle={vehicle} configuration={configuration} parameter="engine_coolant_temperature" title="Coolant temperature" /></div></section>
      <OwnerJourneys vehicle={vehicle} assessmentTime={configuration.assessmentTime}/><section className="owner-service"><span className="service-icon"><Icon name="maintenance" /></span><span className="section-kicker">SERVICE BOOK</span><h2>Last recorded service</h2><strong>{details?.lastServiceAt ?? 'Not recorded'}</strong><p>{details ? `${details.lastServiceKm.toLocaleString('en-GB')} km at service` : 'No service values assumed.'}</p>{details && odometer && odometer.kilometres >= details.lastServiceKm && <div className="service-distance"><strong>{(odometer.kilometres-details.lastServiceKm).toLocaleString('en-GB')} km</strong><span>recorded since service</span></div>}<small>No manufacturer service-due interval inferred.</small><Button asChild variant="secondary"><a href="#maintenance">Open service records <Icon name="next" size={16} /></a></Button></section>
    </aside></div>
    <CapabilitySummary key={`${vehicle.makeModel}-${details?.modelYear}-${details?.fuelType}`} vehicleId={vehicle.id} profile="owner" assessmentTime={configuration.assessmentTime}/>
    <section className="owner-records"><div className="section-heading"><div><span className="section-kicker">THE COMPLETE PICTURE</span><h2>Explore your vehicle records</h2></div><Badge>Recorded · not live</Badge></div><Tabs value={tab} onValueChange={setTab}><TabsList aria-label="My vehicle records"><TabsTrigger value="history">History</TabsTrigger><TabsTrigger value="location">Location</TabsTrigger><TabsTrigger value="tyres">Tyres</TabsTrigger><TabsTrigger value="profile">Equipment & profile</TabsTrigger></TabsList>
      <TabsContent value="history" forceMount hidden={tab !== 'history'}><MeasurementHistory vehicle={vehicle} configuration={configuration} initialParameter="battery_voltage" /></TabsContent>
      <TabsContent value="location" hidden={tab !== 'location'}>{tab==='location'&&<><OwnerJourneys vehicle={vehicle} assessmentTime={configuration.assessmentTime} full/><FleetMap vehicles={[vehicle]} assessments={[assessment]} profile="owner" /></>}</TabsContent>
      <TabsContent value="tyres" forceMount hidden={tab !== 'tyres'}><div className="owner-tyre-records">{details?.tyres.map(t => <article key={t.position}><span className="section-kicker">{t.position}</span><h3>{t.pressureBar} <small>bar recorded</small></h3><p>{t.treadMm} mm tread · {t.size}</p><strong>{t.brand} · {t.model}</strong><small>Measured {formatUtc(t.measuredAt)}</small><details><summary>Installation & DOT details</summary><p>DOT {t.dotCode} · {t.season}<br />Installed {t.installedAt} at {t.installedKm.toLocaleString('en-GB')} km<br />Last rotation {t.lastRotationAt}</p></details></article>)}</div>{!details?.tyres.length && <p>No tyre records. No normal condition assumed.</p>}<p className="panel-note">Recorded values from the baseline or user entries. Not live TPMS, recommended pressures or a tyre-safety assessment.</p></TabsContent>
      <TabsContent value="profile" forceMount hidden={tab !== 'profile'}><VehicleProfile vehicle={vehicle} /></TabsContent>
    </Tabs></section>
  </div>;
}
