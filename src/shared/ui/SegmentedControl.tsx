// Souris — SegmentedControl
//
// The compact two-or-more option switcher (reference: the Agenda Jour /
// Semaine switcher): a soft surface capsule with the selected option raised
// on the strong lavender surface. Content-agnostic; labels stay feature-owned.

import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/shared/lib/haptics';

import { AppText } from './AppText';
import { interaction, radii, semanticColors, spacing, touchTarget } from './theme';

export interface SegmentedControlOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

interface SegmentedControlProps<Value extends string> {
  readonly options: readonly SegmentedControlOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly testID?: string;
}

const minimumTouchTarget = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<Value>) {
  return (
    <View accessibilityRole="tablist" style={styles.container} testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        const select = () => {
          if (!selected) haptics.selection();
          onChange(option.value);
        };
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={select}
            style={({ pressed }) => [
              styles.option,
              pressed && styles.pressedOption,
              selected && styles.selectedOption,
            ]}
          >
            <AppText variant="control" style={selected ? styles.selectedText : styles.unselectedText}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    backgroundColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    flexDirection: 'row',
    padding: 2,
  },
  option: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    justifyContent: 'center',
    minHeight: minimumTouchTarget,
    minWidth: 70,
    paddingHorizontal: spacing.md,
  },
  selectedOption: { backgroundColor: semanticColors.surfaceLavenderStrong },
  pressedOption: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  selectedText: { color: semanticColors.accent },
  unselectedText: { color: semanticColors.foregroundSoft },
});
