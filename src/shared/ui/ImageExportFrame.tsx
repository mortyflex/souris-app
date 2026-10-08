// BeautIzzy — ImageExportFrame
//
// The surface an exported image is captured from (`shareViewAsImage`,
// `saveViewToPhotos`). Its content is laid out ONCE, at a fixed logical size
// (`layoutSize`), and the frame IS that size: no transform, and nothing read
// from the device — not the screen size, not the pixel density, not the text
// size setting. The composition is therefore the same on every phone.
//
// The frame knows nothing about pixels. The capture turns it into an image of
// the export size (`shared/lib/share-image`): it must never depend on a
// `transform` here, because the iOS layer capture renders the layout box of
// the frame's content and drops a scale set on it — the image then came out
// with the content at its unscaled size in the top-left corner on every
// screen whose density is not the export scale.
//
// The frame is meant to be mounted off screen, and is hidden from assistive
// technology: it is a bitmap source, not UI.

import type { ReactNode, Ref } from 'react';
import { StyleSheet, View } from 'react-native';

interface ImageExportFrameProps {
  /** Logical size the content is laid out at, and the size of the frame (dp). */
  readonly layoutSize: { readonly width: number; readonly height: number };
  /** Painted under the content across the whole image: no pixel is ever transparent. */
  readonly backgroundColor: string;
  readonly ref?: Ref<View>;
  readonly children: ReactNode;
  readonly testID?: string;
}

export function ImageExportFrame({
  layoutSize,
  backgroundColor,
  ref,
  children,
  testID,
}: ImageExportFrameProps) {
  return (
    <View
      accessibilityElementsHidden
      collapsable={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      ref={ref}
      style={[styles.frame, { backgroundColor, height: layoutSize.height, width: layoutSize.width }]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
