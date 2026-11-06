import { validDueDate } from '../../../shared/maintenance.ts';
import { tyrePositions, type VehicleProfileInput } from '../../../shared/vehicle-profile.ts';

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(value, k))) throw new Error('Provide exactly the required profile fields.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
function number(value: unknown, label: string, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) throw new Error(`${label} must be ${integer ? 'a whole number' : 'a number'} between 0 and ${max}.`);
  return value;
}
function date(value: unknown, label: string, now: string): string {
  if (!validDueDate(value) || value > now.slice(0, 10)) throw new Error(`${label} must be a valid date, not in the future (UTC).`);
  return value;
}
function timestamp(value: unknown, label: string, now: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z$/.test(value) || !validDueDate(value.slice(0, 10)) || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || (value.length > 17 && Number(value.slice(17, 19)) > 59) || !Number.isFinite(Date.parse(value)) || Date.parse(value) > Date.parse(now)) throw new Error(`${label} must be a valid UTC timestamp, not in the future.`);
  return new Date(value).toISOString();
}
export function validateProfileInput(raw: unknown, now = new Date().toISOString()): VehicleProfileInput {
  const input = object(raw, ['profile', 'revision', 'note', 'section', 'value']);
  if (input.profile !== 'owner' && input.profile !== 'fleet') throw new Error('Profile must be owner or fleet.');
  number(input.revision, 'Revision', Number.MAX_SAFE_INTEGER, true);
  const note = text(input.note, 'Change note', 1000);
  let value: unknown;
  switch (input.section) {
    case 'mileage': {
      const v = object(input.value, ['kilometres', 'recordedAt']);
      value = { kilometres: number(v.kilometres, 'Mileage', 2_000_000, true), recordedAt: timestamp(v.recordedAt, 'Mileage time', now) }; break;
    }
    case 'service': {
      const v = object(input.value, ['lastServiceAt', 'lastServiceKm']);
      value = { lastServiceAt: date(v.lastServiceAt, 'Service date', now), lastServiceKm: number(v.lastServiceKm, 'Service mileage', 2_000_000, true) }; break;
    }
    case 'equipment': {
      if (!Array.isArray(input.value) || input.value.length > 40) throw new Error('Provide up to 40 equipment entries.');
      value = input.value.map(v => text(v, 'Equipment', 80));
      const entries = value as string[];
      if (new Set(entries.map(v => v.toLowerCase())).size !== entries.length) throw new Error('Equipment entries must be unique.');
      break;
    }
    case 'tyres': {
      if (!Array.isArray(input.value) || input.value.length > 4) throw new Error('Provide up to four tyre records.');
      value = input.value.map(rawTyre => {
        const t = object(rawTyre, ['position', 'brand', 'model', 'size', 'season', 'dotCode', 'installedAt', 'installedKm', 'pressureBar', 'treadMm', 'measuredAt', 'lastRotationAt']);
        if (!tyrePositions.includes(t.position as typeof tyrePositions[number])) throw new Error('Invalid tyre position.');
        const installedAt = date(t.installedAt, 'Tyre installation', now);
        const measuredAt = timestamp(t.measuredAt, 'Tyre measurement', now);
        const lastRotationAt = date(t.lastRotationAt, 'Last rotation', now);
        if (installedAt > measuredAt.slice(0, 10) || lastRotationAt < installedAt || lastRotationAt > measuredAt.slice(0, 10)) throw new Error('Tyre dates must follow installation → rotation → measurement.');
        const dotCode = text(t.dotCode, 'DOT week/year', 4);
        if (!/^\d{4}$/.test(dotCode) || Number(dotCode.slice(0, 2)) < 1 || Number(dotCode.slice(0, 2)) > 53 || Number(dotCode.slice(2)) > Number(installedAt.slice(2, 4))) throw new Error('DOT must be WWYY (week 01–53, year no later than installation).');
        return { position: t.position, brand: text(t.brand, 'Brand'), model: text(t.model, 'Model'), size: text(t.size, 'Size', 40), season: text(t.season, 'Season', 40), dotCode, installedAt, lastRotationAt, measuredAt, installedKm: number(t.installedKm, 'Installation mileage', 2_000_000, true), pressureBar: number(t.pressureBar, 'Recorded pressure', 10), treadMm: number(t.treadMm, 'Recorded tread depth', 30) };
      });
      if (new Set((value as { position: string }[]).map(t => t.position)).size !== (value as unknown[]).length) throw new Error('Each tyre position can appear only once.');
      break;
    }
    case 'photo': {
      if (input.value === null) { value = null; break; }
      const p = object(input.value, ['dataUrl', 'description']);
      const match = typeof p.dataUrl === 'string' && p.dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match || match[2].length > 700_000) throw new Error('Use a local JPEG, PNG or WebP image smaller than 500 KB after resizing.');
      const bytes = Buffer.from(match[2], 'base64');
      if (bytes.toString('base64') !== match[2] || bytes.length > 500_000 || bytes.length < 16) throw new Error('Invalid or oversized image.');
      const valid = match[1] === 'jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) && bytes.subarray(-2).equals(Buffer.from([255, 217])) : match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
      if (!valid) throw new Error('Image content does not match its file type.');
      value = { dataUrl: p.dataUrl, description: text(p.description, 'Photo description', 200) }; break;
    }
    default: throw new Error('Unknown profile section.');
  }
  return { ...input, note, value } as VehicleProfileInput;
}
