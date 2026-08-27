// Souris design tokens — Typography
//
// Source: docs/design/DESIGN.md §3, docs/design/reference-export/colors_and_type.css
//
// One family: Inter. The concrete font files are loaded in src/app/_layout.tsx.
//
// React Native letterSpacing is absolute (not CSS em).
// Each value is computed as: fontSize × sourceEm
// React Native lineHeight is absolute.
// Each value is computed as: fontSize × sourceMultiplier
//
// All sizes are device-independent pixels.
// All weights use valid React Native TextStyle fontWeight values.

type FontWeight = "300" | "400" | "500" | "600" | "700";

interface TextRole {
  fontSize: number;
  fontWeight: FontWeight;
  lineHeight?: number;
  letterSpacing: number;
}

// Onboarding display: 31px / 700 / -0.032em
// letterSpacing = 31 × -0.032 = -0.992
export const onboardingDisplay = {
  fontSize: 31,
  fontWeight: "700",
  letterSpacing: -0.992,
} as const satisfies TextRole;

// Screen title iOS: 27px / 700 / line-height × 1.12 / -0.028em
// lineHeight = 27 × 1.12 = 30.24
// letterSpacing = 27 × -0.028 = -0.756
export const screenTitleIos = {
  fontSize: 27,
  fontWeight: "700",
  lineHeight: 30.24,
  letterSpacing: -0.756,
} as const satisfies TextRole;

// Screen title Android: 24px / 600 / -0.01em
// letterSpacing = 24 × -0.01 = -0.24
export const screenTitleAndroid = {
  fontSize: 24,
  fontWeight: "600",
  letterSpacing: -0.24,
} as const satisfies TextRole;

// Sheet title: 19px / 700 / ≈ -0.02em
// letterSpacing = 19 × -0.02 = -0.38
export const sheetTitle = {
  fontSize: 19,
  fontWeight: "700",
  letterSpacing: -0.38,
} as const satisfies TextRole;

// Day summary value: 20px / 700 / -0.026em
// letterSpacing = 20 × -0.026 = -0.52
export const daySummaryValue = {
  fontSize: 20,
  fontWeight: "700",
  letterSpacing: -0.52,
} as const satisfies TextRole;

// State title (empty/error): 17px / 700 / -0.017em
// letterSpacing = 17 × -0.017 = -0.289
export const stateTitle = {
  fontSize: 17,
  fontWeight: "700",
  letterSpacing: -0.289,
} as const satisfies TextRole;

// Section title: clear editorial grouping without administrative uppercase.
export const sectionTitle = {
  fontSize: 17,
  fontWeight: "600",
  lineHeight: 22,
  letterSpacing: -0.187,
} as const satisfies TextRole;

// Body: 16px / 400 / line-height × 1.45
// lineHeight = 16 × 1.45 = 23.2
export const body = {
  fontSize: 16,
  fontWeight: "400",
  lineHeight: 23.2,
  letterSpacing: 0,
} as const satisfies TextRole;

// Row title: 15.5px / 600 / -0.011em
// letterSpacing = 15.5 × -0.011 = -0.1705
export const rowTitle = {
  fontSize: 15.5,
  fontWeight: "600",
  letterSpacing: -0.1705,
} as const satisfies TextRole;

// Control iOS: 15px / 600 / -0.006em
// letterSpacing = 15 × -0.006 = -0.09
export const controlIos = {
  fontSize: 15,
  fontWeight: "600",
  letterSpacing: -0.09,
} as const satisfies TextRole;

// Control Android: 15px / 500 / -0.006em
// letterSpacing = 15 × -0.006 = -0.09
export const controlAndroid = {
  fontSize: 15,
  fontWeight: "500",
  letterSpacing: -0.09,
} as const satisfies TextRole;

// Metadata: 13px / 400 / +0.01em
// letterSpacing = 13 × 0.01 = 0.13
export const metadata = {
  fontSize: 13,
  fontWeight: "400",
  letterSpacing: 0.13,
} as const satisfies TextRole;

// Eyebrow / section label: 12px / 600 / +0.09em / uppercase
// letterSpacing = 12 × 0.09 = 1.08
// textTransform: 'uppercase' must be applied at the component level.
export const eyebrow = {
  fontSize: 12,
  fontWeight: "600",
  letterSpacing: 1.08,
} as const satisfies TextRole;

// Chip / event time / legend: 11.5px / 600 / +0.015em
// letterSpacing = 11.5 × 0.015 = 0.1725
export const chip = {
  fontSize: 11.5,
  fontWeight: "600",
  letterSpacing: 0.1725,
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
  fontWeight: "300",
  letterSpacing: 0.1725,
} as const satisfies TextRole;

// Tab iOS: 10.5px / 600
export const tabIos = {
  fontSize: 10.5,
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
