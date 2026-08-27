// Souris design tokens — Shadows
//
// Source: docs/design/DESIGN.md §4, docs/design/reference-export/tokens.css
//
// The approved design uses three CSS multi-layer shadows, all tinted navy/lavender
// (never generic black). iOS and Android implement shadows differently:
//
//   iOS:    shadowColor / shadowOffset / shadowOpacity / shadowRadius
//   Android: elevation (integer dp)
//
// CSS box-shadow strings cannot be directly mapped to either platform API.
// Rather than inventing approximate elevation values or blindly copying CSS,
// the approved source values are documented here as design metadata.
// A future native component implementation will map these to the correct
// iOS shadow properties and Android elevation per component.
//
// Design constraint: shadows are extremely restrained, navy/lavender tinted,
// never generic heavy black elevation.

import { Platform, type ViewStyle } from 'react-native';

// Source: tokens.css --shadow-sheet
// CSS: 0 -1px 0 var(--border), 0 -12px 32px -18px oklch(0.25 0.06 285 / 0.35)
// Intent: bottom-anchored sheet, 1px border line + soft upward diffuse shadow
export const shadowSheet = {
  layers: [
    { offsetY: -1, blur: 0, color: '#DFDEE4', opacity: 1 },
    { offsetY: -12, blur: 32, spread: -18, color: '#1F1C3D', opacity: 0.35 },
  ],
} as const;

// Source: tokens.css --shadow-raise
// CSS: 0 1px 2px oklch(0.25 0.06 285 / 0.10), 0 6px 16px -10px oklch(0.25 0.06 285 / 0.28)
// Intent: subtle lift for cards or elevated elements
export const shadowRaise = {
  layers: [
    { offsetX: 0, offsetY: 1, blur: 2, color: '#1F1C3D', opacity: 0.10 },
    { offsetX: 0, offsetY: 6, blur: 16, spread: -10, color: '#1F1C3D', opacity: 0.28 },
  ],
} as const;

// Source: tokens.css --shadow-fab (souris.css)
// CSS: 0 4px 14px -4px oklch(0.46 0.14 300 / 0.5)
// Intent: FAB shadow, lavender tinted
export const shadowFab = {
  layers: [
    { offsetX: 0, offsetY: 4, blur: 14, spread: -4, color: '#654199', opacity: 0.50 },
  ],
} as const;

export const shadows = {
  sheet: shadowSheet,
  raise: shadowRaise,
  fab: shadowFab,
} as const;

// Reusable New Architecture shadow styles for native runtime surfaces.
// RGBA values are alpha variants of the approved navy/lavender shadow sources.
const needsAndroidElevationFallback =
  Platform.OS === 'android' && Number(Platform.Version) < 28;

function nativeShadow(boxShadow: string, elevation: number): ViewStyle {
  return needsAndroidElevationFallback ? { elevation } : { boxShadow };
}

export const nativeShadows = {
  raised: nativeShadow('0 4px 14px rgba(31, 28, 61, 0.10)', 2),
  lifted: nativeShadow('0 8px 20px rgba(31, 28, 61, 0.16)', 4),
  floating: nativeShadow('0 5px 16px rgba(101, 65, 153, 0.18)', 4),
  footer: nativeShadow('0 -4px 14px rgba(31, 28, 61, 0.08)', 2),
} as const satisfies Record<string, ViewStyle>;
