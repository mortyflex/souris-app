// Souris — AgendaViewSwitcher
//
// The Jour / Semaine switch of the Agenda header: the shared light-glass
// SegmentedControl (DESIGN_OVERRIDES.md §21) with the Agenda's own two views.

import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';

export type AgendaViewMode = 'day' | 'week';

interface AgendaViewSwitcherProps {
  readonly mode: AgendaViewMode;
  readonly onChange: (mode: AgendaViewMode) => void;
}

const VIEW_OPTIONS: readonly SegmentedControlOption<AgendaViewMode>[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
];

export function AgendaViewSwitcher({ mode, onChange }: AgendaViewSwitcherProps) {
  return (
    <SegmentedControl
      onChange={onChange}
      options={VIEW_OPTIONS}
      testID="agenda-view-switcher"
      value={mode}
    />
  );
}
