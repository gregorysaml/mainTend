import { useState } from 'react';
import type { Vehicle } from '../../../shared/types.ts';
import { formatUtc } from '../utils/date.ts';
import './vehicle-evidence.css';
import { mileageSourceLabel } from '../utils/vehicle-identity.ts';

export function VehicleProfile({ vehicle }: { vehicle: Vehicle }) {
  const [imageFailed, setImageFailed] = useState(false);
  const details = vehicle.details;
  if (!details) return <p className="muted">Vehicle specifications have not been recorded.</p>;
  const odometer = details.odometerHistory[0];
  return <section className="vehicle-profile" aria-label={`${vehicle.displayName} specifications`}>
    <div className="vehicle-identity">
      <div><span className="section-kicker">VEHICLE PROFILE · DEMO BASELINE / USER ENTRIES</span><div className="odometer"><strong>{odometer ? odometer.kilometres.toLocaleString('en-GB') : '—'}</strong> km</div><p className="panel-note">{odometer ? `Recorded ${formatUtc(odometer.recordedAt)} · ${mileageSourceLabel(odometer.source)}` : 'No odometer reading recorded.'}</p>
        <dl className="specifications"><div><dt>Model year</dt><dd>{details.modelYear}</dd></div><div><dt>Fuel / engine</dt><dd>{details.fuelType} · {details.engineCc.toLocaleString('en-GB')} cc</dd></div><div><dt>Transmission</dt><dd>{details.transmission}</dd></div><div><dt>Colour</dt><dd>{details.colour}</dd></div><div><dt>Purchased</dt><dd>{details.purchasedAt}</dd></div><div><dt>Last recorded service</dt><dd>{details.lastServiceAt} · {details.lastServiceKm.toLocaleString('en-GB')} km</dd></div></dl>
      </div>
    </div>
    <details><summary>Equipment, tyres & mileage records</summary><h4>Equipment</h4><div className="equipment-tags">{details.equipment.map(item => <span key={item}>{item}</span>)}</div><h4>Tyres — recorded measurements</h4>
      {details.tyres.length ? <div className="tyre-grid">{details.tyres.map(tyre => <section className="tyre-card" key={tyre.position}><span className="section-kicker">{tyre.position}</span><h4>{tyre.brand} · {tyre.model}</h4><p>{tyre.size} · {tyre.season}</p><div className="tyre-metrics"><span><strong>{tyre.pressureBar}</strong> bar<small>Recorded pressure</small></span><span><strong>{tyre.treadMm}</strong> mm<small>Recorded tread depth</small></span></div><p className="panel-note">Measured {formatUtc(tyre.measuredAt)}<br />DOT week/year: {tyre.dotCode}<br />Installed: {tyre.installedAt} at {tyre.installedKm.toLocaleString('en-GB')} km<br />Last rotation: {tyre.lastRotationAt}</p></section>)}</div> : <p className="muted">No tyre records available. No normal condition is assumed.</p>}
      <p className="panel-note">Recorded values from the synthetic baseline or user entries; see profile change history for provenance. Not live TPMS, recommended pressures or a tyre-safety assessment. No replacement interval is inferred.</p>
      <h4>Odometer history</h4><div className="mileage-list">{details.odometerHistory.map(o => <div className="row" key={o.id}><strong>{o.kilometres.toLocaleString('en-GB')} km</strong><small>{formatUtc(o.recordedAt)} · {mileageSourceLabel(o.source)}</small></div>)}</div>
    </details>
    {details.photoUrl && <details><summary>{details.photoUrl.startsWith('data:') ? 'User-selected vehicle photo' : 'Existing illustrative photo (demo asset)'}</summary><figure>{imageFailed ? <p className="gap">Photo unavailable</p> : <img src={details.photoUrl} alt={details.photoDescription || 'Vehicle photo'} loading="lazy" onError={() => setImageFailed(true)} />}<figcaption>{details.photoDescription}</figcaption></figure></details>}
  </section>;
}
