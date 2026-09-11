// Souris — Product image presentation heuristics
//
// Pure helpers used by Product image components. The Product domain only
// knows an optional `imageUri`; whether that image carries transparency is a
// presentation concern derived from the file itself.

/**
 * An isolated (background-removed) Product image is always written as PNG by
 * the optional Vision module; camera captures and most library photos are
 * JPEG. A PNG is therefore presented as a cut-out "sticker"; anything else
 * keeps the flat photo presentation.
 */
export function isIsolatedProductImage(imageUri: string | undefined): boolean {
  if (!imageUri) return false;
  const path = imageUri.split(/[?#]/, 1)[0] ?? '';
  return /\.png$/i.test(path.trim());
}
