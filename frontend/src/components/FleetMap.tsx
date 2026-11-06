import { divIcon } from 'leaflet';
import {isCurrentCondition} from '../../../shared/selected-warnings.ts';
import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { Assessment, Profile, Vehicle } from '../../../shared/types.ts';
import { formatUtc } from '../utils/date.ts';
import 'leaflet/dist/leaflet.css';
import { Badge } from './ui/badge.tsx';
import { Icon } from './Icon.tsx';

function markerIcon(vehicle: Vehicle, assessment?: Assessment, selected = false) {
  const warning = vehicle.warnings.some(isCurrentCondition);
  const state = warning ? 'alert' : assessment?.dataStatus !== 'Sufficient' ? 'unknown' : 'healthy';
  return divIcon({ className: 'vehicle-map-target', html: `<div class="map-marker ${state}${selected ? ' marker-selected' : ''}"><span>◆</span></div>`, iconSize: [44, 44], iconAnchor: [22, 42] });
}
function MapSelection({ vehicle }: { vehicle?: Vehicle }) { const map = useMap(); useEffect(() => { if (vehicle?.location) map.setView([vehicle.location.latitude, vehicle.location.longitude], map.getZoom(), { animate: false }); }, [map, vehicle?.id, vehicle?.location?.latitude, vehicle?.location?.longitude]); return null; }

export function FleetMap({ vehicles, assessments, profile, selectedVehicleId, onSelect }: { vehicles: Vehicle[]; assessments: Assessment[]; profile: Profile; selectedVehicleId?: string; onSelect?: (id: string) => void }) {
  const located = vehicles.filter((vehicle) => vehicle.location);
  const centre: [number, number] = located.length === 1 && located[0].location ? [located[0].location.latitude, located[0].location.longitude] : [37.9838, 23.7275];
  return <section className="map-shell" aria-label="Synthetic vehicle locations">
    <div className="map-heading"><div><span className="section-kicker">{profile === 'fleet' ? 'FLEET MAP' : 'MY VEHICLE LOCATION'}</span><h2>{profile === 'fleet' ? 'Location overview' : 'Vehicle location'}</h2></div><Badge tone="synthetic"><Icon name="location" size={12} />Synthetic</Badge></div>
    <MapContainer center={centre} zoom={located.length === 1 ? 13 : 11} scrollWheelZoom={false} className="map">
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapSelection vehicle={vehicles.find(vehicle => vehicle.id === selectedVehicleId)} />
      {located.map((vehicle) => <Marker key={vehicle.id} title={`Select ${vehicle.registration}`} alt={`Synthetic location ${vehicle.registration}`} eventHandlers={{ click: () => onSelect?.(vehicle.id) }} position={[vehicle.location!.latitude, vehicle.location!.longitude]} icon={markerIcon(vehicle, assessments.find((a) => a.vehicleId === vehicle.id), vehicle.id === selectedVehicleId)}>
        <Popup><strong>{vehicle.displayName}</strong><br />{vehicle.registration}<br />{vehicle.location!.label}<br /><span>{vehicle.warnings.some(isCurrentCondition) ? 'Current recorded condition · synthetic evidence' : assessments.find(a => a.vehicleId === vehicle.id)?.dataStatus !== 'Sufficient' ? 'Rule data incomplete' : 'No current condition alert · not a fault-free verdict'}</span><br /><small>Synthetic position · {formatUtc(vehicle.location!.recordedAt)}</small>{onSelect && <><br /><button type="button" className="map-select-vehicle" onClick={() => onSelect(vehicle.id)}>Review {vehicle.registration}</button></>}</Popup>
      </Marker>)}
    </MapContainer>
    <p className="map-note">Synthetic positions · not live GPS. Tiles require internet.</p>
    {onSelect && <div className="map-location-list" aria-label="Vehicle locations as text">{vehicles.map(vehicle => <button type="button" key={vehicle.id} aria-pressed={selectedVehicleId === vehicle.id} onClick={() => onSelect(vehicle.id)}><Icon name="location" size={14} /><span><strong>{vehicle.registration}</strong><small>{vehicle.location ? `${vehicle.location.label} · ${formatUtc(vehicle.location.recordedAt)}` : 'No location recorded'}</small></span></button>)}</div>}
  </section>;
}
