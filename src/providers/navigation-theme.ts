// Souris — navigation theme
//
// The ONE React Navigation theme handed to Souris's native navigators.
//
// Expo Router paints the backdrop of every native tab screen with
// `theme.colors.background`, and the default theme's is a foreign grey, so
// without this a tab switch could briefly show a colour that is not Souris's
// (the "white flash" the Native Tabs documentation warns about). The theme
// therefore carries the canonical Souris app background (`semanticColors.screen`); the iOS 26 Liquid
// Glass bar then always samples the real page beneath it.
//
// Light appearance only — Souris has no dark mode yet, so no colour-scheme
// switching lives here.

import { DefaultTheme, type Theme } from 'expo-router';

import { colors, semanticColors } from '@/shared/ui/theme';

export const sourisNavigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: semanticColors.screen,
    card: semanticColors.screen,
    text: colors.foreground,
    border: colors.border,
  },
};
