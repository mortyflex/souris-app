// Souris — ImageExportFrame
//
// The surface an exported image is captured from (`shareViewAsImage`). Its
// content is laid out ONCE, at a fixed logical size (`layoutSize`), then
// scaled so the frame measures exactly `pixelSize` device pixels. The image
// is therefore the same composition, at the same resolution, on every phone:
// it never depends on the screen size, the pixel density or the text size
// setting of the device.
//
// The frame is meant to be mounted off screen, and is hidden from assistive
// technology: it is a bitmap source, not UI.

import type { ReactNode, Ref } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';

interface ImageExportFrameProps {
  /** Logical size the content is laid out at (dp). */
  readonly layoutSize: { readonly width: number; readonly height: number };
  /** Size of the exported image (px). Same aspect ratio as `layoutSize`. */
  readonly pixelSize: { readonly width: number; readonly height: number };
  /** Painted under the content across the whole image: no pixel is ever transparent. */
  readonly backgroundColor: string;
  readonly ref?: Ref<View>;
  readonly children: ReactNode;
  readonly testID?: string;
}

export function ImageExportFrame({
  layoutSize,
  pixelSize,
  backgroundColor,
  ref,
  children,
  testID,
}: ImageExportFrameProps) {
  const ratio = PixelRatio.get();
  const width = pixelSize.width / ratio;
  const height = pixelSize.height / ratio;
  const scale = width / layoutSize.width;

  return (
    <View
      accessibilityElementsHidden
      collapsable={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      ref={ref}
      style={[styles.frame, { backgroundColor, height, width }]}
      testID={testID}
    >
      <View
        style={{
          height: layoutSize.height,
          transform: [{ scale }],
          transformOrigin: 'top left',
          width: layoutSize.width,
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
