// Souris — Native Design Tokens
//
// Source of truth:
//   docs/design/DESIGN_OVERRIDES.md
//   docs/design/DESIGN.md
//   docs/design/reference-export/tokens.css
//   docs/design/reference-export/colors_and_type.css
//
// These tokens are the approved native runtime decisions for Souris. Canonical
// colors remain derived from the export; semantic aliases and native depth/motion
// follow the newer runtime direction recorded in DESIGN_OVERRIDES.md.

export {
  colors,
  lavender,
  rose,
  peach,
  foregroundSoft,
  semanticColors,
  shadowSource,
} from './colors';
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
} from './typography';
export { duration, easing, interaction } from './motion';
export { agenda, touchTarget } from './layout';
export { nativeShadows, shadows } from './shadows';
