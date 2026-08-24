import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { colors, lavender, radii, spacing, touchTarget } from '@/shared/ui/theme';

export type AgendaViewMode = 'day' | 'week';

interface AgendaViewSwitcherProps {
  readonly mode: AgendaViewMode;
  readonly onChange: (mode: AgendaViewMode) => void;
}

export function AgendaViewSwitcher({ mode, onChange }: AgendaViewSwitcherProps) {
  const platform = Platform.OS === 'android' ? 'android' : 'ios';
  const minimumTouchTarget = touchTarget[platform];
  const defaultRadius = radii[platform].default;

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, { borderRadius: defaultRadius }]}
    >
      {(['day', 'week'] as const).map((value) => {
        const selected = mode === value;
        const label = value === 'day' ? 'Jour' : 'Semaine';
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onChange(value)}
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: lavender.lav100,
    borderRadius: radii.ios.default,
  },
  pressedOption: { opacity: 0.78 },
  selectedText: { color: lavender.lav700 },
  unselectedText: { color: colors.muted },
});
