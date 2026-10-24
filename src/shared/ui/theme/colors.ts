// BeautIzzy design tokens — Colors
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
  background: "#FFFFFF",
  foreground: "#19163F",
  accent: "#7354C7",
  surface: "#F6F6F7",
  muted: "#9896A9",
  border: "#DFDEE4",
} as const;

// Lavender — structure, normal appointment/service visual language.
// Derived from oklch hue 300.
export const lavender = {
  lav025: "#FBF9FE", // oklch(0.985 0.006 300) — background outside frame, row hover
  lav050: "#F7F4FE", // oklch(0.972 0.014 300) — icon badge, event background
  lav100: "#EFE9FD", // oklch(0.945 0.028 300) — avatar, chip, Material active indicator
  lav200: "#E1D6F9", // oklch(0.895 0.050 300) — event border, bar fill
  lav700: "#654199", // oklch(0.46 0.14 300) — primary button hover, text on lavender
} as const;

// Rose — current-time indicator, errors, cancellation, destructive actions.
// Derived from oklch hue 6.
export const rose = {
  rose050: "#FFF2F4", // oklch(0.972 0.016 6) — error field background, danger hover bg
  rose100: "#FFE1E6", // oklch(0.938 0.038 6) — rose pastel light
  rose200: "#FEC9D3", // oklch(0.885 0.062 6) — danger button border
  rose600: "#CF3869", // oklch(0.58 0.19 6) — now-line, error text, destructive action
  rose700: "#893A4F", // oklch(0.46 0.11 6) — text on rose fills (≥ 6:1 on rose100), blush identity
} as const;

// Peach — processing/unattended time and regained availability.
// Peach is NOT a warning color. It represents "the professional is free during this phase."
// Derived from oklch hue 62.
export const peach = {
  peach050: "#FFF4EB", // oklch(0.975 0.018 62) — processing time lightest
  peach100: "#FFE8D4", // oklch(0.945 0.038 62) — processing time fill
  peach200: "#FDD6B5", // oklch(0.900 0.062 62) — processing time stripe border
  peach700: "#955816", // oklch(0.52 0.11 62) — processing time accent / text
} as const;

// Mint — the SIMPLE-service category in the Appointment service picker
// (DESIGN_OVERRIDES.md §22). A category colour, NOT a success / validation
// colour. Same OKLCH lightness steps as the lavender scale at hue 160; 600 / 700
// sit on the approved mint planning-card accent and title.
export const mint = {
  mint050: "#EAFBF1", // oklch(0.972 0.022 160) — simple-service card
  mint100: "#D7F6E4", // oklch(0.945 0.040 160) — selected simple-service card
  mint200: "#BAEACE", // oklch(0.895 0.062 160) — simple-service card border
  mint600: "#118659", // oklch(0.55 0.12 160) — selected border, check badge
  mint650: "#236647", // oklch(0.46 0.085 160) — supporting text on mint (≥ 5.9:1 on mint100)
  mint700: "#0C5C3C", // oklch(0.42 0.09 160) — title on mint (≥ 6.9:1 on mint100)
} as const;

// Azure — the TECHNIQUE category of « Modifier le rendez-vous »
// (DESIGN_OVERRIDES.md §27). Taxonomy, never a state: not success, not
// information, not a client colour. 600 is the approved reference hue
// (3.4:1 on white: graphics only — dots, checks, hairlines); 700 carries white
// text (5.3:1) and category-coloured text on the tints.
export const azure = {
  azure050: "#F1F6FD", // selected Technique row
  azure200: "#C9DCF4", // selected Technique hairline
  azure600: "#4F8EDC", // Technique accent: dot, check
  azure700: "#2F6DB8", // active Techniques segment fill, text on azure
} as const;

// Agenda appointment pastels — the fifteen planning-card families
// (DESIGN_OVERRIDES.md §19). A family identifies a client within the calendar.
// These are explicit, approved design tokens ("Appointment Card Color Palette"
// reference): never derived at runtime, never blended, always painted flat.
//   background — solid pastel fill of the card
//   accent     — solid left border, the strongest chromatic reference
//   title      — client name, dark tone of the same hue (≥ 4.6:1 on background)
//   subtitle   — service line, phase and reprise; the approved palette sets it
//                to the accent (2.1–4.1:1 on background, see §19)
// The ORDER is part of the design: a client whose preferred family is taken
// probes forward through this list, so neighbours are deliberately contrasting
// (the hue-ordered reference walked four steps at a time).
export const appointmentPastels = {
  mint: {
    background: "#DDF5E7",
    accent: "#14875B",
    title: "#0C5B3D",
    subtitle: "#14875B",
  },
  powderBlue: {
    background: "#E7EEFF",
    accent: "#5B72D6",
    title: "#394A99",
    subtitle: "#5B72D6",
  },
  softRose: {
    background: "#FCE8F1",
    accent: "#D65C8B",
    title: "#963C61",
    subtitle: "#D65C8B",
  },
  sand: {
    background: "#F4EBDD",
    accent: "#B48A55",
    title: "#7E5D38",
    subtitle: "#B48A55",
  },
  sage: {
    background: "#E7F1DC",
    accent: "#6C9A47",
    title: "#476C2D",
    subtitle: "#6C9A47",
  },
  softIndigo: {
    background: "#E9E9FF",
    accent: "#6565CF",
    title: "#41418E",
    subtitle: "#6565CF",
  },
  coral: {
    background: "#FDE8E1",
    accent: "#E46F4F",
    title: "#9C3E29",
    subtitle: "#E46F4F",
  },
  softYellow: {
    background: "#FFF6D6",
    accent: "#D0A526",
    title: "#8A6A09",
    subtitle: "#D0A526",
  },
  aqua: {
    background: "#DFF4F1",
    accent: "#2B9D90",
    title: "#17665E",
    subtitle: "#2B9D90",
  },
  lilac: {
    background: "#EEE7FF",
    accent: "#7B5BD6",
    title: "#513A99",
    subtitle: "#7B5BD6",
  },
  peach: {
    background: "#FCEAD8",
    accent: "#D96A16",
    title: "#9B4209",
    subtitle: "#D96A16",
  },
  pistachio: {
    background: "#EEF3D9",
    accent: "#8DAA35",
    title: "#5E7420",
    subtitle: "#8DAA35",
  },
  skyBlue: {
    background: "#E2F1FF",
    accent: "#2785C7",
    title: "#155B8A",
    subtitle: "#2785C7",
  },
  lavender: {
    background: "#F2E8FF",
    accent: "#9A5BC8",
    title: "#65378A",
    subtitle: "#9A5BC8",
  },
  apricot: {
    background: "#FBE6CC",
    accent: "#C77717",
    title: "#8A4D0A",
    subtitle: "#C77717",
  },
} as const;

// Mauve — personal unavailability ONLY (Calendar Blocks, DESIGN_OVERRIDES.md
// §24). Derived from oklch hue 326, next to the structural lavender (300) and
// further from every client planning pastel than those pastels are from one
// another. Never a client colour, never a status, never a warning — and never
// a brand colour: BeautIzzy's identity is navy, violet and lavender.
//
// `mauve900` is the family's darkest step, the block title. Historically it
// was the plum of the previous Souris wordmark (hue 336), once a brand token;
// it survives ONLY here, unchanged, so Calendar Blocks look exactly as before.
export const mauve = {
  mauve050: "#FBEFFB", // oklch(0.965 0.020 326) — form / details surface
  mauve100: "#F2D8F2", // oklch(0.910 0.045 326) — Agenda block fill
  mauve200: "#EAC4EA", // oklch(0.865 0.065 326) — selected reason chip, pressed fill
  mauve600: "#823F84", // oklch(0.48 0.13 326) — accent: left border, icon, marker
  mauve700: "#68376A", // oklch(0.42 0.10 326) — reason text (≥ 6.7:1 on mauve100)
  mauve900: "#5F1852", // block title (9.1:1 on mauve100, 10.8:1 on mauve050)
} as const;

// Receipt paper — the « Résumé du jour » ticket ONLY (DESIGN_OVERRIDES.md §25).
// A warm near-white derived from oklch hue 80, flat: no grain, no texture, no
// gradient. Navy text keeps its full contrast on it (foreground 16.6:1).
// Dashes and the printer groove are alpha variants of the canonical navy.
export const receiptPaper = {
  surface: "#FEFBF7", // oklch(0.99 0.006 80)
  /** Dashed tear lines between the receipt sections. */
  separator: "rgba(25, 22, 63, 0.20)",
  /** The groove of the printer capsule the paper comes out of. */
  slot: "rgba(25, 22, 63, 0.24)",
} as const;

// Podium of « Tops & tendances » (DESIGN_OVERRIDES.md §34). FLAT colours only.
//
// Medals: muted metal discs — a warm antique gold, a pearl silver, a soft
// bronze — each with a darker rim, a lighter inset ring and the digit written
// on it (≥ 6:1 on its fill), hanging from two ribbon tails in the BeautIzzy
// lilac family. The colour never carries the rank alone: it is also written
// and spoken.
export const receiptMedal = {
  gold: {
    fill: "#E6CD8C",
    rim: "#B48F3E",
    inset: "#F3E4B8",
    text: "#5A4213",
    ribbon: "#654199",
    ribbonShade: "#7C5FC9",
  },
  silver: {
    fill: "#DEDCE7",
    rim: "#9E9BB2",
    inset: "#EFEEF4",
    text: "#3F3D55",
    ribbon: "#9A85D6",
    ribbonShade: "#B2A1E2",
  },
  bronze: {
    fill: "#E2BFA2",
    rim: "#A6704B",
    inset: "#F0D8C4",
    text: "#5B331A",
    ribbon: "#9A85D6",
    ribbonShade: "#B2A1E2",
  },
} as const;

// Plinths: lilac blocks on a common floor, the winner's one step stronger,
// each with a slightly deeper top face and its rank quietly on the front.
export const receiptPodium = {
  first: { face: "#DCCEF6", top: "#C8B5EF", number: "#7C5FC9" },
  place: { face: "#EAE2FB", top: "#D8CAF5", number: "#9A85D6" },
} as const;

// Caution — the graded severity of a recurring client no-show pattern
// (DESIGN_OVERRIDES.md §35, Activité). A thin outline on the « Absences »
// stat card ONLY: never a card fill, never a status, never a client colour,
// and NOT peach (peach is processing time). Two warm steps derived from
// OKLCH, each ≥ 2.7:1 on white as a 1.5 pt graphic; the strongest step is the
// existing rose600 so the scale ends on the system's one danger colour. The
// colour never carries the severity alone: the count stays written and the
// severity is spoken.
export const caution = {
  amber600: "#D19000", // oklch(0.70 0.150 78) — low: 1–2 no-shows
  orange600: "#D65C00", // oklch(0.62 0.175 48) — moderate: 3–5 no-shows
  red600: rose.rose600, // high: 6 no-shows or more
} as const;

// Secondary readable foreground — readable secondary metadata text.
// More legible than muted; reserved for text that is actually read.
// oklch(0.42 0.055 285)
export const foregroundSoft = "#4A496A";

// Native runtime roles introduced by the soft editorial refresh.
// Every role aliases an approved canonical or derived BeautIzzy color above.
// Screens should use these names when the visual decision is semantic rather
// than tied to a particular palette step.
//
// Surface hierarchy (DESIGN_OVERRIDES.md §39, « Lavender satin »):
//
//   screen            app background — very low-chroma lavender near-white
//     overlayMaterial   sheets — lav025, slightly lighter than the page
//       surfaceElevated   primary cards — white
//       surfaceInput      idle inputs inside white cards and sheets
//
// Two derived near-whites of the lavender hue carry it; both are far quieter
// than the lav050 pastel step, so the page reads as a neutral surface, never
// as a pastel background.
const appBackground = "#F5F3F8"; // oklch(0.967 0.007 304)
const inputSurface = "#F1EEF5"; // oklch(0.953 0.010 305)

export const semanticColors = {
  /** The ONE general app background: tabs, pushed screens, auth, navigation. */
  screen: appBackground,
  /**
   * Compatibility alias of `screen` — debt from the former white-tab /
   * lavender-pushed-screen split. New code uses `screen`; this may be removed.
   */
  screenWarm: appBackground,
  /**
   * A deliberate WHITE operational canvas (Agenda: pastel planning cards,
   * Calendar Blocks, week headers). Not a generic way around `screen`.
   */
  canvas: colors.background,
  surface: colors.surface,
  /** Elevated / primary card surface. Never a foreground colour: see `onAccent`. */
  surfaceElevated: colors.background,
  /** Idle input fill where a field needs separation inside a white card or a sheet. */
  surfaceInput: inputSurface,
  /** Text and icons drawn on strong accent / category / destructive fills. */
  onAccent: colors.background,
  surfaceLavender: lavender.lav050,
  surfaceLavenderStrong: lavender.lav100,
  // Media surface behind Product photos / stickers: dense enough for a white
  // contour to read, still a light BeautIzzy lavender.
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

// Month calendar intensity (DESIGN_OVERRIDES.md §21) — the soft halo behind a
// day number, three quiet strengths of the canonical BeautIzzy violet
// (`colors.accent`, rgb 115 84 199) — never a financial red / green, never a
// gradient. Every step is stronger than the selected fill (`lav100`, about
// 10 % of the violet), so a selected circle still reads inside its halo. The
// navy foreground stays ≥ 7:1 on the strongest step.
export const calendarIntensity = {
  low: "rgba(115, 84, 199, 0.16)",
  medium: "rgba(115, 84, 199, 0.30)",
  high: "rgba(115, 84, 199, 0.48)",
} as const;

// Calendar Block (personal unavailability) — ONE fixed family for every block
// (DESIGN_OVERRIDES.md §24): same colour = "the professional is unavailable",
// while the client pastels keep identifying clients. Painted flat, like the
// planning cards. The title is the darkest mauve: 9.1:1 on the fill.
export const calendarBlockColors = {
  background: mauve.mauve100,
  backgroundPressed: mauve.mauve200,
  accent: mauve.mauve600,
  title: mauve.mauve900,
  subtitle: mauve.mauve700,
  /** Quiet surface of the editor context card and the details card. */
  surface: mauve.mauve050,
} as const;

// Prestation categories of the shared catalogue and « Modifier le
// rendez-vous » (DESIGN_OVERRIDES.md §27, §28) — keyed by the domain
// `ServiceType`. SERVICE keeps the BeautIzzy violet,
// TECHNIQUE the complementary azure. Colour is never the only cue: the
// segment label, the list context and the spoken category go with it.
//   accent — small graphics: leading dot, selection check, hairline
//   strong — a filled surface carrying white text (≥ 4.5:1)
//   tint   — the whisper behind a selected card
//   border — the hairline of an idle card
// The primary action stays `semanticColors.accent` whatever the category.
export const serviceCategoryColors = {
  SERVICE: {
    accent: colors.accent,
    strong: colors.accent,
    tint: lavender.lav050,
    border: lavender.lav200,
  },
  TECHNIQUE: {
    accent: azure.azure600,
    strong: azure.azure700,
    tint: azure.azure050,
    border: azure.azure200,
  },
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
  surfaceDestructive: "#FDF6F9", // midpoint of lavender.lav025 and rose.rose050
  /** Grabber: translucent navy, so it takes the tint of the material. */
  grabber: "rgba(25, 22, 63, 0.16)",
  /**
   * Glass Sheet Pilot (DESIGN_OVERRIDES.md §40), experimental: the milky veil
   * laid over the native `regular` glass — the same lav025 at 60 %: the material
   * and the dimmed page stay perceptible, the page's text does not stay
   * comfortably legible, and the sheet still reads as `surface`. Wherever the
   * glass is not drawn, the opaque `surface` is used.
   */
  glassTint: "rgba(251, 249, 254, 0.6)",
} as const;

// Modal scrim — one restrained navy dim behind bottom sheets and dialogs.
// Alpha variant of the canonical foreground navy; the underlying screen stays
// recognizable while the presented surface remains dominant.
export const scrim = "rgba(25, 22, 63, 0.16)";

// Shadow tint source colors — used only to describe shadow design intent.
// Native shadows on iOS/Android use platform APIs, not these hex values directly.
// These are documented for future native component mapping.
export const shadowSource = {
  navy: "#1F1C3D", // oklch(0.25 0.06 285) — tint for sheet and raise shadows
  lavender: "#654199", // oklch(0.46 0.14 300) — tint for FAB shadow
} as const;
