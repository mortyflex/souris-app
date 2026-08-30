import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from '@/shared/ui/AppText';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import {
  getAppointmentStatusLabel,
  isTerminalAppointmentStatus,
} from '@/features/appointments/presentation';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { getAgendaAppointmentPalette } from '../appointment-palette';
import { getWeekAppointmentServiceSummary } from '../calendar/week-appointments';

interface WeekAppointmentRowProps {
  readonly value: AppointmentSessionEntry;
}

export function WeekAppointmentRow({ value }: WeekAppointmentRowProps) {
  const router = useRouter();
  const { getClientById } = useClientSession();
  const { appointment } = value;
  const clientDisplayName = getResolvedClientDisplayName(getClientById(appointment.clientId));
  const palette = getAgendaAppointmentPalette(appointment.id);
  const startAt = appointment.startAt;
  const time = `${startAt.getHours().toString().padStart(2, '0')}:${startAt
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
  const serviceSummary = getWeekAppointmentServiceSummary(appointment);
  const statusLabel = isTerminalAppointmentStatus(appointment.status)
    ? getAppointmentStatusLabel(appointment.status)
    : undefined;
  const isCompleted = appointment.status === 'COMPLETED';

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={[time, clientDisplayName, serviceSummary, statusLabel]
        .filter(Boolean)
        .join(', ')}
      onPress={() =>
        router.push({
          pathname: '/appointments/[appointmentId]',
          params: { appointmentId: appointment.id },
        })
      }
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: palette.background },
      ]}
    >
      <View
        style={[
          styles.marker,
          {
            backgroundColor: isCompleted ? semanticColors.foregroundMuted : palette.accent,
          },
        ]}
      />
      <AppText variant="metadata" style={styles.time}>
        {time}
      </AppText>
      <View style={styles.body}>
        <AppText
          variant="rowTitle"
          numberOfLines={1}
          style={[
            styles.clientName,
            isTerminalAppointmentStatus(appointment.status) && styles.terminalClientName,
          ]}
        >
          {clientDisplayName}
        </AppText>
        <AppText variant="metadata" numberOfLines={1} style={styles.serviceSummary}>
          {serviceSummary}
          {statusLabel && (
            <AppText variant="metadata" style={styles.completedStatus}>
              {` · ${statusLabel}`}
            </AppText>
          )}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderRadius: radii.medium,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  marker: { borderRadius: 2, height: 26, marginRight: spacing.sm, width: 3 },
  time: { color: foregroundSoft, width: 54 },
  body: { flex: 1, minWidth: 0, paddingRight: spacing.sm },
  clientName: { lineHeight: 18 },
  terminalClientName: { color: foregroundSoft },
  serviceSummary: { color: foregroundSoft },
  completedStatus: { color: foregroundSoft },
});
