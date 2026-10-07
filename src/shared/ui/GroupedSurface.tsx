// BeautIzzy — GroupedSurface
//
// The white grouped-list surface of the redesigned Appointment sheets
// (DESIGN_OVERRIDES.md §26, §27): `surfaceElevated`, one `borderSubtle`
// hairline, `radii.large`, clipped. Rows inside draw their own inset
// separators (`GroupedSeparator`); the surface adds no padding.

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radii, semanticColors } from './theme';

interface GroupedSurfaceProps {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function GroupedSurface({ children, style, testID }: GroupedSurfaceProps) {
  return (
    <View style={[styles.surface, style]} testID={testID}>
      {children}
    </View>
  );
}

/** The inset hairline between two grouped rows; `inset` is the leading indent. */
export function GroupedSeparator({ inset }: { readonly inset: number }) {
  return <View style={[styles.separator, { marginLeft: inset }]} />;
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  separator: {
    backgroundColor: semanticColors.borderSubtle,
    height: StyleSheet.hairlineWidth,
  },
});
