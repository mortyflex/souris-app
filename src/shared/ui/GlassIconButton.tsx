// BeautIzzy — GlassIconButton
//
// The circular light-glass icon control (docs/design/DESIGN_OVERRIDES.md §21):
// the back button of pushed screens, the Agenda previous / next arrows and the
// « ••• » / close controls of Appointment Details. One size, one material
// (GlassSurface), one dark thin glyph centred in the circle; only the symbol
// changes. Behaviour stays with the caller.
//
// Optional, for controls floating over a dimmed page (the receipt actions):
// `floating` glass and shadow, an accent `tintColor`, and `busy` / `disabled`
// — busy swaps the glyph for a small spinner of the same size and colour, so
// the circle never changes. Callers that pass none of them are unchanged.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { GlassSurface } from './GlassSurface';
import { interaction, nativeShadows, semanticColors, spacing } from './theme';

/** Diameter of every glass icon button; also the width a top bar reserves to stay centred. */
export const glassIconButtonSize = 44;

export const glassIcons = {
  back: { ios: 'chevron.left', android: 'arrow_back' },
  previous: { ios: 'chevron.left', android: 'chevron_left' },
  next: { ios: 'chevron.right', android: 'chevron_right' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  more: { ios: 'ellipsis', android: 'more_horiz' },
  close: { ios: 'xmark', android: 'close' },
  // Save an image to Photos: a picture with a down arrow (SF Symbols 4, iOS 16) — never a floppy disk.
  saveImage: { ios: 'photo.badge.arrow.down', android: 'download' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
} as const satisfies Record<string, SymbolViewProps['name']>;

interface GlassIconButtonProps {
  readonly icon: SymbolViewProps['name'];
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  /** Floating glass and shadow, for a control over a dimmed page. */
  readonly floating?: boolean;
  readonly tintColor?: string;
  /** Working: a spinner in place of the glyph; presses are ignored. */
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export function GlassIconButton({
  icon,
  accessibilityLabel,
  onPress,
  floating = false,
  tintColor = semanticColors.foreground,
  busy = false,
  disabled = false,
  testID,
}: GlassIconButtonProps) {
  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: inactive }}
      disabled={inactive}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.button, floating && styles.floating, pressed && styles.pressed]}
      testID={testID}
    >
      <GlassSurface floating={floating} shape={styles.circle} />
      {busy ? (
        <ActivityIndicator color={tintColor} size="small" />
      ) : (
        <SymbolView name={icon} size={17} tintColor={tintColor} weight="medium" />
      )}
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
  floating: nativeShadows.glassFloating,
  circle: { borderRadius: glassIconButtonSize / 2 },
  pressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
});
