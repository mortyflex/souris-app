// Souris — durable Product image storage
//
// A draft image (camera capture, library copy, Vision output) lives in a
// temporary location. It becomes canonical ONLY when the Product is saved:
//
//   draft URI ──(save)──> copy under <documents>/products/ ──> durable URI
//
// The commit is two-phase so the catalog boundary can persist the durable
// URI first and only then clean up:
//
//   prepare  → the new file exists, nothing else changed
//   rollback → the new file is removed (database write failed)
//   finalize → the replaced Souris-owned image and the temporary source are
//              removed (database write succeeded)
//
// Only files Souris owns (under its own products directory) or temporary
// cache artifacts are ever deleted. External photo-library assets are never
// touched.

import { isInsideDirectory, type LocalFiles } from '@/persistence/files/local-files';

export const PRODUCT_IMAGES_DIRECTORY = 'products/';

export function getProductImagesDirectoryUri(files: LocalFiles): string {
  return `${files.documentDirectoryUri}${PRODUCT_IMAGES_DIRECTORY}`;
}

/** True when the URI points inside the Souris-owned Product images directory. */
export function isSourisProductImage(files: LocalFiles, uri: string | undefined): boolean {
  return uri !== undefined && isInsideDirectory(uri, getProductImagesDirectoryUri(files));
}

function isTemporaryArtifact(files: LocalFiles, uri: string): boolean {
  return isInsideDirectory(uri, files.cacheDirectoryUri);
}

function imageExtension(uri: string): string {
  const fileName = uri.split('?')[0]?.split('#')[0]?.split('/').pop() ?? '';
  const dot = fileName.lastIndexOf('.');
  const extension = dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(extension) ? extension : 'jpg';
}

let imageSequence = 0;

function createDurableImageUri(files: LocalFiles, productId: string, sourceUri: string, now: Date) {
  imageSequence += 1;
  const safeId = productId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `${getProductImagesDirectoryUri(files)}${safeId}-${now.getTime()}-${imageSequence}.${imageExtension(sourceUri)}`;
}

export interface ProductImageCommit {
  /** The URI to persist on the Product: durable, or undefined when removed. */
  readonly imageUri: string | undefined;
  /** Undoes `prepare` after a failed database write. */
  readonly rollback: () => void;
  /** Cleans up after a successful database write. Never throws. */
  readonly finalize: () => void;
}

export interface ProductImageCommitInput {
  readonly productId: string;
  /** The canonical image before this save (undefined for a new Product). */
  readonly previousImageUri?: string;
  /** The draft image at save time (undefined when the photo was removed). */
  readonly nextImageUri?: string;
  readonly now?: Date;
}

function safely(task: () => void): void {
  try {
    task();
  } catch {
    // Cleanup is best effort: a leftover file must never fail a committed save.
  }
}

/**
 * Promotes the draft image into durable app storage when needed and returns
 * the two-phase commit handle. An unchanged image is a no-op commit.
 */
export async function prepareProductImageCommit(
  files: LocalFiles,
  input: ProductImageCommitInput,
): Promise<ProductImageCommit> {
  const { productId, previousImageUri, nextImageUri, now = new Date() } = input;
  const noop = () => {};

  const releasePrevious = () => {
    if (
      previousImageUri !== undefined &&
      previousImageUri !== nextImageUri &&
      isSourisProductImage(files, previousImageUri)
    ) {
      safely(() => files.delete(previousImageUri));
    }
  };

  if (nextImageUri === undefined || nextImageUri === previousImageUri) {
    return { imageUri: nextImageUri, rollback: noop, finalize: releasePrevious };
  }

  if (isSourisProductImage(files, nextImageUri)) {
    return { imageUri: nextImageUri, rollback: noop, finalize: releasePrevious };
  }

  files.ensureDirectory(getProductImagesDirectoryUri(files));
  const durableUri = createDurableImageUri(files, productId, nextImageUri, now);
  await files.copy(nextImageUri, durableUri);

  return {
    imageUri: durableUri,
    rollback: () => safely(() => files.delete(durableUri)),
    finalize: () => {
      releasePrevious();
      if (isTemporaryArtifact(files, nextImageUri)) {
        safely(() => files.delete(nextImageUri));
      }
    },
  };
}

/** Deletes the Product image when Souris owns it (Product deletion). Never throws. */
export function discardProductImageIfOwned(files: LocalFiles, imageUri: string | undefined): void {
  if (isSourisProductImage(files, imageUri) && imageUri !== undefined) {
    safely(() => files.delete(imageUri));
  }
}
