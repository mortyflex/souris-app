// BeautIzzy — TabBarGlassScrollEdge
//
// Wraps the ONE vertical ScrollView of a main tab screen whose content runs
// beneath the native tab bar.
//
// iOS 26 lays a soft scroll-edge effect over scroll content under the bar: a
// dimming fog that greys the pastel Agenda cards before the Liquid Glass ever
// samples them, so the bar reads dull instead of glassy. Hiding that bottom
// edge effect lets the system glass refract the real, crisp content. This is
// UIKit's own `UIScrollEdgeEffect` switch — no blur view, no overlay, no custom
// bar; the glass material itself stays entirely the system's. The system still
// keeps the bar's icons and labels legible over whatever scrolls beneath.
//
// No-op on iOS 18 and earlier. On Android the marker is NOT mounted at all:
// the native side insists on a ScrollView as its direct child and throws
// otherwise — and a ScrollView given a `refreshControl` (pull-to-refresh) is
// wrapped in a SwipeRefreshLayout there, which crashed the Agenda tab. Android
// has no scroll-edge effect to hide anyway, so the children render as they are.
// The native marker comes from `react-native-screens/experimental`; this file
// is the single place that depends on it.

import type { ReactElement } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';

interface TabBarGlassScrollEdgeProps {
  /** The ScrollView itself — the marker resolves its direct child only. */
  readonly children: ReactElement;
}

const scrollEdgeEffects = { bottom: 'hidden' } as const;

export function TabBarGlassScrollEdge({ children }: TabBarGlassScrollEdgeProps) {
  if (Platform.OS === 'android') return children;
  return (
    <ScrollViewMarker scrollEdgeEffects={scrollEdgeEffects} style={styles.fill}>
      {children}
    </ScrollViewMarker>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
