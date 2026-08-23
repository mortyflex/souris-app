// Souris design tokens — Layout
//
// Source: docs/design/DESIGN.md §5 (Agenda grid), docs/design/reference-export/tokens.css
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
