// BeautIzzy — give an image file an exact pixel size
//
// A captured view comes out at the pixel density of the screen it was
// captured on: the same 360 dp frame is 720 px wide on a 2× phone and
// 1080 px wide on a 3× one. An exported image has ONE size whatever the
// phone, so the capture is measured and, only when it differs, resampled to
// that size (`expo-image-manipulator`). Nothing here reads the device: the
// decision comes from the pixels of the file itself.
//
// The frame and the export size share one aspect ratio, so resampling never
// distorts or crops: it only changes the resolution.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface ImagePixelSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Resolves with a NEW temporary PNG of exactly `size`, or with `undefined`
 * when the image already measures it (the file is then left untouched).
 */
export async function fitImageToPixelSize(
  fileUrl: string,
  size: ImagePixelSize,
): Promise<string | undefined> {
  const image = await ImageManipulator.manipulate(fileUrl).renderAsync();
  try {
    if (image.width === size.width && image.height === size.height) return undefined;
    const fitted = await ImageManipulator.manipulate(image)
      .resize({ width: size.width, height: size.height })
      .renderAsync();
    try {
      return (await fitted.saveAsync({ format: SaveFormat.PNG })).uri;
    } finally {
      fitted.release();
    }
  } finally {
    image.release();
  }
}
