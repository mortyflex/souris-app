// Souris design tokens — Spacing
//
// Source: docs/design/DESIGN.md §4, docs/design/reference-export/tokens.css
//
// 8px rhythm: 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32
// All values are device-independent pixels (React Native numeric).

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 32,
} as const;

export const gutter = {
  ios: 20,
  android: 16,
} as const;

export const bottomClearance = {
  ios: 104,
  android: 128,
} as const;
