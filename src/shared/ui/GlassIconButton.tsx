// Souris — GlassIconButton
//
// The circular light-glass icon control (docs/design/DESIGN_OVERRIDES.md §21):
// the back button of pushed screens and the Agenda previous / next arrows. One
// size, one material (GlassSurface), one dark thin glyph centred in the circle;
// only the symbol changes. Behaviour stays with the caller.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { GlassSurface } from './GlassSurface';
import { interaction, nativeShadows, semanticColors, spacing } from './theme';

/** Diameter of every glass icon button; also the width a top bar reserves to stay centred. */
export const glassIconButtonSize = 44;

export const glassIcons = {
  back: { ios: 'chevron.left', android: 'arrow_back' },
  previous: { ios: 'chevron.left', android: 'chevron_left' },
  next: { ios: 'chevron.right', android: 'chevron_right' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
} as const satisfies Record<string, SymbolViewProps['name']>;

interface GlassIconButtonProps {
  readonly icon: SymbolViewProps['name'];
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

export function GlassIconButton({ icon, accessibilityLabel, onPress, testID }: GlassIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      testID={testID}
    >
      <GlassSurface shape={styles.circle} />
      <SymbolView name={icon} size={17} tintColor={semanticColors.foreground} weight="medium" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: glassIconButtonSize / 2,
    height: glassIconButtonSize,
    justifyContent: 'center',
    width: glassIconButtonSize,
    ...nativeShadows.glass,
  },
  circle: { borderRadius: glassIconButtonSize / 2 },
  pressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
});
