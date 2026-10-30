// BeautIzzy design tokens — Motion
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

// « On prépare votre espace… » (onboarding, setup complete): a short visual
// interlude before the recap — never a loading state. The halo and the mark
// settle in, the copy follows, then the composition HOLDS fully visible
// (about 1.8 s) while one soft ring breathes out and a thin line fills; it
// finally fades away. Reduced motion skips it: the recap appears at once.
export const setupPreparation = {
  /** The halo and the brand symbol scale and fade into place. */
  enter: 520,
  /** The copy follows the mark a breath later. */
  copyDelay: 160,
  /** The single ring leaves the halo once everything has settled, growing and fading. */
  ringDelay: 700,
  ring: 1300,
  /** The thin progress line fills from the start until just before the exit. */
  fill: 2400,
  /** The composition fades and settles before the recap enters. */
  exit: 380,
  /** Total time on screen, the exit included: the recap mounts at its end. */
  total: 2900,
} as const;

// Accueil « Premiers pas avec BeautIzzy » (DESIGN_OVERRIDES §46.1): a soft
// entrance, a restrained check spring when a step is genuinely done, and a
// short « ready » moment before the card folds away for good. Reduced
// motion keeps every state change and drops every movement.
export const firstSteps = {
  /** The card fades in and rises this far. */
  enter: 450,
  rise: 14,
  /** Each row follows the previous one by this much. */
  rowStagger: 60,
  /** The progress line reaches its new value. */
  progress: 360,
  /** The lavender highlight behind a completed row: in, held, out. */
  highlightIn: 180,
  highlightHold: 420,
  highlightOut: 420,
  /** The check pops from this scale back to 1 on a soft spring. */
  checkFrom: 0.5,
  checkSpring: { damping: 13, stiffness: 240 },
  /**
   * 3 sur 3: time for the completion visuals to settle — the last check's
   * spring, the line reaching its end, the wash and the sparkle appearing —
   * before the reading period starts.
   */
  finalSettle: 600,
  /** The reading period: the settled « ready » card, fully visible and still. */
  finalHold: 3000,
  /** Then the card fades and folds its height away. */
  exit: 480,
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
