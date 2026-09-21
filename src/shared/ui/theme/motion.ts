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

// « Résumé du jour » receipt printer (DESIGN_OVERRIDES.md §25). The capsule
// lands first, the paper then feeds out in about a second and settles
// with one tiny give. Reduced motion skips the travel entirely.
export const receiptPrint = {
  /** The printer capsule fades and drops into place. */
  capsule: 160,
  /** Wait between the capsule landing and the first millimetre of paper. */
  feedDelay: 120,
  /** The paper travels out of the slot. */
  feed: 1000,
  /** The paper gives a few points past its rest, then comes back. */
  settleOut: 110,
  settleBack: 200,
  /** Closing: paper, capsule and scrim leave together. */
  dismiss: 220,
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
