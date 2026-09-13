// Souris — Duration stepper (Appointment timing)
//
// The ONE control for appointment-specific phase durations, shared by
// Appointment Details (expanded Service) and the Appointment editor card
// (Creation Résumé and Modifier le rendez-vous): [ − ]  XX min  [ + ].
//
// Each tap moves the CURRENT value by five minutes (domain rule); zero is a
// valid result and the minus button simply disables there. No keyboard is
// ever involved. One selection haptic per committed change.

import { Pressable, StyleSheet, View } from 'react-native';

import {
  PHASE_DURATION_STEP_MINUTES,
  stepPhaseDurationMinutes,
  type PhaseDurationStepDirection,
} from '@/domain/appointments';
import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { interaction, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface DurationStepperProps {
  readonly minutes: number;
  /** Spoken subject of the control, e.g. « le temps de pose » or « Application ». */
  readonly subjectLabel: string;
  readonly onChange: (minutes: number) => void;
  /** Lowest reachable value; 0 unless the caller has a stricter rule. */
  readonly minimumMinutes?: number;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export function DurationStepper({
  minutes,
  subjectLabel,
  onChange,
  minimumMinutes = 0,
  disabled = false,
  testID,
}: DurationStepperProps) {
  const canDecrement = !disabled && minutes > minimumMinutes;
  const canIncrement = !disabled;

  const step = (direction: PhaseDurationStepDirection) => {
    const next = stepPhaseDurationMinutes(minutes, direction, minimumMinutes);
    if (next === minutes) return;
    haptics.selection();
    onChange(next);
  };

  return (
    <View style={styles.stepper} testID={testID}>
      <Pressable
        accessibilityLabel={`Réduire ${subjectLabel} de ${PHASE_DURATION_STEP_MINUTES} minutes`}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canDecrement }}
        disabled={!canDecrement}
        hitSlop={spacing.xs}
        onPress={() => step(-1)}
        style={({ pressed }) => [
          styles.stepButton,
          !canDecrement && styles.stepButtonDisabled,
          pressed && canDecrement && styles.stepButtonPressed,
        ]}
        testID={testID ? `${testID}-decrement` : undefined}
      >
        <AppText variant="control" style={[styles.glyph, !canDecrement && styles.glyphDisabled]}>
          −
        </AppText>
      </Pressable>
      <AppText
        accessibilityLabel={`${subjectLabel} : ${minutes} min`}
        accessibilityLiveRegion="polite"
        variant="control"
        style={styles.value}
        testID={testID ? `${testID}-value` : undefined}
      >
        {`${minutes} min`}
      </AppText>
      <Pressable
        accessibilityLabel={`Augmenter ${subjectLabel} de ${PHASE_DURATION_STEP_MINUTES} minutes`}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canIncrement }}
        disabled={!canIncrement}
        hitSlop={spacing.xs}
        onPress={() => step(1)}
        style={({ pressed }) => [
          styles.stepButton,
          !canIncrement && styles.stepButtonDisabled,
          pressed && canIncrement && styles.stepButtonPressed,
        ]}
        testID={testID ? `${testID}-increment` : undefined}
      >
        <AppText variant="control" style={[styles.glyph, !canIncrement && styles.glyphDisabled]}>
          +
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderColor: semanticColors.borderLavender,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  stepButton: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.small,
    height: 36,
    justifyContent: 'center',
    width: 40,
  },
  stepButtonDisabled: { backgroundColor: semanticColors.surface },
  stepButtonPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    transform: [{ scale: interaction.pressedScale }],
  },
  glyph: { color: semanticColors.accent, fontSize: 16, lineHeight: 19 },
  glyphDisabled: { color: semanticColors.foregroundMuted },
  value: {
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 64,
    textAlign: 'center',
  },
});
