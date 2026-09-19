// Souris design tokens — Gloss
//
// Source: docs/design/DESIGN_OVERRIDES.md §20, §21 (Agenda cards are flat: §19)
//
// The restrained polished finishes of Souris: white light falling from the top
// edge, never a blur view. Every layer is a plain overlay drawn above a flat
// token fill, so the surface stays correct wherever gradients are unavailable,
// and dark text only ever gains contrast under it.

export const gloss = {
  // Satin finish of sheets, drawers and dialogs (SurfaceGloss). Full-width light
  // from the top edge that dissolves to nothing — never a panel inside the
  // surface — and a rim that follows the surface's own corners.
  surface: {
    sheen:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.55) 34%, rgba(255, 255, 255, 0) 100%)',
    /** Height of the highlight; short surfaces simply clip it. */
    sheenHeight: 132,
    /** Bright top hairline following the surface's top corners — the only rim. */
    topLight: 'inset 0 1px 0 rgba(255, 255, 255, 0.96)',
  },
  // Light glass of the small floating controls — back button, Agenda previous /
  // next, the floating + and the Jour / Semaine capsule (GlassSurface,
  // DESIGN_OVERRIDES.md §21). Nearly white and only slightly see-through: it
  // evokes the system Liquid Glass of the tab bar without a blur view, so it
  // renders identically on every supported iOS version and on Android.
  glass: {
    /** Almost-white fill; the page tint barely reads through it. */
    fill: 'rgba(255, 255, 255, 0.86)',
    /** Floating over scrolling rows: denser, so content never ghosts through. */
    fillFloating: 'rgba(255, 255, 255, 0.94)',
    /** Hairline navy-alpha contour — the discreet grey ring of the references. */
    border: 'rgba(25, 22, 63, 0.14)',
    /** Soft reflection from the top edge, gone before the glyph's centre. */
    sheen: 'linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0) 55%)',
    /** Light caught under the top rim, a whisper of shade at the base. */
    rim: 'inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 -1px 3px rgba(25, 22, 63, 0.05)',
    /** Wide capsule (Jour / Semaine): lighter than a circle, so its larger area stays as quiet. */
    fillCapsule: 'rgba(255, 255, 255, 0.74)',
    borderCapsule: 'rgba(25, 22, 63, 0.10)',
    /**
     * Selected segment of a glass capsule: a whisper of accent that lets the
     * glass read through, edged by an accent hairline — never a filled slab.
     */
    selectedFill: 'rgba(115, 84, 199, 0.06)',
    selectedBorder: 'rgba(115, 84, 199, 0.26)',
  },
} as const;
