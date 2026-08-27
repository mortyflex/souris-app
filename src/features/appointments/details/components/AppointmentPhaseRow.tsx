import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, peach, radii, semanticColors, spacing } from '@/shared/ui/theme';
import type { TimelinePhase } from '@/domain/appointments';

import { formatAppointmentTime, formatDurationMinutes } from '../presentation';

interface AppointmentPhaseRowProps {
  readonly phase: TimelinePhase;
  readonly isFirst: boolean;
}

export function AppointmentPhaseRow({ phase, isFirst }: AppointmentPhaseRowProps) {
  const processing = !phase.requiresStaff;

  return (
    <View style={[styles.row, !isFirst && styles.spaced, processing && styles.processingRow]}>
      <View style={[styles.phaseBar, processing ? styles.processingBar : styles.activeBar]} />
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
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  spaced: { marginTop: 2 },
  processingRow: {
    backgroundColor: semanticColors.surfacePeach,
    borderRadius: radii.medium,
  },
  phaseBar: {
    alignSelf: 'stretch',
    borderRadius: radii.pill,
    marginRight: spacing.sm,
    width: 3,
  },
  activeBar: { backgroundColor: semanticColors.borderLavender },
  processingBar: { backgroundColor: peach.peach700 },
  startTime: { color: foregroundSoft, fontVariant: ['tabular-nums'], width: 40 },
  body: { flex: 1, gap: 1, minWidth: 0 },
  phaseName: { fontSize: 13, lineHeight: 18 },
  processingLabel: { color: peach.peach700, fontSize: 11 },
  duration: { color: foregroundSoft, fontVariant: ['tabular-nums'], marginLeft: spacing.sm },
});
