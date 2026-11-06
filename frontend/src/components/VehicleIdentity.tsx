import type { Vehicle } from '../../../shared/types.ts';
import type { ReactNode } from 'react';
import { latestOdometer } from '../utils/vehicle-identity.ts';
import { formatUtc } from '../utils/date.ts';
import './vehicle-identity.css';
import { Icon } from './Icon.tsx';
import type { VehicleSignal } from '../utils/vehicle-signals.ts';

export function VehicleIdentity({ vehicle, action, signals = [] }: { vehicle: Vehicle; action?: ReactNode; signals?: VehicleSignal[] }) {
  const odometer = latestOdometer(vehicle);
  return <header className={`vehicle-identity${signals.length ? ' identity-with-signals' : ''}`} aria-label={`Vehicle identity ${vehicle.registration}`}>
    <div className="vehicle-illustration">{vehicle.details?.photoUrl?.startsWith('data:image/') ? <><img className="identity-upload-photo" src={vehicle.details.photoUrl} alt={vehicle.details.photoDescription || 'User-selected vehicle photo'} /><small>USER PHOTO</small></> : <><svg viewBox="0 0 160 90" fill="none" role="img" aria-label="Generic vehicle illustration, not a vehicle photo">
      <path d={vehicle.profile === 'fleet' ? 'M19 60V25Q19 19 25 19H106L132 42V60Z' : 'M19 60V48L38 39L55 21H101L121 40L140 47V60Z'} fill="currentColor" fillOpacity=".15" stroke="currentColor" strokeWidth="2" />
      <path d={vehicle.profile === 'fleet' ? 'M106 24V42H126L106 24ZM91 24H99V42H91Z' : 'M59 26L47 40H82V26ZM88 26V40H111L98 26Z'} fill="currentColor" fillOpacity=".3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 61H144M73 22V58M80 46H86M23 50H31M130 51H137" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="43" cy="61" r="12" fill="var(--panel)" stroke="currentColor" strokeWidth="3" /><circle cx="117" cy="61" r="12" fill="var(--panel)" stroke="currentColor" strokeWidth="3" /><circle cx="43" cy="61" r="4" fill="currentColor" /><circle cx="117" cy="61" r="4" fill="currentColor" />
      <path d="M22 80H138" stroke="currentColor" strokeOpacity=".2" strokeWidth="2" />
    </svg><small>ILLUSTRATION</small></>}</div>
    <div className="vehicle-identity-name"><span className="identity-id">{vehicle.id}</span><h2>{vehicle.displayName}</h2><p>{vehicle.makeModel}{vehicle.details ? ` · ${vehicle.details.modelYear} · ${vehicle.details.fuelType}` : ''}</p><span className="identity-plate" aria-label={`Registration ${vehicle.registration}`}><span aria-hidden="true">REG</span>{vehicle.registration}</span></div>
    {signals.length > 0 && <div className="identity-signals" aria-label={`Current indicators for ${vehicle.registration}`}>{signals.map(signal => {
      const content = <><span className="identity-signal-icon"><Icon name={signal.icon} size={21} /></span><span><strong>{signal.title}</strong><small>{signal.detail}</small></span>{signal.href && <span className="identity-signal-arrow" aria-hidden="true">↗</span>}</>;
      return signal.href ? <a key={signal.id} className={`identity-signal signal-${signal.tone}`} href={signal.href}>{content}</a> : <div key={signal.id} className={`identity-signal signal-${signal.tone}`}>{content}</div>;
    })}</div>}
    <div className="identity-aside"><div className="identity-mileage"><small>Recorded mileage</small><strong>{odometer ? odometer.kilometres.toLocaleString('en-GB') : '—'} <span>km</span></strong><small>{odometer ? `${formatUtc(odometer.recordedAt)} · not live` : 'No mileage record'}</small></div>{action}</div>
  </header>;
}
