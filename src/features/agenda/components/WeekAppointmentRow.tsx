import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from '@/shared/ui/AppText';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { colors, foregroundSoft, spacing } from '@/shared/ui/theme';

import { getAgendaAppointmentPalette } from '../appointment-palette';
import { getWeekAppointmentServiceSummary } from '../calendar/week-appointments';

interface WeekAppointmentRowProps {
  readonly value: AppointmentSessionEntry;
}

export function WeekAppointmentRow({ value }: WeekAppointmentRowProps) {
  const router = useRouter();
  const { appointment, clientDisplayName } = value;
  const palette = getAgendaAppointmentPalette(appointment.id);
  const startAt = appointment.startAt;
  const time = `${startAt.getHours().toString().padStart(2, '0')}:${startAt
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
  const serviceSummary = getWeekAppointmentServiceSummary(appointment);

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${time}, ${clientDisplayName}, ${serviceSummary}`}
      onPress={() =>
        router.push({
          pathname: '/appointments/[appointmentId]',
          params: { appointmentId: appointment.id },
        })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.marker, { backgroundColor: palette.accent }]} />
      <AppText variant="metadata" style={styles.time}>
        {time}
      </AppText>
      <View style={styles.body}>
        <AppText variant="rowTitle" numberOfLines={1} style={styles.clientName}>
          {clientDisplayName}
        </AppText>
        <AppText variant="metadata" numberOfLines={1} style={{ color: palette.secondaryText }}>
          {serviceSummary}
        </AppText>
      </View>
    </Pressable>
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
  pressed: { opacity: 0.78 },
});
