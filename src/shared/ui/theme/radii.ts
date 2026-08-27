// Souris design tokens — Border Radii
//
// Source: docs/design/DESIGN.md §4, docs/design/reference-export/tokens.css
//
// iOS and Android have different default radii per the approved design.
// These are design tokens only — not runtime components.

export const radii = {
  // Semantic hierarchy shared across platforms. Capsules remain explicit.
  small: 8,
  medium: 12,
  large: 16,
  pill: 999,
  ios: {
    default: 8,
    sheet: 16,
    pill: 999,
  },
  android: {
    default: 12,
    sheet: 28,
    pill: 999,
  },
} as const;
