import { createMemoryLocalFiles } from '@/persistence/testing/memory-local-files';

import {
  discardProductImageIfOwned,
  getProductImagesDirectoryUri,
  isSourisProductImage,
  prepareProductImageCommit,
} from '../product-image-storage';

const CAMERA_CAPTURE = 'file:///app/Caches/Camera/capture-1.jpg';
const VISION_OUTPUT = 'file:///app/Caches/ProductImages/isolated-1.png';
const EXTERNAL_ASSET = 'file:///shared/Photos/IMG_0001.heic';
const OWNED_PREFIX = 'file:///app/Documents/products/';

function createFiles() {
  const files = createMemoryLocalFiles();
  files.addFile(CAMERA_CAPTURE, 'camera');
  files.addFile(VISION_OUTPUT, 'vision');
  files.addFile(EXTERNAL_ASSET, 'external');
  return files;
}

describe('product image storage', () => {
  it('promotes a draft capture into the owned products directory and cleans the temporary source on finalize', async () => {
    const files = createFiles();

    const commit = await prepareProductImageCommit(files, {
      productId: 'product-1',
      nextImageUri: CAMERA_CAPTURE,
      now: new Date(1_700_000_000_000),
    });

    expect(commit.imageUri).toMatch(/^file:\/\/\/app\/Documents\/products\/product-1-1700000000000-\d+\.jpg$/);
    expect(isSourisProductImage(files, commit.imageUri)).toBe(true);
    expect(files.readFile(commit.imageUri!)).toBe('camera');
    expect(files.exists(CAMERA_CAPTURE)).toBe(true);

    commit.finalize();
    expect(files.exists(CAMERA_CAPTURE)).toBe(false);
    expect(files.exists(commit.imageUri!)).toBe(true);
  });

  it('rollback removes the promoted file and keeps the draft source', async () => {
    const files = createFiles();
    const commit = await prepareProductImageCommit(files, {
      productId: 'product-1',
      nextImageUri: VISION_OUTPUT,
    });

    commit.rollback();

    expect(files.exists(commit.imageUri!)).toBe(false);
    expect(files.exists(VISION_OUTPUT)).toBe(true);
  });

  it('is a no-op when the image is unchanged', async () => {
    const files = createFiles();
    const first = await prepareProductImageCommit(files, { productId: 'p', nextImageUri: CAMERA_CAPTURE });
    first.finalize();
    const before = files.listFiles();

    const unchanged = await prepareProductImageCommit(files, {
      productId: 'p',
      previousImageUri: first.imageUri,
      nextImageUri: first.imageUri,
    });
    unchanged.finalize();

    expect(unchanged.imageUri).toBe(first.imageUri);
    expect(files.listFiles()).toEqual(before);
  });

  it('replacing an owned image deletes the old file only after finalize', async () => {
    const files = createFiles();
    const first = await prepareProductImageCommit(files, { productId: 'p', nextImageUri: CAMERA_CAPTURE });
    first.finalize();

    const replacement = await prepareProductImageCommit(files, {
      productId: 'p',
      previousImageUri: first.imageUri,
      nextImageUri: VISION_OUTPUT,
    });
    expect(files.exists(first.imageUri!)).toBe(true);
    expect(replacement.imageUri).not.toBe(first.imageUri);
    expect(replacement.imageUri?.endsWith('.png')).toBe(true);

    replacement.finalize();
    expect(files.exists(first.imageUri!)).toBe(false);
    expect(files.exists(replacement.imageUri!)).toBe(true);
    expect(files.listFiles().filter((uri) => uri.startsWith(OWNED_PREFIX))).toEqual([replacement.imageUri]);
  });

  it('removing an image clears the reference and deletes the owned file on finalize', async () => {
    const files = createFiles();
    const first = await prepareProductImageCommit(files, { productId: 'p', nextImageUri: CAMERA_CAPTURE });
    first.finalize();

    const removal = await prepareProductImageCommit(files, {
      productId: 'p',
      previousImageUri: first.imageUri,
      nextImageUri: undefined,
    });
    expect(removal.imageUri).toBeUndefined();
    expect(files.exists(first.imageUri!)).toBe(true);

    removal.finalize();
    expect(files.exists(first.imageUri!)).toBe(false);
  });

  it('copies an external asset but never deletes it', async () => {
    const files = createFiles();
    const commit = await prepareProductImageCommit(files, { productId: 'p', nextImageUri: EXTERNAL_ASSET });
    commit.finalize();
    expect(commit.imageUri?.endsWith('.heic')).toBe(true);
    expect(files.exists(EXTERNAL_ASSET)).toBe(true);

    const removal = await prepareProductImageCommit(files, {
      productId: 'p',
      previousImageUri: EXTERNAL_ASSET,
      nextImageUri: undefined,
    });
    removal.finalize();
    discardProductImageIfOwned(files, EXTERNAL_ASSET);
    expect(files.exists(EXTERNAL_ASSET)).toBe(true);
  });

  it('discards only Souris-owned images on Product deletion', async () => {
    const files = createFiles();
    const commit = await prepareProductImageCommit(files, { productId: 'p', nextImageUri: CAMERA_CAPTURE });
    commit.finalize();

    discardProductImageIfOwned(files, commit.imageUri);
    discardProductImageIfOwned(files, undefined);

    expect(files.exists(commit.imageUri!)).toBe(false);
    expect(getProductImagesDirectoryUri(files)).toBe(OWNED_PREFIX);
  });
});
