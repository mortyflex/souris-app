// Souris — Stock stepper (Product form)
//
// The stock selector: a [−] n [+] control with the same visual language as
// the Sale line stepper, bounded to 0–30 for normal use. Holding a button
// repeats the step so 30 is reachable in a moment. A quantity that already
// exceeds 30 (legacy data) is shown exactly and can only be lowered — the
// form never clamps it on its own (product-form.ts).

import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { interaction, radii, semanticColors, spacing } from '@/shared/ui/theme';

import {
  STOCK_SELECTOR_MAX,
  STOCK_SELECTOR_MIN,
  stepStockQuantity,
} from '../product-form';

interface StockStepperProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
}

const REPEAT_DELAY_MS = 420;
const REPEAT_INTERVAL_MS = 90;

export function StockStepper({ value, onChange }: StockStepperProps) {
  const valueRef = useRef(value);
  const repeat = useRef<{ delay?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({});

  // The repeat timer reads the latest committed value without re-arming.
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const canDecrement = value > STOCK_SELECTOR_MIN;
  const canIncrement = value < STOCK_SELECTOR_MAX;

  const step = (delta: 1 | -1) => {
    const next = stepStockQuantity(valueRef.current, delta);
    if (next !== valueRef.current) {
      valueRef.current = next;
      onChange(next);
    }
  };

  const stopRepeat = () => {
    if (repeat.current.delay) clearTimeout(repeat.current.delay);
    if (repeat.current.interval) clearInterval(repeat.current.interval);
    repeat.current = {};
  };

  const startRepeat = (delta: 1 | -1) => {
    stopRepeat();
    repeat.current.delay = setTimeout(() => {
      repeat.current.interval = setInterval(() => step(delta), REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  };

  useEffect(() => stopRepeat, []);

  return (
    <View style={styles.field}>
      <AppText variant="metadata" style={styles.label}>
        Stock
      </AppText>
      <View style={styles.row}>
        <View style={styles.stepper}>
          <Pressable
            accessibilityLabel="Retirer une unité de stock"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canDecrement }}
            disabled={!canDecrement}
            hitSlop={spacing.xs}
            onPress={() => step(-1)}
            onPressIn={() => startRepeat(-1)}
            onPressOut={stopRepeat}
            style={({ pressed }) => [
              styles.stepButton,
              !canDecrement && styles.stepButtonDisabled,
              pressed && canDecrement && styles.stepButtonPressed,
            ]}
            testID="stock-decrement"
          >
            <AppText variant="control" style={[styles.glyph, !canDecrement && styles.glyphDisabled]}>
              −
            </AppText>
          </Pressable>
          <AppText
            accessibilityLabel={`Stock : ${value}`}
            accessibilityLiveRegion="polite"
            variant="summaryValue"
            style={styles.value}
            testID="stock-value"
          >
            {value}
          </AppText>
          <Pressable
            accessibilityLabel="Ajouter une unité de stock"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canIncrement }}
            disabled={!canIncrement}
            hitSlop={spacing.xs}
            onPress={() => step(1)}
            onPressIn={() => startRepeat(1)}
            onPressOut={stopRepeat}
            style={({ pressed }) => [
              styles.stepButton,
              !canIncrement && styles.stepButtonDisabled,
              pressed && canIncrement && styles.stepButtonPressed,
            ]}
            testID="stock-increment"
          >
            <AppText variant="control" style={[styles.glyph, !canIncrement && styles.glyphDisabled]}>
              +
            </AppText>
          </Pressable>
        </View>
        <AppText variant="metadata" style={styles.hint}>
          {value > STOCK_SELECTOR_MAX ? 'Quantité existante conservée' : `0 à ${STOCK_SELECTOR_MAX}`}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { color: semanticColors.foregroundSoft },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  stepper: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  stepButton: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.small,
    height: 40,
    justifyContent: 'center',
    width: 48,
  },
  stepButtonDisabled: { backgroundColor: semanticColors.surface },
  stepButtonPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    transform: [{ scale: interaction.pressedScale }],
  },
  glyph: { color: semanticColors.accent, fontSize: 20, lineHeight: 24 },
  glyphDisabled: { color: semanticColors.foregroundMuted },
  value: {
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 56,
    textAlign: 'center',
  },
  hint: { color: semanticColors.foregroundSoft, flexShrink: 1 },
});
