// Souris — ShareHighlightPanel
//
// The highlighted panel of the Souris share images: a soft lavender surface
// (lav050), large continuous corners, no border, no gradient, content
// centred. « Tops & tendances » frames « Encaissé sur la période » in it;
// « Estimation tarifaire » frames « Total estimé ». Only the container is
// shared — each image lays out its own content inside.

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { lavender, radii, spacing } from './theme';

interface ShareHighlightPanelProps
  extends Pick<ViewProps, 'accessible' | 'accessibilityLabel' | 'testID'> {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

export function ShareHighlightPanel({ children, style, ...props }: ShareHighlightPanelProps) {
  return (
    <View {...props} style={[styles.panel, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    backgroundColor: lavender.lav050,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
});
