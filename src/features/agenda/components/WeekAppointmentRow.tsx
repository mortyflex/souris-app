import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { colors, foregroundSoft, spacing } from '@/shared/ui/theme';

import { getAgendaAppointmentPalette } from '../appointment-palette';
import type { AgendaFixtureAppointment } from '../fixtures/agenda-fixtures';
import { getWeekAppointmentServiceSummary } from '../calendar/week-appointments';

interface WeekAppointmentRowProps {
  readonly value: AgendaFixtureAppointment;
}

export function WeekAppointmentRow({ value }: WeekAppointmentRowProps) {
  const { appointment, clientName } = value;
  const palette = getAgendaAppointmentPalette(appointment.id);
  const startAt = appointment.startAt;
  const time = `${startAt.getHours().toString().padStart(2, '0')}:${startAt
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
  const serviceSummary = getWeekAppointmentServiceSummary(appointment);

  return (
    <View
      accessible
      accessibilityLabel={`${time}, ${clientName}, ${serviceSummary}`}
      style={styles.row}
    >
      <View style={[styles.marker, { backgroundColor: palette.accent }]} />
      <AppText variant="metadata" style={styles.time}>
        {time}
      </AppText>
      <View style={styles.body}>
        <AppText variant="rowTitle" numberOfLines={1} style={styles.clientName}>
          {clientName}
        </AppText>
        <AppText variant="metadata" numberOfLines={1} style={{ color: palette.secondaryText }}>
          {serviceSummary}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 60,
    paddingVertical: spacing.sm,
  },
  marker: { borderRadius: 2, height: 30, marginRight: spacing.sm, width: 3 },
  time: { color: foregroundSoft, width: 54 },
  body: { flex: 1, minWidth: 0, paddingRight: spacing.sm },
  clientName: { lineHeight: 18 },
});
