// Souris — AppText
//
// Shared typography primitive.
//
// - centralizes the Inter family mapping for the loaded font files;
// - resolves the approved typography tokens from src/shared/ui/theme;
// - provides strongly typed Souris variants only (no arbitrary type scale).
//
// Inter is loaded at application startup in src/app/_layout.tsx via
// @expo-google-fonts/inter. Each weight is a distinct native font family:
//
//   400 → Inter_400Regular
//   500 → Inter_500Medium
//   600 → Inter_600SemiBold
//   700 → Inter_700Bold
//
// The resolved style deliberately carries no `fontWeight`: the concrete
// family already encodes the weight, and adding fontWeight can make iOS
// synthesize a different weight instead of using the loaded file.

import { Platform, Text, type TextProps, type TextStyle } from 'react-native';

import { colors, foregroundSoft, typography } from './theme';

export type AppTextVariant =
  | 'display'
  | 'screenTitle'
  | 'sheetTitle'
  | 'stateTitle'
  | 'body'
  | 'rowTitle'
  | 'control'
  | 'metadata'
  | 'eyebrow'
  | 'chip'
  | 'tab';

/** Souris distinguishes only iOS and Android in its typography contract. */
export type AppTextPlatform = 'ios' | 'android';

type FontWeightToken = keyof typeof fontFamilies;

const fontFamilies = {
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
} as const;

interface TypographyRole {
  readonly fontSize: number;
  readonly fontWeight: FontWeightToken;
  readonly lineHeight?: number;
  readonly letterSpacing: number;
}

function resolveRole(variant: AppTextVariant, platform: AppTextPlatform): TypographyRole {
  switch (variant) {
    case 'display':
      return typography.onboardingDisplay;
    case 'screenTitle':
      return platform === 'android' ? typography.screenTitleAndroid : typography.screenTitleIos;
    case 'sheetTitle':
      return typography.sheetTitle;
    case 'stateTitle':
      return typography.stateTitle;
    case 'body':
      return typography.body;
    case 'rowTitle':
      return typography.rowTitle;
    case 'control':
      return platform === 'android' ? typography.controlAndroid : typography.controlIos;
    case 'metadata':
      return typography.metadata;
    case 'eyebrow':
      return typography.eyebrow;
    case 'chip':
      return typography.chip;
    case 'tab':
      return platform === 'android' ? typography.tabAndroid : typography.tabIos;
  }
}

// Variants rendered in the readable secondary foreground per the design
// (line metadata, eyebrow, subtitle). `muted` stays reserved for tertiary
// information and is never used for comfortably read text.
const secondaryVariants: ReadonlySet<AppTextVariant> = new Set(['metadata', 'eyebrow']);

/**
 * Resolves the complete React Native text style for a Souris variant.
 * Pure and exported so the variant/platform mapping can be verified directly.
 */
export function getAppTextStyle(
  variant: AppTextVariant,
  platform: AppTextPlatform,
): TextStyle {
  const role = resolveRole(variant, platform);

  const style: TextStyle = {
    fontFamily: fontFamilies[role.fontWeight],
    fontSize: role.fontSize,
    letterSpacing: role.letterSpacing,
    color: secondaryVariants.has(variant) ? foregroundSoft : colors.foreground,
  };
  if (role.lineHeight !== undefined) {
    style.lineHeight = role.lineHeight;
  }
  if (variant === 'eyebrow') {
    style.textTransform = 'uppercase';
  }
  return style;
}

const currentPlatform: AppTextPlatform = Platform.OS === 'android' ? 'android' : 'ios';

export interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
}

export function AppText({ variant = 'body', style, ...rest }: AppTextProps) {
  return <Text style={[getAppTextStyle(variant, currentPlatform), style]} {...rest} />;
}
