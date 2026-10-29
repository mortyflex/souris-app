import { StyleSheet, View } from 'react-native';

import type { TimelinePhase } from '@/domain/appointments';
import {
  getPhaseDisplayName,
  type CatalogueOrganization,
} from '@/features/services/catalogue-presentation';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, peach, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { formatAppointmentTime, formatDurationMinutes } from '../presentation';

interface AppointmentPhaseRowProps {
  readonly phase: TimelinePhase;
  readonly isFirst: boolean;
  /** How the profession's catalogue is organised (the waiting-phase name); Services / Techniques by default. */
  readonly organization?: CatalogueOrganization;
}

export function AppointmentPhaseRow({
  phase,
  isFirst,
  organization = 'SERVICE_TYPES',
}: AppointmentPhaseRowProps) {
  const processing = !phase.requiresStaff;
  const name = getPhaseDisplayName(
    { name: phase.phaseName, requiresStaff: phase.requiresStaff },
    organization,
  );

  return (
    <View style={[styles.row, !isFirst && styles.spaced, processing && styles.processingRow]}>
      <View style={[styles.phaseBar, processing ? styles.processingBar : styles.activeBar]} />
      <AppText variant="metadata" style={styles.startTime}>
        {formatAppointmentTime(phase.startAt)}
      </AppText>
      <View style={styles.body}>
        <AppText variant="body" numberOfLines={2} style={styles.phaseName}>
          {name}
        </AppText>
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
  startTime: { color: foregroundSoft, flexShrink: 0, fontVariant: ['tabular-nums'], width: 40 },
  body: { flex: 1, gap: 1, minWidth: 0 },
  phaseName: { fontSize: 13, lineHeight: 18 },
  duration: { color: foregroundSoft, flexShrink: 0, fontVariant: ['tabular-nums'], marginLeft: spacing.sm },
});
