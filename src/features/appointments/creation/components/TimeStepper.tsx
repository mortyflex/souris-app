// Souris — Time stepper control
//
// Compact ±5 minute start-time control shared by the appointment context
// row and the Summary step. One aligned row: minus / current time / plus,
// finished by an explicit Terminer action. Tabular numerals keep the value
// visually stable while stepping.

import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import {
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { formatCreationTime } from '../presentation';

interface TimeStepperProps {
  readonly startAt: Date;
  readonly onStep: (deltaMinutes: number) => void;
  readonly onDone: () => void;
}

export function TimeStepper({ startAt, onStep, onDone }: TimeStepperProps) {
  return (
    <View style={styles.row}>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reculer de 5 minutes"
          hitSlop={spacing.sm}
          onPress={() => onStep(-5)}
          style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
        >
          <AppText variant="control" style={styles.stepGlyph}>
            −
          </AppText>
        </Pressable>
        <AppText variant="control" style={styles.timeValue} testID="time-value">
          {formatCreationTime(startAt)}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Avancer de 5 minutes"
          hitSlop={spacing.sm}
          onPress={() => onStep(5)}
          style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
        >
          <AppText variant="control" style={styles.stepGlyph}>
            +
          </AppText>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Terminer la modification de l'heure"
        hitSlop={spacing.sm}
        onPress={onDone}
        style={({ pressed }) => [styles.doneAction, pressed && styles.doneActionPressed]}
        testID="time-done"
      >
        <AppText variant="metadata" style={styles.doneText}>
          Terminer
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  stepper: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderColor: semanticColors.borderLavender,
    borderRadius: radii.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  stepButton: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.small,
    height: 36,
    justifyContent: 'center',
    width: 40,
  },
  stepButtonPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    transform: [{ scale: interaction.pressedScale }],
  },
  stepGlyph: { color: semanticColors.accent, fontSize: 16, lineHeight: 19 },
  timeValue: {
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 52,
    textAlign: 'center',
  },
  doneAction: {
    alignItems: 'center',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  doneActionPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  doneText: { color: semanticColors.accent },
});
