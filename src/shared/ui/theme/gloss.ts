// Souris design tokens — Gloss
//
// Source: docs/design/DESIGN_OVERRIDES.md §19
//
// The restrained polished finish shared by Agenda appointment cards and the
// floating + : white light falling from the top edge, never blur, never glass
// imitation. Every layer is a plain overlay drawn above a flat token fill, so
// the surface stays correct wherever gradients are unavailable, and dark text
// only ever gains contrast under it.

import { colors, lavender } from './colors';

export const gloss = {
  card: {
    /** Very light vertical sheen over the pastel fill. */
    sheen:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.14) 42%, rgba(255, 255, 255, 0) 100%)',
    /** One-pixel top highlight. */
    edge: 'rgba(255, 255, 255, 0.85)',
  },
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
  candy: {
    /** Richer than a card: Souris violet deepening toward its lavender 700. */
    fill: `linear-gradient(180deg, ${colors.accent} 0%, ${lavender.lav700} 100%)`,
    /** Fades out before the glyph's centre so the white + keeps ≥ 4.5:1. */
    sheen:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.04) 42%, rgba(255, 255, 255, 0) 60%)',
    /**
     * Curved specular highlight. Painted on a circle that the button squashes
     * into a true ellipse — a radius alone can only make a rounded rectangle.
     * It dissolves toward its lower edge so it never reads as a panel.
     */
    specular:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.16) 60%, rgba(255, 255, 255, 0) 100%)',
    /** Moulded edge: light caught under the top rim, soft shade at the base. */
    innerLight:
      'inset 0 1px 1.5px rgba(255, 255, 255, 0.45), inset 0 -3px 5px rgba(25, 22, 63, 0.16)',
  },
} as const;
