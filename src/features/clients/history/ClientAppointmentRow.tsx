// Souris — Client appointment history row
//
// One Souris Appointment of a Client, shared by the profile preview and the
// complete « Rendez-vous » history: date + time, prestation summary, amount
// and chevron in one grouped row. Only an exceptional outcome (cancellation,
// no-show) is named, in rose: a completed or upcoming Appointment shows no
// status line, the Appointment Details keep it. Everything reads the Appointment snapshot
// through the existing appointment formatters; the whole row opens the
// existing Appointment Details.

import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { Appointment } from '@/domain/appointments';
import {
  formatAppointmentDate,
  formatAppointmentServiceSummary,
  formatAppointmentTime,
  formatCancellationActorLabel,
  formatPrice,
  getAppointmentSnapshotTotal,
  getAppointmentStatusLabel,
} from '@/features/appointments/presentation';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, rose, semanticColors, spacing } from '@/shared/ui/theme';

import { formatClientHistoryDate } from '../profile/presentation';

interface ClientAppointmentRowProps {
  readonly appointment: Appointment;
  readonly onPress: () => void;
}

export function ClientAppointmentRow({ appointment, onPress }: ClientAppointmentRowProps) {
  const isException = appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW';
  const statusLabel = !isException
    ? undefined
    : appointment.status === 'CANCELLED' && appointment.cancellation
      ? formatCancellationActorLabel(appointment.cancellation.cancelledBy)
      : getAppointmentStatusLabel(appointment.status);
  const summary = formatAppointmentServiceSummary(appointment);
  const time = formatAppointmentTime(appointment.startAt);
  const price = formatPrice(getAppointmentSnapshotTotal(appointment));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        `Rendez-vous du ${formatAppointmentDate(appointment.startAt)} à ${time}`,
        summary,
        price,
        statusLabel,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={`client-appointment-${appointment.id}`}
    >
      <View style={styles.when}>
        <AppText variant="control" numberOfLines={2} style={styles.date}>
          {formatClientHistoryDate(appointment.startAt)}
        </AppText>
        <AppText variant="metadata" style={styles.time}>
          {time}
        </AppText>
      </View>
      <View style={styles.copy}>
        <AppText variant="body" numberOfLines={2} style={styles.summary}>
          {summary}
        </AppText>
        {statusLabel && (
          <AppText variant="metadata" numberOfLines={1} style={styles.exceptionStatus}>
            {statusLabel}
          </AppText>
        )}
      </View>
      <AppText variant="control" style={styles.price}>
        {price}
      </AppText>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={13}
        tintColor={semanticColors.foregroundMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  // Fixed column: the summaries line up from row to row; a past year wraps.
  when: { flexShrink: 0, gap: 1, width: 104 },
  date: { color: semanticColors.foreground },
  time: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  copy: { flex: 1, gap: 1, minWidth: 0 },
  summary: { color: semanticColors.foreground },
  exceptionStatus: { color: rose.rose600 },
  price: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
