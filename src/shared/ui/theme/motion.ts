// Souris design tokens — Motion
//
// Source: docs/design/DESIGN.md §7, docs/design/reference-export/tokens.css
//
// Durations in milliseconds (React Native / Reanimated convention).
// Easing represented as a [x1, y1, x2, y2] cubic bezier control-point array,
// compatible with React Native Animated.timing and Reanimated Easing.bezier.
//
// Reanimated consumes these values for shared native interaction language.

export const duration = {
  tap: 120,
  state: 160,
  disclosure: 220,
  settle: 240,
  panel: 280,
} as const;

export const interaction = {
  pressedOpacity: 0.76,
  pressedScale: 0.985,
  cardPressedScale: 0.99,
  dragLiftScale: 1.02,
} as const;

// cubic-bezier(.32, .72, 0, 1) — sheets, onboarding panels
export const easing = {
  out: [0.32, 0.72, 0, 1] as [number, number, number, number],
} as const;
