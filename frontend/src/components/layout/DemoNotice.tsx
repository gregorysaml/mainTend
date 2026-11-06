import type { Page } from '../../navigation/pages.ts';
import { Icon } from '../Icon.tsx';
export function DemoNotice({ page }: { page: Page }) {
  return <section className="demo-context"><div><Icon name="activity" size={15} /><strong>Controlled demo</strong><span>Recorded scenarios · not live telemetry</span></div><details><summary>About these records</summary><p>Locations and baseline vehicle data are synthetic. Profile selection is not production authentication. Demonstration thresholds are not vehicle-specific diagnostic limits; calculated projections are not diagnoses or safe-driving assessments. User entries and reported inspections are unverified.</p><a href={page === 'evaluation' ? '#overview' : '#evaluation'}>{page === 'evaluation' ? 'Back to overview' : 'Open test centre'} <Icon name="arrow" size={14} /></a></details></section>;
}
