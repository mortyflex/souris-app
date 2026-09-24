import { createMemoryLocalFiles } from '@/persistence/testing/memory-local-files';

import {
  discardProductImageIfOwned,
  getProductImagesDirectoryUri,
  isSourisProductImage,
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

describe('legacy device-local product images', () => {
  it('discards only Souris-owned legacy images', () => {
    const files = createFiles();
    const owned = `${OWNED_PREFIX}p-1700000000000-1.jpg`;
    files.addFile(owned, 'legacy');

    expect(isSourisProductImage(files, owned)).toBe(true);
    expect(isSourisProductImage(files, EXTERNAL_ASSET)).toBe(false);
    discardProductImageIfOwned(files, owned);
    discardProductImageIfOwned(files, EXTERNAL_ASSET);
    discardProductImageIfOwned(files, VISION_OUTPUT);
    discardProductImageIfOwned(files, undefined);

    expect(files.exists(owned)).toBe(false);
    expect(files.exists(EXTERNAL_ASSET)).toBe(true);
    expect(files.exists(VISION_OUTPUT)).toBe(true);
    expect(getProductImagesDirectoryUri(files)).toBe(OWNED_PREFIX);
  });

  it('never throws when a legacy file cannot be deleted', () => {
    const files = createFiles();
    const owned = `${OWNED_PREFIX}product-1-1.jpg`;
    files.addFile(owned);
    files.delete = () => {
      throw new Error('file system unavailable');
    };

    expect(() => discardProductImageIfOwned(files, owned)).not.toThrow();
  });
});
