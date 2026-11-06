import type { Vehicle } from '../../../../shared/types.ts';
import { Icon } from '../../components/Icon.tsx';
export function VehicleAvatar({ vehicle, large = false }: { vehicle: Vehicle; large?: boolean }) {
  const photo = vehicle.details?.photoUrl;
  return <span className={`vehicle-avatar${large ? ' avatar-large' : ''}`}>{photo?.startsWith('data:image/') ? <img src={photo} alt={vehicle.details?.photoDescription || `User photo of ${vehicle.registration}`} /> : <Icon name="vehicles" size={large ? 42 : 24} />}</span>;
}
