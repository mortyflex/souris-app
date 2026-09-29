// Souris — SurfaceGloss
//
// The satin finish shared by every overlay surface — BottomSheet, SheetScreen
// and ConfirmationDialog (docs/design/DESIGN_OVERRIDES.md §20). Rendered FIRST
// inside the surface, under its content:
//
// - a full-width highlight that starts at the very top edge and dissolves to
//   nothing (`gloss.surface.sheen`) — it has no lower edge, so it can never
//   read as a rectangle floating inside the surface;
// - a bright top hairline drawn as an inset shadow, so it follows the surface's
//   own top corners. Nothing is drawn along the sides or the bottom: a sheet
//   and its bottom safe area read as one continuous material, and no surface
//   carries an outline.
//
// `shape` carries the surface's corner radii: the overlay clips itself to that
// outline. Decoration only — no touches, hidden from accessibility, no layout.

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { SheetMaterial } from './sheet-material';
import { gloss } from './theme';

interface SurfaceGlossProps {
  /** Corner radii of the surface this finish belongs to. */
  readonly shape?: StyleProp<ViewStyle>;
  /** `glass` (§40 pilot): the wider, softer sheen of the glass sheet. */
  readonly material?: SheetMaterial;
  readonly testID?: string;
}

export function SurfaceGloss({ shape, material = 'satin', testID = 'surface-gloss' }: SurfaceGlossProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.fill, shape]}
      testID={testID}
    >
      <View style={material === 'glass' ? styles.glassSheen : styles.sheen} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    borderCurve: 'continuous',
    boxShadow: gloss.surface.topLight,
    overflow: 'hidden',
  },
  sheen: {
    experimental_backgroundImage: gloss.surface.sheen,
    height: gloss.surface.sheenHeight,
  },
  glassSheen: {
    experimental_backgroundImage: gloss.glassSheet.sheen,
    height: gloss.glassSheet.sheenHeight,
  },
});
