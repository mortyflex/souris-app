// Souris — grouped look for virtualized history lists
//
// A virtualized list cannot wrap its rows in one GroupedSurface, so each row
// carries its slice of the surface: the same white fill and hairline, the
// top corners on the first row and the bottom corners on the last.

import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { radii, semanticColors } from '@/shared/ui/theme';

export function groupedListItemStyle(index: number, count: number): StyleProp<ViewStyle> {
  return [styles.item, index === 0 && styles.first, index === count - 1 && styles.last];
}

const styles = StyleSheet.create({
  item: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  first: {
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  last: {
    borderBottomLeftRadius: radii.large,
    borderBottomRightRadius: radii.large,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
