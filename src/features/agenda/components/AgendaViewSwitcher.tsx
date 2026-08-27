import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { haptics } from '@/shared/lib/haptics';
import {
  interaction,
  radii,
  semanticColors,
  spacing,
  touchTarget,
} from '@/shared/ui/theme';

export type AgendaViewMode = 'day' | 'week';

interface AgendaViewSwitcherProps {
  readonly mode: AgendaViewMode;
  readonly onChange: (mode: AgendaViewMode) => void;
}

export function AgendaViewSwitcher({ mode, onChange }: AgendaViewSwitcherProps) {
  const platform = Platform.OS === 'android' ? 'android' : 'ios';
  const minimumTouchTarget = touchTarget[platform];
  const defaultRadius = radii.medium;

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, { borderRadius: defaultRadius }]}
    >
      {(['day', 'week'] as const).map((value) => {
        const selected = mode === value;
        const label = value === 'day' ? 'Jour' : 'Semaine';
        const selectMode = () => {
          if (value !== mode) {
            haptics.selection();
          }
          onChange(value);
        };
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={selectMode}
            style={({ pressed }) => [
              styles.option,
              { minHeight: minimumTouchTarget },
              pressed && styles.pressedOption,
              selected && styles.selectedOption,
              selected && { borderRadius: defaultRadius },
            ]}
          >
            <AppText variant="control" style={selected ? styles.selectedText : styles.unselectedText}>
              {label}
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
    justifyContent: 'center',
    minHeight: touchTarget.ios,
    minWidth: 70,
    paddingHorizontal: spacing.md,
  },
  selectedOption: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.medium,
  },
  pressedOption: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  selectedText: { color: semanticColors.accent },
  unselectedText: { color: semanticColors.foregroundSoft },
});
