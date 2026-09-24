// Souris — photo normalization (Client photos, Product photos)
//
// ONE pipeline for every photo Souris stores, configured per use:
//
//   decode with its orientation applied (the pixels end up upright, so no
//   EXIF rotation is needed anywhere downstream)
//   → optional centered square crop (Client portraits)
//   → at most `maxSide` on the longest side (never upscaled)
//   → JPEG (with `compress`) or PNG (a transparent Product cut-out keeps its
//     alpha), written to the cache directory
//
// It returns a temporary local file; the Business media storage decides what
// becomes durable. It throws when the image cannot be decoded — callers then
// keep the record exactly as it was.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface PhotoNormalization {
  readonly crop: 'square' | 'none';
  readonly maxSide: number;
  readonly format: 'jpeg' | 'png';
  /** JPEG quality 0–1 (ignored for PNG). */
  readonly compress: number;
}

export interface SquareCrop {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

/** The centered square of a width × height image, and the side it is scaled to. */
export function centeredSquareCrop(
  width: number,
  height: number,
  maxSide: number,
): { readonly crop: SquareCrop; readonly side: number } {
  const square = Math.floor(Math.min(width, height));
  return {
    crop: {
      originX: Math.floor((width - square) / 2),
      originY: Math.floor((height - square) / 2),
      width: square,
      height: square,
    },
    side: Math.min(square, maxSide),
  };
}

/** The size of a width × height image scaled to fit `maxSide`, or undefined when it already fits. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { readonly width: number; readonly height: number } | undefined {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return undefined;
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function normalizePhoto(
  sourceUri: string,
  options: PhotoNormalization,
): Promise<string> {
  const upright = await ImageManipulator.manipulate(sourceUri).renderAsync();
  try {
    if (upright.width <= 0 || upright.height <= 0) throw new Error('normalizePhoto: empty image');
    let context = ImageManipulator.manipulate(upright);
    if (options.crop === 'square') {
      const { crop, side } = centeredSquareCrop(upright.width, upright.height, options.maxSide);
      context = context.crop(crop).resize({ width: side, height: side });
    } else {
      const size = fitWithin(upright.width, upright.height, options.maxSide);
      if (size) context = context.resize(size);
    }
    const output = await context.renderAsync();
    try {
      const saved = await output.saveAsync(
        options.format === 'png'
          ? { format: SaveFormat.PNG }
          : { compress: options.compress, format: SaveFormat.JPEG },
      );
      return saved.uri;
    } finally {
      output.release();
    }
  } finally {
    upright.release();
  }
}
