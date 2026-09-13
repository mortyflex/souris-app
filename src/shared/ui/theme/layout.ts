// Souris design tokens — Layout
//
// Source: docs/design/DESIGN.md §5 (Agenda grid), docs/design/reference-export/tokens.css,
//         docs/design/DESIGN_OVERRIDES.md §16 (overlay consistency)
//
// Agenda geometry values are the approved visual baseline.
// They may be adjusted after real-device validation.
//
// Touch targets preserve the iOS/Android platform distinction.
// These are design tokens only — no runtime Platform abstraction is created here.

export const agenda = {
  hourHeight: 68,
  timelineGutter: 62,
  dayStartHour: 8,
  dayEndHour: 20,
} as const;

export const touchTarget = {
  ios: 44,
  android: 48,
} as const;

// Canonical Souris sheet shell — shared by the JS BottomSheet (Modal) and the
// native form-sheet routes so both read as ONE presentation.
export const sheet = {
  /** Fraction of the window a workflow sheet occupies (native detent and JS max height). */
  detent: 0.92,
  grabberWidth: 40,
  grabberHeight: 5,
  /** Vertical drag on the grabber/header zone beyond which a sheet dismisses. */
  dismissThreshold: 96,
} as const;

// Canonical Souris confirmation dialog card.
export const dialog = {
  maxWidth: 360,
} as const;

// Decorative main-screen watermark symbol (Agenda / Clientes / Produits / Plus),
// anchored to the screen title block by MainScreenHeader — never to the
// device edge — so the safe area never changes where it sits on the page.
export const watermark = {
  size: 168,
  opacity: 0.07,
  /** Fraction of the glyph that leaves the page through the right edge. */
  cropRight: 0.28,
  /** Fraction of the glyph that rises above the title block. */
  cropTop: 0.22,
} as const;

// Shared floating create action (+): one size and one bottom-right inset for
// every screen whose primary action is "add / create".
export const floatingAction = {
  size: 56,
  inset: 20,
  /** Gap between the button and its expanded menu, and between menu options. */
  menuGap: 12,
  /** Settling moment after screen focus before the button reveals (ms). */
  revealDelay: 80,
  /** Small rise travelled during the reveal (pt). */
  revealRise: 6,
} as const;
