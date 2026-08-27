import {
  Platform,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from './AppText';
import {
  interaction,
  lavender,
  radii,
  semanticColors,
  spacing,
  touchTarget,
} from './theme';

type AppButtonVariant = 'primary' | 'secondary' | 'tertiary';

interface AppButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  readonly title: string;
  readonly variant?: AppButtonVariant;
  readonly style?: StyleProp<ViewStyle>;
}

const minimumHeight = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

export function AppButton({
  title,
  variant = 'primary',
  disabled,
  accessibilityState,
  style,
  ...rest
}: AppButtonProps) {
  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variants[variant],
        disabled && styles.disabled,
        pressed && !disabled && pressedVariants[variant],
        style,
      ]}
    >
      <AppText
        variant="control"
        style={[
          variant === 'primary'
            ? styles.primaryText
            : variant === 'tertiary'
              ? styles.tertiaryText
              : styles.secondaryText,
          disabled && styles.disabledText,
        ]}
      >
        {title}
      </AppText>
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
  disabled: { backgroundColor: semanticColors.surface },
  disabledText: { color: semanticColors.foregroundMuted },
  primaryText: { color: semanticColors.surfaceElevated },
  secondaryText: { color: semanticColors.foreground },
  tertiaryText: { color: semanticColors.accent },
});

const variants = StyleSheet.create({
  primary: { backgroundColor: semanticColors.accent },
  secondary: { backgroundColor: semanticColors.surfaceLavender },
  tertiary: { backgroundColor: 'transparent' },
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
});
