import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { colors, foregroundSoft, peach, spacing } from '@/shared/ui/theme';
import type { TimelinePhase } from '@/domain/appointments';

import { formatAppointmentTime, formatDurationMinutes } from '../presentation';

interface AppointmentPhaseRowProps {
  readonly phase: TimelinePhase;
}

export function AppointmentPhaseRow({ phase }: AppointmentPhaseRowProps) {
  const processing = !phase.requiresStaff;

  return (
    <View style={[styles.row, processing && styles.processingRow]}>
      <View style={[styles.phaseBar, processing && styles.processingBar]} />
      <AppText variant="metadata" style={styles.startTime}>
        {formatAppointmentTime(phase.startAt)}
      </AppText>
      <View style={styles.body}>
        <AppText variant="body" numberOfLines={1} style={styles.phaseName}>
          {phase.phaseName}
        </AppText>
        {processing && (
          <AppText variant="metadata" style={styles.processingLabel}>
            Professionnelle disponible
          </AppText>
        )}
      </View>
      <AppText variant="metadata" style={styles.duration}>
        {formatDurationMinutes(phase.durationMinutes)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  processingRow: { backgroundColor: peach.peach050 },
  phaseBar: {
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    marginRight: spacing.sm,
    width: 3,
  },
  processingBar: { backgroundColor: peach.peach700 },
  startTime: { color: colors.muted, width: 48 },
  body: { flex: 1, minWidth: 0 },
  phaseName: { fontSize: 14, lineHeight: 19 },
  processingLabel: { color: peach.peach700, marginTop: 1 },
  duration: { color: foregroundSoft, marginLeft: spacing.sm },
});
