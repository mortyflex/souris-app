// Souris — Appointment phase timing editor
//
// The compact per-phase timing block shared by the Appointment editor card
// (Creation Résumé, Modifier le rendez-vous) and the expanded Service row of
// Appointment Details. One row per snapshot phase, each with the shared
// DurationStepper. A simple SERVICE (one staff-required phase) reads as a
// single « Durée » row.
//
// The editor is presentation only: it renders the phases it is given and
// reports each change. Every owner (Creation, Editing, Details) treats the
// value as Appointment snapshot data; the Service catalog is never written.

import { StyleSheet, View } from 'react-native';

import type { AppointmentPhase, ServiceType } from '@/domain/appointments';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, peach, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { DurationStepper } from './DurationStepper';

interface AppointmentPhaseTimingEditorProps {
  readonly serviceName: string;
  readonly serviceType: ServiceType;
  readonly phases: readonly AppointmentPhase[];
  readonly onChangePhaseDuration: (phaseId: string, durationMinutes: number) => void;
  readonly minimumMinutes?: number;
  readonly disabled?: boolean;
}

/** Spoken subject for the accessibility labels of one phase. */
export function getPhaseTimingSubject(
  phase: Pick<AppointmentPhase, 'name' | 'requiresStaff'>,
  simpleServiceName?: string,
): string {
  if (simpleServiceName !== undefined) return `la durée de ${simpleServiceName}`;
  return phase.requiresStaff ? phase.name : 'le temps de pose';
}

export function AppointmentPhaseTimingEditor({
  serviceName,
  serviceType,
  phases,
  onChangePhaseDuration,
  minimumMinutes,
  disabled,
}: AppointmentPhaseTimingEditorProps) {
  const simple = serviceType === 'SERVICE' && phases.length === 1;

  return (
    <View style={styles.phases}>
      {phases.map((phase) => {
        const processing = !phase.requiresStaff;
        return (
          <View
            key={phase.id}
            style={[styles.phaseRow, processing ? styles.processingPhaseRow : styles.activePhaseRow]}
            testID={`phase-timing-${phase.id}`}
          >
            <AppText
              variant="metadata"
              numberOfLines={1}
              style={[styles.phaseName, processing && styles.processingPhaseName]}
            >
              {simple ? 'Durée' : phase.name}
            </AppText>
            <DurationStepper
              disabled={disabled}
              minimumMinutes={minimumMinutes}
              minutes={phase.durationMinutes}
              onChange={(minutes) => onChangePhaseDuration(phase.id, minutes)}
              subjectLabel={getPhaseTimingSubject(phase, simple ? serviceName : undefined)}
              testID={`phase-duration-${phase.id}`}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  phases: { gap: spacing.xs },
  phaseRow: {
    alignItems: 'center',
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  activePhaseRow: { backgroundColor: semanticColors.surface },
  processingPhaseRow: { backgroundColor: semanticColors.surfacePeach },
  phaseName: { color: foregroundSoft, flex: 1, minWidth: 0 },
  processingPhaseName: { color: peach.peach700 },
});
