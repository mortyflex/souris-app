// Souris — Appointment schedule section (Appointment Creation, Cliente step)
//
// The « Rendez-vous » group of the first creation step, in the same family as
// « Modifier le rendez-vous » (DESIGN_OVERRIDES.md §27): ONE grouped surface,
// two rows. Date is read-only — it is the Agenda day the flow was opened from,
// so no chevron and no button role. Heure is the only action: the whole row
// gives one selection haptic and opens the shared start-time wheels inline.
// No Cliente row: the Client is chosen in the search + list right below.
// The Résumé reuses the same group and passes `endAt` to show the range.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';

import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import {
  GROUPED_DATA_ROW_SEPARATOR_INSET,
  GroupedDataRow,
} from '@/shared/ui/GroupedDataRow';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { foregroundSoft, spacing } from '@/shared/ui/theme';

import type { StartTimeOfDay } from '../draft-start';
import {
  formatCreationDate,
  formatCreationDateShort,
  formatCreationTime,
} from '../presentation';
import { StartTimePicker } from './StartTimePicker';

interface AppointmentScheduleSectionProps {
  readonly startAt: Date;
  /** Résumé only: the Heure row then reads the whole range `11:00 – 11:45`. */
  readonly endAt?: Date;
  /** Called with the time of day chosen on the wheels. */
  readonly onStartTimeChange: (time: StartTimeOfDay) => void;
  /** Hours offered by the wheels, both inclusive. */
  readonly minHour: number;
  readonly maxHour: number;
}

const dateIcon: SymbolViewProps['name'] = { ios: 'calendar', android: 'calendar_today' };
const timeIcon: SymbolViewProps['name'] = { ios: 'clock', android: 'schedule' };

export function AppointmentScheduleSection({
  startAt,
  endAt,
  onStartTimeChange,
  minHour,
  maxHour,
}: AppointmentScheduleSectionProps) {
  const [editingTime, setEditingTime] = useState(false);
  const startLabel = formatCreationTime(startAt);
  const endLabel = endAt ? formatCreationTime(endAt) : undefined;

  return (
    <View style={styles.section}>
      <AppText variant="eyebrow" style={styles.eyebrow}>
        RENDEZ-VOUS
      </AppText>
      <GroupedSurface testID="appointment-schedule">
        <GroupedDataRow
          accessibilityValueLabel={formatCreationDate(startAt)}
          icon={dateIcon}
          label="Date"
          testID="appointment-date"
          value={formatCreationDateShort(startAt)}
        />
        <GroupedSeparator inset={GROUPED_DATA_ROW_SEPARATOR_INSET} />
        <GroupedDataRow
          accessibilityHint="Changer l'heure"
          accessibilityValueLabel={endLabel ? `${startLabel} à ${endLabel}` : undefined}
          expanded={editingTime}
          icon={timeIcon}
          label="Heure"
          onPress={() => {
            haptics.selection();
            setEditingTime((current) => !current);
          }}
          testID="time-modifier"
          value={endLabel ? `${startLabel} – ${endLabel}` : startLabel}
        />
        {editingTime && (
          <View style={styles.timePicker}>
            <StartTimePicker
              maxHour={maxHour}
              minHour={minHour}
              onChange={onStartTimeChange}
              onDone={() => setEditingTime(false)}
              startAt={startAt}
            />
          </View>
        )}
      </GroupedSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  eyebrow: { color: foregroundSoft },
  timePicker: { paddingBottom: spacing.sm, paddingHorizontal: spacing.base },
});
