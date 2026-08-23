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

// Secondary readable foreground — readable secondary metadata text.
// More legible than muted; reserved for text that is actually read.
// oklch(0.42 0.055 285)
export const foregroundSoft = '#4A496A';

// Shadow tint source colors — used only to describe shadow design intent.
// Native shadows on iOS/Android use platform APIs, not these hex values directly.
// These are documented for future native component mapping.
export const shadowSource = {
  navy: '#1F1C3D', // oklch(0.25 0.06 285) — tint for sheet and raise shadows
  lavender: '#654199', // oklch(0.46 0.14 300) — tint for FAB shadow
} as const;
