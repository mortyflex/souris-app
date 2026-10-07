// BeautIzzy — GlassSurface
//
// The ONE light-glass material of the small floating controls — the back
// button and Agenda previous / next (GlassIconButton), the floating + and the
// Jour / Semaine capsule (docs/design/DESIGN_OVERRIDES.md §21). Rendered FIRST
// inside the control, under its glyph or labels:
//
// - an almost-white, barely see-through fill (`gloss.glass.fill`);
// - a hairline navy-alpha contour that follows the control's own outline;
// - a soft reflection from the top edge and a moulded rim (`sheen`, `rim`).
//
// It evokes the system Liquid Glass of the tab bar without a blur view or a
// version-gated native API, so it looks the same on every supported iOS
// version and stays a clean light surface on Android. The control keeps its
// own depth (`nativeShadows.glass` / `glassFloating`) outside this clip.
//
// `shape` carries the control's corner radius: the layer clips itself to that
// outline. Decoration only — no touches, hidden from accessibility, no layout.

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { gloss } from './theme';

interface GlassSurfaceProps {
  /** Corner radius of the control this material belongs to. */
  readonly shape: StyleProp<ViewStyle>;
  /** Denser fill for a control that floats over scrolling content. */
  readonly floating?: boolean;
  readonly testID?: string;
}

export function GlassSurface({ shape, floating = false, testID = 'glass-surface' }: GlassSurfaceProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.fill, floating && styles.floatingFill, shape]}
      testID={testID}
    >
      <View style={styles.sheen} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: gloss.glass.fill,
    borderColor: gloss.glass.border,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: gloss.glass.rim,
    overflow: 'hidden',
  },
  floatingFill: { backgroundColor: gloss.glass.fillFloating },
  sheen: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: gloss.glass.sheen,
  },
});
