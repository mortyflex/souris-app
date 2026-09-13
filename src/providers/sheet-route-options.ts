// Souris — native sheet route options
//
// The ONE place that configures how Expo Router presents Souris workflow
// routes as native form sheets, so every route shares the canonical shell
// (white surface, sheet radius, Souris grabber drawn by SheetScreen instead
// of the system one) and an explicit gesture policy:
//
//   workflowSheet  fixed detent, swipe-to-dismiss DISABLED — long scrolling
//                  bodies (Client list, catalog grid, Sale lines) must never
//                  abandon a draft; leaving goes through « Annuler »;
//   editorSheet    content-sized editors (Product / Service details, creation
//                  choosers and forms) that never fill the screen with empty
//                  space; the screen toggles the swipe off while a draft is
//                  edited (navigation.setOptions);
//   contentSheet   read-first details sized to their content, swipe allowed.

import { radii, semanticColors, sheet } from '@/shared/ui/theme';

const sheetShell = {
  presentation: 'formSheet' as const,
  headerShown: false,
  contentStyle: { backgroundColor: semanticColors.surfaceElevated },
  sheetCornerRadius: radii.ios.sheet,
  sheetGrabberVisible: false,
};

export const workflowSheet = {
  ...sheetShell,
  sheetAllowedDetents: [sheet.detent] as number[],
  gestureEnabled: false,
};

export const editorSheet = {
  ...sheetShell,
  sheetAllowedDetents: 'fitToContents' as const,
};

export const contentSheet = {
  ...sheetShell,
  sheetAllowedDetents: 'fitToContents' as const,
};
