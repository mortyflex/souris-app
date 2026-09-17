// Souris design tokens — Colors
//
// Source: docs/design/DESIGN.md §2, docs/design/reference-export/colors_and_type.css
//
// The six canonical brand colors are the only hex values permitted by the design system.
// Derived pastel tones originate from OKLCH definitions in the approved export.
// Each derived hex below is a deterministic sRGB conversion of the approved OKLCH source.
// OKLCH strings are NOT reliably supported by React Native on both iOS and Android,
// so pre-converted sRGB hex values are used for runtime compatibility.

// Canonical brand palette — the only hex values in the system.
export const colors = {
  background: '#FFFFFF',
  foreground: '#19163F',
  accent: '#7354C7',
  surface: '#F6F6F7',
  muted: '#9896A9',
  border: '#DFDEE4',
} as const;

// Lavender — structure, normal appointment/service visual language.
// Derived from oklch hue 300.
export const lavender = {
  lav025: '#FBF9FE', // oklch(0.985 0.006 300) — background outside frame, row hover
  lav050: '#F7F4FE', // oklch(0.972 0.014 300) — icon badge, event background
  lav100: '#EFE9FD', // oklch(0.945 0.028 300) — avatar, chip, Material active indicator
  lav200: '#E1D6F9', // oklch(0.895 0.050 300) — event border, bar fill
  lav700: '#654199', // oklch(0.46 0.14 300) — primary button hover, text on lavender
} as const;

// Rose — current-time indicator, errors, cancellation, destructive actions.
// Derived from oklch hue 6.
export const rose = {
  rose050: '#FFF2F4', // oklch(0.972 0.016 6) — error field background, danger hover bg
  rose100: '#FFE1E6', // oklch(0.938 0.038 6) — rose pastel light
  rose200: '#FEC9D3', // oklch(0.885 0.062 6) — danger button border
  rose600: '#CF3869', // oklch(0.58 0.19 6) — now-line, error text, destructive action
  rose700: '#893A4F', // oklch(0.46 0.11 6) — text on rose fills (≥ 6:1 on rose100), blush identity
} as const;

// Peach — processing/unattended time and regained availability.
// Peach is NOT a warning color. It represents "the professional is free during this phase."
// Derived from oklch hue 62.
export const peach = {
  peach050: '#FFF4EB', // oklch(0.975 0.018 62) — processing time lightest
  peach100: '#FFE8D4', // oklch(0.945 0.038 62) — processing time fill
  peach200: '#FDD6B5', // oklch(0.900 0.062 62) — processing time stripe border
  peach700: '#955816', // oklch(0.52 0.11 62) — processing time accent / text
} as const;

// Agenda appointment pastels — the colourful planning-card families
// (DESIGN_OVERRIDES.md §19). Lavender, blush and peach reuse the approved steps
// above; the other families follow the same OKLCH recipe at their own hue,
// chroma reduced only as far as the sRGB gamut requires:
//   calm oklch(0.972 ~0.016 h) — completed card
//   fill oklch(0.895 ~0.06 h)  — active card (butter sits lighter to stay yellow)
//   deep oklch(0.46 ~0.11 h)   — identity edge and secondary text, ≥ 5:1 on fill
export const appointmentPastels = {
  lavender: { calm: lavender.lav050, fill: lavender.lav200, deep: lavender.lav700 },
  blush: { calm: rose.rose050, fill: rose.rose200, deep: rose.rose700 },
  peach: { calm: peach.peach050, fill: peach.peach200, deep: '#7F490C' }, // oklch(0.46 0.10 62)
  mint: { calm: '#ECF9F3', fill: '#B7EAD2', deep: '#05684B' }, // hue 165
  powderBlue: { calm: '#EEF7FE', fill: '#BCE2FE', deep: '#015E8C' }, // hue 240
  butter: { calm: '#FDF8E2', fill: '#F6EBB1', deep: '#695700' }, // hue 98, fill oklch(0.935 0.075 98)
  coral: { calm: '#FEF3F1', fill: '#FED0C8', deep: '#8B3C31' }, // hue 30
  lilac: { calm: '#FCF2FB', fill: '#F5CEF0', deep: '#793F75' }, // hue 330
} as const;

// Secondary readable foreground — readable secondary metadata text.
// More legible than muted; reserved for text that is actually read.
// oklch(0.42 0.055 285)
export const foregroundSoft = '#4A496A';

// Native runtime roles introduced by the soft editorial refresh.
// Every role aliases an approved canonical or derived Souris color above.
// Screens should use these names when the visual decision is semantic rather
// than tied to a particular palette step.
export const semanticColors = {
  screen: colors.background,
  screenWarm: lavender.lav025,
  surface: colors.surface,
  surfaceElevated: colors.background,
  surfaceLavender: lavender.lav050,
  surfaceLavenderStrong: lavender.lav100,
  // Media surface behind Product photos / stickers: dense enough for a white
  // contour to read, still a light Souris lavender.
  surfaceMedia: lavender.lav200,
  surfaceRose: rose.rose050,
  surfacePeach: peach.peach050,
  surfacePeachStrong: peach.peach100,
  borderSubtle: colors.border,
  borderLavender: lavender.lav200,
  accent: colors.accent,
  foreground: colors.foreground,
  foregroundSoft,
  foregroundMuted: colors.muted,
} as const;

// Overlay material — the satin surface of sheets, drawers and confirmation
// dialogs (DESIGN_OVERRIDES.md §20). Near-white lavender rather than flat
// white, light enough that lavender, neutral and white inner cards still read
// on it. Deliberately OPAQUE: without a blur, even 3 % translucency lets the
// page ghost through the text. The glass feel comes from the rim and the
// highlight (`gloss.surface`), not from see-through. Approved colours and their
// alpha variants only. No outline of any kind: the material is edged by light
// (top highlight) and depth (shadow), never by a drawn border.
export const overlayMaterial = {
  surface: lavender.lav025,
  /** Destructive confirmations: the same surface leaning a whisper toward rose050. */
  surfaceDestructive: '#FDF6F9', // midpoint of lavender.lav025 and rose.rose050
  /** Grabber: translucent navy, so it takes the tint of the material. */
  grabber: 'rgba(25, 22, 63, 0.16)',
} as const;

// Modal scrim — one restrained navy dim behind bottom sheets and dialogs.
// Alpha variant of the canonical foreground navy; the underlying screen stays
// recognizable while the presented surface remains dominant.
export const scrim = 'rgba(25, 22, 63, 0.16)';

// Shadow tint source colors — used only to describe shadow design intent.
// Native shadows on iOS/Android use platform APIs, not these hex values directly.
// These are documented for future native component mapping.
export const shadowSource = {
  navy: '#1F1C3D', // oklch(0.25 0.06 285) — tint for sheet and raise shadows
  lavender: '#654199', // oklch(0.46 0.14 300) — tint for FAB shadow
} as const;
