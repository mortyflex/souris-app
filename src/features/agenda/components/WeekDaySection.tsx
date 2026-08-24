import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { colors, foregroundSoft, lavender, spacing } from '@/shared/ui/theme';

import type { AgendaFixtureAppointment } from '../fixtures/agenda-fixtures';
import { isSameLocalDay } from '../calendar/week';
import { WeekAppointmentRow } from './WeekAppointmentRow';

interface WeekDaySectionProps {
  readonly day: Date;
  readonly appointments: readonly AgendaFixtureAppointment[];
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
  const weekday = weekdayFormatter.format(day).replace(/\.$/, '').toUpperCase();
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
          <AppText variant="eyebrow" style={styles.weekday}>
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
  section: { paddingBottom: spacing.md },
  dayHeader: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.xs,
  },
  selectedDayHeader: {
    backgroundColor: lavender.lav025,
    borderLeftColor: lavender.lav700,
    borderLeftWidth: 3,
  },
  pressedDayHeader: { opacity: 0.78 },
  dayHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  weekday: { color: foregroundSoft, fontSize: 11, letterSpacing: 0.8 },
  dayNumber: { fontSize: 15 },
  selectedText: { color: lavender.lav700 },
  todayDot: { backgroundColor: lavender.lav700, borderRadius: 3, height: 6, width: 6 },
  count: { color: foregroundSoft },
  rows: { paddingLeft: spacing.xs },
  empty: { color: foregroundSoft, paddingHorizontal: spacing.xs, paddingVertical: spacing.lg },
});
