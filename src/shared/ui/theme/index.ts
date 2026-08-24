// Souris — Native Design Tokens
//
// Source of truth:
//   docs/design/DESIGN.md
//   docs/design/reference-export/tokens.css
//   docs/design/reference-export/colors_and_type.css
//
// These tokens are immutable design constants for the Souris native application.
// They faithfully represent the approved exported design in a React-Native-compatible form.
// Do not invent new values — derive from the approved design sources.

export { colors, lavender, rose, peach, foregroundSoft, shadowSource } from './colors';
export { spacing, gutter, bottomClearance } from './spacing';
export { radii } from './radii';
export {
  typography,
  onboardingDisplay,
  screenTitleIos,
  screenTitleAndroid,
  sheetTitle,
  daySummaryValue,
  stateTitle,
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
} from './typography';
export { duration, easing } from './motion';
export { agenda, touchTarget } from './layout';
export { shadows } from './shadows';
