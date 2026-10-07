// BeautIzzy — LEGACY device-local Product images
//
// Builds before shared Product photos copied a Product image into
// <documents>/products/ and stored that device path in `products.image_uri`.
// Those files are never synced and never uploaded: two devices could hold two
// different images for the same Product, and promoting either one would be an
// arbitrary race. They now only survive as a display-only fallback on the
// device that holds them, while the Product has no shared `photoPath`
// (product-photo-storage.ts).
//
// Nothing writes a new legacy image any more. What remains is recognizing a
// BeautIzzy-owned legacy file and deleting it, best effort, once it is obsolete:
// the Product received a shared photo from this device, its photo was
// removed, or the Product was deleted. External photo-library assets are
// never touched, and a failed deletion never affects the Product.

import { isInsideDirectory, type LocalFiles } from '@/persistence/files/local-files';

export const PRODUCT_IMAGES_DIRECTORY = 'products/';

export function getProductImagesDirectoryUri(files: LocalFiles): string {
  return `${files.documentDirectoryUri}${PRODUCT_IMAGES_DIRECTORY}`;
}

/** True when the URI points inside the BeautIzzy-owned legacy Product images directory. */
export function isSourisProductImage(files: LocalFiles, uri: string | undefined): boolean {
  return uri !== undefined && isInsideDirectory(uri, getProductImagesDirectoryUri(files));
}

/** Deletes a legacy Product image when BeautIzzy owns it. Best effort: never throws. */
export function discardProductImageIfOwned(files: LocalFiles, imageUri: string | undefined): void {
  if (imageUri === undefined || !isSourisProductImage(files, imageUri)) return;
  try {
    files.delete(imageUri);
  } catch {
    // A leftover legacy file never affects the Product.
  }
}
