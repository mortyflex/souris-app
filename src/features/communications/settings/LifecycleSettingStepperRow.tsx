// Souris — SMS fidélisation stepper row
//
// « Réduction      [ − ] 15 % [ + ] » inside a GroupedSurface: the row
// label on the left, the compact [ − ] value [ + ] stepper on the right, in
// the visual language of the Appointment DurationStepper. No keyboard, no
// hold-to-repeat (each committed step is one server write). One selection
// haptic per real step; a bound disables its button, so a refused step
// never ticks.
//
// Without a value (preferences never loaded) the row shows a dash and both
// buttons stay disabled: nothing editable pretends to be a stored value.

import { Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { interaction, radii, semanticColors, spacing } from '@/shared/ui/theme';

import {
  canStepLifecycleSetting,
  stepLifecycleSetting,
  type LifecycleSettingRange,
  type LifecycleSettingStepDirection,
} from './lifecycle-setting-steps';

interface LifecycleSettingStepperRowProps {
  readonly label: string;
  /** Undefined until the server preferences are loaded. */
  readonly value: number | undefined;
  readonly range: LifecycleSettingRange;
  readonly format: (value: number) => string;
  readonly decrementLabel: string;
  readonly incrementLabel: string;
  readonly onChange: (value: number) => void;
  readonly disabled?: boolean;
  /** Prefix of `<testID>-decrement`, `-value`, `-increment`. */
  readonly testID: string;
}

const UNAVAILABLE_VALUE = '—';

export function LifecycleSettingStepperRow({
  label,
  value,
  range,
  format,
  decrementLabel,
  incrementLabel,
  onChange,
  disabled = false,
  testID,
}: LifecycleSettingStepperRowProps) {
  const canStep = (direction: LifecycleSettingStepDirection) =>
    !disabled && value !== undefined && canStepLifecycleSetting(value, range, direction);
  const canDecrement = canStep(-1);
  const canIncrement = canStep(1);

  const step = (direction: LifecycleSettingStepDirection) => {
    if (!canStep(direction) || value === undefined) return;
    const next = stepLifecycleSetting(value, range, direction);
    if (next === value) return;
    haptics.selection();
    onChange(next);
  };

  const displayed = value === undefined ? UNAVAILABLE_VALUE : format(value);

  return (
    <View style={styles.row} testID={testID}>
      <AppText variant="body" numberOfLines={2} style={styles.label}>
        {label}
      </AppText>
      <View style={styles.stepper}>
        <Pressable
          accessibilityLabel={decrementLabel}
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
          testID={`${testID}-decrement`}
        >
          <AppText variant="control" style={[styles.glyph, !canDecrement && styles.glyphDisabled]}>
            −
          </AppText>
        </Pressable>
        <AppText
          accessibilityLabel={`${label} : ${displayed}`}
          accessibilityLiveRegion="polite"
          variant="control"
          style={styles.value}
          testID={`${testID}-value`}
        >
          {displayed}
        </AppText>
        <Pressable
          accessibilityLabel={incrementLabel}
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
          testID={`${testID}-increment`}
        >
          <AppText variant="control" style={[styles.glyph, !canIncrement && styles.glyphDisabled]}>
            +
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  label: { color: semanticColors.foregroundSoft, flex: 1, minWidth: 0 },
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
    minWidth: 72,
    textAlign: 'center',
  },
});
