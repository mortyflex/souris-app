import {
  Platform,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { PlatformSymbolName } from '@/shared/icons/payment-method-icons';

import { AppText } from './AppText';
import {
  interaction,
  lavender,
  radii,
  rose,
  semanticColors,
  spacing,
  touchTarget,
} from './theme';

type AppButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'dangerSoft';

interface AppButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  readonly title: string;
  readonly variant?: AppButtonVariant;
  /**
   * Optional leading glyph (decorative: the title names the action). Tinted
   * like the title, except on the lavender `secondary` fill where it takes the
   * accent violet of the « Revente » action.
   */
  readonly icon?: PlatformSymbolName;
  /**
   * Optional quiet line under the title, inside the same control (the paywall's
   * « Explorer sans abonnement » and its read-only limit). Spoken as the hint.
   */
  readonly caption?: string;
  readonly style?: StyleProp<ViewStyle>;
}

const minimumHeight = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

export function AppButton({
  title,
  variant = 'primary',
  icon,
  caption,
  disabled,
  accessibilityState,
  style,
  ...rest
}: AppButtonProps) {
  const textStyle = disabled ? styles.disabledText : textStyles[variant];
  const iconTint = !disabled && variant === 'secondary' ? semanticColors.accent : textStyle.color;

  return (
    <Pressable
      accessibilityHint={caption}
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        icon !== undefined && styles.withIcon,
        caption !== undefined && styles.withCaption,
        variants[variant],
        disabled && styles.disabled,
        pressed && !disabled && pressedVariants[variant],
        style,
      ]}
    >
      {icon !== undefined && <SymbolView name={icon} size={18} tintColor={iconTint} />}
      <AppText variant="control" style={textStyle}>
        {title}
      </AppText>
      {caption !== undefined && (
        <AppText style={styles.caption} variant="metadata">
          {caption}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    justifyContent: 'center',
    minHeight: minimumHeight,
    paddingHorizontal: spacing.base,
  },
  withIcon: { flexDirection: 'row', gap: spacing.sm },
  withCaption: { paddingVertical: spacing.sm },
  caption: { color: semanticColors.foregroundSoft, textAlign: 'center' },
  disabled: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.borderSubtle,
  },
  disabledText: { color: semanticColors.foregroundMuted },
});

const textStyles = StyleSheet.create({
  primary: { color: semanticColors.onAccent },
  secondary: { color: semanticColors.foreground },
  tertiary: { color: semanticColors.accent },
  // Deeper rose on the rose fill: clearly destructive, readable (≥ 6:1), never neon.
  danger: { color: rose.rose700 },
  dangerSoft: { color: rose.rose600 },
});

const variants = StyleSheet.create({
  primary: { backgroundColor: semanticColors.accent },
  secondary: { backgroundColor: semanticColors.surfaceLavender },
  tertiary: { backgroundColor: 'transparent' },
  // The destructive confirm: a soft rose fill, never an outline.
  danger: { backgroundColor: rose.rose100 },
  dangerSoft: { backgroundColor: semanticColors.surfaceRose },
});

const pressedVariants = StyleSheet.create({
  primary: {
    backgroundColor: lavender.lav700,
    transform: [{ scale: interaction.pressedScale }],
  },
  secondary: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    transform: [{ scale: interaction.pressedScale }],
  },
  tertiary: {
    backgroundColor: semanticColors.surfaceLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  danger: {
    backgroundColor: rose.rose200,
    transform: [{ scale: interaction.pressedScale }],
  },
  dangerSoft: {
    backgroundColor: rose.rose100,
    transform: [{ scale: interaction.pressedScale }],
  },
});
