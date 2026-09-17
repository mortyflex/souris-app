// Souris — sheet route options
//
// The ONE place that configures how Expo Router presents Souris sheet routes,
// so every route shares the canonical shell drawn by `SheetScreen` (satin
// overlay surface, sheet radius, Souris grabber) and an explicit gesture policy.
//
//   workflowSheet  NATIVE form sheet on the system's large detent (the only one
//                  iOS 26 keeps attached to the screen edges), swipe-to-dismiss
//                  DISABLED — long scrolling bodies (Client list, catalog grid,
//                  Sale lines) must never abandon a draft; leaving goes through
//                  « Annuler ». Paired with `<SheetScreen fit="fill">`.
//
//   editorSheet    content-sized sheets (Product / Service details, creation
//   contentSheet   choosers and forms, Appointment details). A native sheet
//                  below the large detent is floated by iOS 26 as an inset card
//                  (side margins, gap below, four rounded corners), so these
//                  routes are TRANSPARENT MODALS and `<SheetScreen
//                  fit="content">` draws the shared SheetPresentation itself:
//                  full width, flush with the bottom, identical to every
//                  BottomSheet. SheetScreen owns the open / close transition
//                  (hence no navigator animation) and the swipe / outside-tap
//                  policy (`dismissible`, off while a draft is edited), so the
//                  native gesture stays off.

import { overlayMaterial, radii, sheet } from '@/shared/ui/theme';

export const workflowSheet = {
  presentation: 'formSheet' as const,
  headerShown: false,
  contentStyle: { backgroundColor: overlayMaterial.surface },
  sheetCornerRadius: radii.ios.sheet,
  sheetGrabberVisible: false,
  sheetAllowedDetents: [sheet.workflowDetent] as number[],
  gestureEnabled: false,
};

const routeSheet = {
  presentation: 'transparentModal' as const,
  headerShown: false,
  animation: 'none' as const,
  contentStyle: { backgroundColor: 'transparent' },
  gestureEnabled: false,
};

export const editorSheet = routeSheet;

export const contentSheet = routeSheet;
