// Souris — Directory list grid
//
// The ONE structural grid of the Produits and Clientes directories
// (DESIGN_OVERRIDES.md §36): search, tabs, section header, row rhythm,
// separators, empty state and bottom clearance. Both screens render inside
// the shared `Screen` gutter, so every edge — title, search, tabs, thumbnail,
// separator — lines up on the platform gutter, and switching tabs never moves
// the grid. Only the grid is shared: each screen keeps its own row content.
//
// The separator is the row's own hairline bottom border: decorative, never an
// element, so it adds no screen-reader stop. It spans the row content width,
// thumbnail to the trailing NavigationChevron. Every row is at least 72 pt,
// whatever its number of lines, so both lists keep one rhythm.

import { Platform, StyleSheet } from 'react-native';

import { bottomClearance, foregroundSoft, gutter, semanticColors, spacing } from './theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export const directoryListStyles = StyleSheet.create({
  searchArea: { paddingTop: spacing.base },
  tabsArea: { paddingBottom: spacing.xs, paddingTop: spacing.md },
  // The native tab bar overlays the page: the system bottom inset keeps the
  // last row above it, bottomClearance then clears the floating +.
  listContent: { paddingBottom: bottomClearance[Platform.OS === 'android' ? 'android' : 'ios'] },
  sectionHeader: {
    marginTop: spacing['2xl'],
    paddingBottom: spacing.sm,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 72,
    paddingVertical: spacing.sm,
  },
  // Rows sit on the app background (`screen`): lav050 would vanish there, so the
  // press shows the stronger lavender step.
  rowPressed: { backgroundColor: semanticColors.surfaceLavenderStrong },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing['2xl'],
  },
  emptyStateText: {
    color: foregroundSoft,
    textAlign: 'center',
  },
});
