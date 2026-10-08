// BeautIzzy — share or save a rendered view as an image
//
// Captures ONE mounted view (`react-native-view-shot`) into a temporary PNG,
// then either:
//   - hands it to the native share sheet (`expo-sharing`): Messages,
//     WhatsApp, Instagram… are the platform's own targets, BeautIzzy integrates
//     none of them. The sheet reports no outcome, so nothing is inferred
//     from it;
//   - or saves it to the Photos library (`expo-media-library`), after asking
//     for the minimum permission: add-only on iOS, images only on Android.
//     Only this path knows, and can say, that the image was saved.
//
// The captured view is expected to be an `ImageExportFrame`: laid out at a
// fixed logical size, the same on every phone. The capture comes out at the
// pixel density of the screen, so it is then given the export size exactly
// (`fitImageToPixelSize`): the image has the same pixels and the same
// composition on a 2× and on a 3× phone. The output never depends on where,
// or whether, the view is visible on screen: iOS renders the layer tree
// directly (`useRenderInContext`), which does not need it to be.
//
// The temporary files live only for the share or the save: they are released
// as soon as either is over, whatever the outcome.

import { File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import { fitImageToPixelSize, type ImagePixelSize } from './image-pixel-size';

export type { ImagePixelSize };

/** The person declined (or restricted) adding photos: nothing was captured or saved. */
export class PhotosPermissionError extends Error {
  constructor() {
    super('Adding to the Photos library is not allowed.');
    this.name = 'PhotosPermissionError';
  }
}

/** Captures the view into a temporary PNG of exactly `size`, lends its file URL to `handOver`, then releases it. */
async function withCapturedImage(
  view: RefObject<View | null>,
  size: ImagePixelSize,
  handOver: (fileUrl: string) => Promise<void>,
): Promise<void> {
  if (!view.current) throw new Error('Nothing to capture.');
  const uri = await captureRef(view, {
    format: 'png',
    result: 'tmpfile',
    // Android sizes the bitmap in pixels: pin it to the export size. iOS
    // renders the frame at the density of the screen.
    ...(Platform.OS === 'android' ? { width: size.width, height: size.height } : {}),
    useRenderInContext: Platform.OS === 'ios',
  });
  let fitted: string | undefined;
  try {
    // iOS answers with a bare temporary path; share sheet and Photos take a file URL.
    const captured = uri.startsWith('/') ? `file://${uri}` : uri;
    fitted = await fitImageToPixelSize(captured, size);
    await handOver(fitted ?? captured);
  } finally {
    releaseCapture(uri);
    if (fitted !== undefined) discard(fitted);
  }
}

/** Best effort: a temporary file that cannot be removed is left to the system cache. */
function discard(fileUrl: string): void {
  try {
    new File(fileUrl).delete();
  } catch {
    // Nothing to do: the cache directory is purged by the system.
  }
}

export async function shareViewAsImage(
  view: RefObject<View | null>,
  size: ImagePixelSize,
  dialogTitle: string,
): Promise<void> {
  if (!view.current) throw new Error('Nothing to capture.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available.');
  await withCapturedImage(view, size, (fileUrl) =>
    Sharing.shareAsync(fileUrl, { dialogTitle, mimeType: 'image/png', UTI: 'public.png' }),
  );
}

/** Resolves only once the image IS in the Photos library. */
export async function saveViewToPhotos(view: RefObject<View | null>, size: ImagePixelSize): Promise<void> {
  if (!view.current) throw new Error('Nothing to capture.');
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) throw new PhotosPermissionError();
  await withCapturedImage(view, size, async (fileUrl) => {
    await MediaLibrary.Asset.create(fileUrl);
  });
}
