// Souris — Product photo processing
//
// Every new Product photo goes through the shared normalization
// (shared/lib/photo-normalization.ts). Products are NOT cropped: the
// catalogue frames them with `contain` (a bottle keeps its whole silhouette),
// so only the size is bounded:
//
//   orientation applied → at most 1080 px on the longest side, aspect kept
//   → a transparent cut-out (the Vision PNG) stays PNG, keeping its alpha and
//     its sticker presentation; every other photo becomes JPEG, quality 0.85

import { normalizePhoto } from '@/shared/lib/photo-normalization';

import { isIsolatedProductImage } from './product-image-presentation';
import type { ProductPhotoFormat } from './product-photo-storage';

export const PRODUCT_PHOTO_MAX_SIDE = 1080;
const PRODUCT_PHOTO_QUALITY = 0.85;

export interface PreparedProductPhoto {
  readonly uri: string;
  readonly format: ProductPhotoFormat;
}

export async function prepareProductPhoto(sourceUri: string): Promise<PreparedProductPhoto> {
  const cutout = isIsolatedProductImage(sourceUri);
  const uri = await normalizePhoto(sourceUri, {
    crop: 'none',
    maxSide: PRODUCT_PHOTO_MAX_SIDE,
    format: cutout ? 'png' : 'jpeg',
    compress: PRODUCT_PHOTO_QUALITY,
  });
  return { uri, format: cutout ? 'png' : 'jpg' };
}
