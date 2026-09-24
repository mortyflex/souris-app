// Souris — ShareCardCanvas
//
// THE canvas of the Souris share images (DESIGN_OVERRIDES.md §35): what an
// `ImageExportFrame` captures for « Enregistrer l’image » and « Partager ».
// Flat warm receipt paper FULL-BLEED across the whole image — never a rounded
// card floating on another ground — laid out at 360 dp wide, with the
// share-card margins (52 pt top, 48 pt bottom, 24 pt sides) that keep text
// clear of the areas social apps cover or crop, exported at 3× (1080 px wide).
//
//   fixed     exactly 360 × 640 dp → 1080 × 1920 px, a 9:16 story
//             (« Tops & tendances »)
//   growable  at least 360 × 640 dp — the same 9:16 story for an ordinary
//             content — and taller only when the content needs it, never cut
//             (« Estimation tarifaire »)
//
// Only the canvas is shared: each image lays out its own content inside.

import type { ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { receiptPaper, spacing } from './theme';

/** Logical layout of a share image (dp): a 9:16 story. */
export const SHARE_CARD_SIZE = { width: 360, height: 640 } as const;
/** Exported pixels per laid-out point: 1080 × 1920 px for the 9:16 story. */
export const SHARE_IMAGE_SCALE = 3;
/** The full-bleed ground of the whole image, painted by the canvas and under it. */
export const SHARE_CARD_BACKGROUND = receiptPaper.surface;

/** The exported pixel size of a canvas laid out `height` dp tall. */
export function getShareImagePixelSize(height: number): { width: number; height: number } {
  return {
    width: SHARE_CARD_SIZE.width * SHARE_IMAGE_SCALE,
    height: Math.ceil(height) * SHARE_IMAGE_SCALE,
  };
}

interface ShareCardCanvasProps {
  readonly children: ReactNode;
  /** `fixed` (default): exactly the 9:16 story. `growable`: at least that, taller if needed. */
  readonly height?: 'fixed' | 'growable';
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly testID?: string;
}

export function ShareCardCanvas({ children, height = 'fixed', onLayout, testID }: ShareCardCanvasProps) {
  return (
    <View
      onLayout={onLayout}
      style={[styles.canvas, height === 'fixed' ? styles.fixed : styles.growable]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: SHARE_CARD_BACKGROUND,
    paddingBottom: spacing['3xl'] + spacing.base,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'] + spacing.lg,
    width: SHARE_CARD_SIZE.width,
  },
  fixed: { height: SHARE_CARD_SIZE.height },
  growable: { minHeight: SHARE_CARD_SIZE.height },
});
