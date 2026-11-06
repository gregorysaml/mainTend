import type { Warning } from '../../../shared/types.ts';
import type { BadgeTone } from '../components/ui/badge.tsx';
export function warningOrigin(warning: Pick<Warning, 'sourceType'|'attentionKind'|'selectedEvidence'|'current'>): { label: string; tone: BadgeTone } {
  switch (warning.sourceType) {
    case 'selected_forecast': return warning.current===false?{label:warning.attentionKind==='current condition'?'Recorded condition · synthetic':warning.attentionKind==='forecast'?'Saved forecast · synthetic':'Evaluation record · synthetic',tone:'neutral'}:warning.attentionKind==='current condition'?{label:'Current condition · synthetic',tone:'warning'}:warning.attentionKind==='forecast'?{label:warning.selectedEvidence?.result.status==='provider estimate'?'Provider forecast · synthetic':'Calculated forecast · synthetic',tone:'synthetic'}:{label:'Evaluation record · synthetic',tone:'neutral'};
    case 'use_plan': return { label: 'Use plan · declared inputs', tone: 'synthetic' };
    case 'rule': return { label: 'Condition rule · recorded demo data', tone: 'warning' };
    case 'computed_cooling': return { label: 'Cooling projection · synthetic', tone: 'synthetic' };
    case 'computed_lubrication': return { label: 'Lubrication projection · synthetic', tone: 'synthetic' };
    case 'simulated_forecast': return { label: 'Pre-entered forecast · synthetic', tone: 'synthetic' };
  }
}
