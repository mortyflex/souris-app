import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import {
  foregroundSoft,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { isSameLocalDay } from '../calendar/week';
import { WeekAppointmentRow } from './WeekAppointmentRow';

interface WeekDaySectionProps {
  readonly day: Date;
  readonly appointments: readonly AppointmentSessionEntry[];
  readonly selectedDay: Date;
  readonly today: Date;
  readonly onSelectDay: (day: Date) => void;
}

const weekdayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

export function WeekDaySection({
  day,
  appointments,
  selectedDay,
  today,
  onSelectDay,
}: WeekDaySectionProps) {
  const selected = isSameLocalDay(day, selectedDay);
  const isToday = isSameLocalDay(day, today);
  const formattedWeekday = weekdayFormatter.format(day).replace(/\.$/, '');
  const weekday = `${formattedWeekday.charAt(0).toUpperCase()}${formattedWeekday.slice(1)}`;
  const countLabel = appointments.length === 1 ? '1 rendez-vous' : `${appointments.length} rendez-vous`;

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${weekday} ${day.getDate()}, ${appointments.length > 0 ? countLabel : 'aucun rendez-vous'}`}
        accessibilityHint="Ouvre la vue Jour pour cette date"
        accessibilityState={{ selected }}
        onPress={() => onSelectDay(day)}
        style={({ pressed }) => [
          styles.dayHeader,
          selected && styles.selectedDayHeader,
          pressed && styles.pressedDayHeader,
        ]}
      >
        <View style={styles.dayHeading}>
          <AppText variant="control" style={styles.weekday}>
            {weekday}
          </AppText>
          <AppText variant="rowTitle" style={[styles.dayNumber, selected && styles.selectedText]}>
            {day.getDate()}
          </AppText>
          {isToday && <View style={styles.todayDot} />}
        </View>
        {appointments.length > 0 && (
          <AppText variant="metadata" style={styles.count}>
            {countLabel}
          </AppText>
        )}
      </Pressable>
      {appointments.length > 0 ? (
        <View style={styles.rows}>
          {appointments.map((value) => (
            <WeekAppointmentRow key={value.appointment.id} value={value} />
          ))}
        </View>
      ) : (
        <AppText variant="metadata" style={styles.empty}>
          Aucun rendez-vous
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
  },
  dayHeader: {
    alignItems: 'center',
    borderRadius: radii.medium,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.xs,
  },
  selectedDayHeader: {
    backgroundColor: semanticColors.surfaceLavender,
    borderLeftColor: semanticColors.accent,
    borderLeftWidth: 3,
  },
  pressedDayHeader: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  dayHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  weekday: { color: foregroundSoft },
  dayNumber: { fontSize: 15 },
  selectedText: { color: semanticColors.accent },
  todayDot: { backgroundColor: semanticColors.accent, borderRadius: 3, height: 6, width: 6 },
  count: { color: foregroundSoft },
  rows: { paddingLeft: spacing.xs },
  empty: { color: foregroundSoft, paddingHorizontal: spacing.xs, paddingVertical: spacing.lg },
});
