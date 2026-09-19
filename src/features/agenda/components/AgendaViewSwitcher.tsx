// Souris — AgendaViewSwitcher
//
// The Jour / Semaine capsule of the Agenda header: a light-glass pill
// (GlassSurface, DESIGN_OVERRIDES.md §21) from the same family as the glass
// icon buttons and the native tab bar, slightly lighter than the circles since
// it covers more area. The selected view lets the glass read through: a whisper
// of accent, an accent hairline and a violet label, like the bar's selected
// tab; the other stays a plainly readable navy-soft label on the glass.

import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { GlassSurface } from '@/shared/ui/GlassSurface';
import { haptics } from '@/shared/lib/haptics';
import {
  gloss,
  interaction,
  nativeShadows,
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

  return (
    <View accessibilityRole="tablist" style={styles.container}>
      <GlassSurface shape={styles.capsule} testID="agenda-view-switcher-glass" />
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
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    ...nativeShadows.glassCapsule,
  },
  // Same material as the glass circles, lightened for the capsule's wider area.
  capsule: {
    backgroundColor: gloss.glass.fillCapsule,
    borderColor: gloss.glass.borderCapsule,
    borderRadius: radii.pill,
  },
  option: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: touchTarget.ios,
    minWidth: 70,
    paddingHorizontal: spacing.md,
  },
  selectedOption: {
    backgroundColor: gloss.glass.selectedFill,
    borderColor: gloss.glass.selectedBorder,
  },
  pressedOption: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  selectedText: { color: semanticColors.accent },
  unselectedText: { color: semanticColors.foregroundSoft },
});
