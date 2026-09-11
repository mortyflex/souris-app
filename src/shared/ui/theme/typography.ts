// Souris design tokens — Typography
//
// Source: docs/design/DESIGN_OVERRIDES.md §12 (native runtime typography),
//         docs/design/DESIGN.md §3 (original Inter hierarchy, preserved as history)
//
// One family: Plus Jakarta Sans. The concrete font files are loaded in
// src/app/_layout.tsx. Four weights only: 400 / 500 / 600 / 700.
//
// React Native letterSpacing is absolute (not CSS em).
// React Native lineHeight is absolute.
//
// All sizes are device-independent pixels.
// All weights use valid React Native TextStyle fontWeight values.

type FontWeight = "400" | "500" | "600" | "700";

interface TextRole {
  fontSize: number;
  fontWeight: FontWeight;
  lineHeight?: number;
  letterSpacing: number;
}

/**
 * Concrete native font family per weight. Each weight is a distinct family:
 * the resolved style never sets `fontWeight`, otherwise iOS may synthesize a
 * weight instead of using the loaded file.
 */
export const fontFamilies = {
  "400": "PlusJakartaSans_400Regular",
  "500": "PlusJakartaSans_500Medium",
  "600": "PlusJakartaSans_600SemiBold",
  "700": "PlusJakartaSans_700Bold",
} as const satisfies Record<FontWeight, string>;

// Onboarding display: 34px / 700 / -0.03em
export const onboardingDisplay = {
  fontSize: 34,
  fontWeight: "700",
  lineHeight: 40,
  letterSpacing: -1.02,
} as const satisfies TextRole;

// Screen title iOS: 30px / 700 / -0.024em
export const screenTitleIos = {
  fontSize: 30,
  fontWeight: "700",
  lineHeight: 36,
  letterSpacing: -0.72,
} as const satisfies TextRole;

// Screen title Android: 27px / 700 / -0.012em
export const screenTitleAndroid = {
  fontSize: 27,
  fontWeight: "700",
  lineHeight: 33,
  letterSpacing: -0.324,
} as const satisfies TextRole;

// Sheet title: 21px / 700 / -0.02em
export const sheetTitle = {
  fontSize: 21,
  fontWeight: "700",
  lineHeight: 26,
  letterSpacing: -0.42,
} as const satisfies TextRole;

// Day summary value / price and stock key values: 23px / 700 / -0.024em
export const daySummaryValue = {
  fontSize: 23,
  fontWeight: "700",
  lineHeight: 28,
  letterSpacing: -0.552,
} as const satisfies TextRole;

// State title (empty/error): 18px / 700 / -0.016em
export const stateTitle = {
  fontSize: 18,
  fontWeight: "700",
  lineHeight: 24,
  letterSpacing: -0.288,
} as const satisfies TextRole;

// Section title: clear editorial grouping without administrative uppercase.
// 18px / 700 / -0.016em
export const sectionTitle = {
  fontSize: 18,
  fontWeight: "700",
  lineHeight: 24,
  letterSpacing: -0.288,
} as const satisfies TextRole;

// Body: 16px / 400 / line-height 24
export const body = {
  fontSize: 16,
  fontWeight: "400",
  lineHeight: 24,
  letterSpacing: 0,
} as const satisfies TextRole;

// Row title / primary names: 16.5px / 600 / -0.01em
export const rowTitle = {
  fontSize: 16.5,
  fontWeight: "600",
  lineHeight: 22,
  letterSpacing: -0.165,
} as const satisfies TextRole;

// Control iOS (CTA, actions, key values): 16px / 600 / -0.006em
export const controlIos = {
  fontSize: 16,
  fontWeight: "600",
  letterSpacing: -0.096,
} as const satisfies TextRole;

// Control Android: 16px / 500 / -0.006em
export const controlAndroid = {
  fontSize: 16,
  fontWeight: "500",
  letterSpacing: -0.096,
} as const satisfies TextRole;

// Metadata: 13.5px / 400 / +0.006em
export const metadata = {
  fontSize: 13.5,
  fontWeight: "400",
  letterSpacing: 0.081,
} as const satisfies TextRole;

// Eyebrow / section label: 12px / 600 / +0.09em / uppercase
// textTransform: 'uppercase' must be applied at the component level.
export const eyebrow = {
  fontSize: 12,
  fontWeight: "600",
  letterSpacing: 1.08,
} as const satisfies TextRole;

// Chip / event time / legend: 12px / 600 / +0.015em
export const chip = {
  fontSize: 12,
  fontWeight: "600",
  letterSpacing: 0.18,
} as const satisfies TextRole;

// Agenda full-hour label: metadata sizing with a slightly stronger hierarchy.
export const agendaHour = {
  fontSize: 10,
  fontWeight: "500",
  letterSpacing: 0.13,
} as const satisfies TextRole;

// Agenda quarter-hour label: compact and intentionally quiet.
export const agendaQuarter = {
  fontSize: 9,
  fontWeight: "400",
  letterSpacing: 0.1725,
} as const satisfies TextRole;

// Tab iOS: 11px / 600
export const tabIos = {
  fontSize: 11,
  fontWeight: "600",
  letterSpacing: 0,
} as const satisfies TextRole;

// Tab Android: 12px / 500
export const tabAndroid = {
  fontSize: 12,
  fontWeight: "500",
  letterSpacing: 0,
} as const satisfies TextRole;

export const typography = {
  onboardingDisplay,
  screenTitleIos,
  screenTitleAndroid,
  sheetTitle,
  daySummaryValue,
  stateTitle,
  sectionTitle,
  body,
  rowTitle,
  controlIos,
  controlAndroid,
  metadata,
  eyebrow,
  chip,
  agendaHour,
  agendaQuarter,
  tabIos,
  tabAndroid,
} as const;
