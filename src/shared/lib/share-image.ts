// Souris — share or save a rendered view as an image
//
// Captures ONE mounted view (`react-native-view-shot`) into a temporary PNG,
// then either:
//   - hands it to the native share sheet (`expo-sharing`): Messages,
//     WhatsApp, Instagram… are the platform's own targets, Souris integrates
//     none of them. The sheet reports no outcome, so nothing is inferred
//     from it;
//   - or saves it to the Photos library (`expo-media-library`), after asking
//     for the minimum permission: add-only on iOS, images only on Android.
//     Only this path knows, and can say, that the image was saved.
//
// The captured view is expected to be an `ImageExportFrame`, whose size in
// pixels is the export size: the output never depends on where, or whether,
// the view is visible on screen. iOS renders the layer tree directly
// (`useRenderInContext`), which does not need the view to be on screen.
//
// The temporary file lives only for the share or the save: it is released
// as soon as either is over, whatever the outcome.

import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';

export interface ImagePixelSize {
  readonly width: number;
  readonly height: number;
}

/** The person declined (or restricted) adding photos: nothing was captured or saved. */
export class PhotosPermissionError extends Error {
  constructor() {
    super('Adding to the Photos library is not allowed.');
    this.name = 'PhotosPermissionError';
  }
}

/** Captures the view into a temporary PNG, lends its file URL to `handOver`, then releases it. */
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
    // already renders the frame at exactly that many pixels.
    ...(Platform.OS === 'android' ? { width: size.width, height: size.height } : {}),
    useRenderInContext: Platform.OS === 'ios',
  });
  try {
    // iOS answers with a bare temporary path; share sheet and Photos take a file URL.
    await handOver(uri.startsWith('/') ? `file://${uri}` : uri);
  } finally {
    releaseCapture(uri);
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
