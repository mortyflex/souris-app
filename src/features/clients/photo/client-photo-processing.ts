// Souris — Client photo processing
//
// Every Client photo, from the camera or from Photos, goes through the shared
// normalization (shared/lib/photo-normalization.ts) with the portrait
// settings: orientation applied → centered square crop (the avatar frame is
// square; `cover` would crop the same way) → at most 720 × 720 (sharp at
// 96 pt on a 3× screen, ~100 KB) → JPEG, quality 0.8.

import {
  centeredSquareCrop as squareCrop,
  normalizePhoto,
  type PhotoNormalization,
} from '@/shared/lib/photo-normalization';

export const CLIENT_PHOTO_MAX_SIDE = 720;

export const CLIENT_PHOTO_NORMALIZATION: PhotoNormalization = {
  crop: 'square',
  maxSide: CLIENT_PHOTO_MAX_SIDE,
  format: 'jpeg',
  compress: 0.8,
};

/** The centered square of a width × height image, and the side it is scaled to. */
export function centeredSquareCrop(width: number, height: number, maxSide = CLIENT_PHOTO_MAX_SIDE) {
  return squareCrop(width, height, maxSide);
}

export function prepareClientPhoto(sourceUri: string): Promise<string> {
  return normalizePhoto(sourceUri, CLIENT_PHOTO_NORMALIZATION);
}
