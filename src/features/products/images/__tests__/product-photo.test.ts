// Souris — the authoritative Product photo: path, display precedence, processing settings

import { prepareProductPhoto, PRODUCT_PHOTO_MAX_SIDE } from '../product-photo-processing';
import { createProductPhotoPath, selectProductImageUri } from '../product-photo-storage';

const mockNormalize = jest.fn((_uri: string, _options: object) => Promise.resolve('file:///app/Caches/out'));

jest.mock('@/shared/lib/photo-normalization', () => ({
  normalizePhoto: (uri: string, options: object) => mockNormalize(uri, options),
}));

const LEGACY = 'file:///app/Documents/products/p-1700000000000-1.jpg';
const SHARED_CACHE = 'file:///app/Documents/product-photos/biz_products_p_c.jpg';

describe('Product photo path', () => {
  it('is scoped by Business and identified by the Product id — never a barcode or a name', () => {
    expect(createProductPhotoPath('biz', 'product-7', 'photo-1', 'jpg')).toBe('biz/products/product-7/photo-1.jpg');
    expect(createProductPhotoPath('biz', 'product-7', 'photo-2', 'png')).toBe('biz/products/product-7/photo-2.png');
  });
});

describe('Product display precedence', () => {
  it('a shared photo is authoritative: shown once resolved, and a legacy image never overrides it', () => {
    const product = { photoPath: 'biz/products/p/c.jpg', imageUri: LEGACY };
    expect(selectProductImageUri(product, SHARED_CACHE)).toBe(SHARED_CACHE);
    // Not downloaded yet / offline and never cached: the placeholder, NOT the legacy image.
    expect(selectProductImageUri(product, undefined)).toBeUndefined();
  });

  it('without a shared photo, the legacy local image is a display-only fallback', () => {
    expect(selectProductImageUri({ imageUri: LEGACY }, undefined)).toBe(LEGACY);
  });

  it('neither → the no-photo placeholder', () => {
    expect(selectProductImageUri({}, undefined)).toBeUndefined();
    expect(selectProductImageUri(undefined, undefined)).toBeUndefined();
  });
});

describe('Product photo processing', () => {
  beforeEach(() => mockNormalize.mockClear());

  it('bounds a plain photo without cropping it, as JPEG', async () => {
    await expect(prepareProductPhoto('file:///app/Caches/Camera/c.jpg')).resolves.toEqual({
      uri: 'file:///app/Caches/out',
      format: 'jpg',
    });
    expect(mockNormalize).toHaveBeenCalledWith('file:///app/Caches/Camera/c.jpg', {
      crop: 'none',
      maxSide: PRODUCT_PHOTO_MAX_SIDE,
      format: 'jpeg',
      compress: 0.85,
    });
    expect(PRODUCT_PHOTO_MAX_SIDE).toBe(1080);
  });

  it('keeps a transparent cut-out as PNG', async () => {
    await expect(prepareProductPhoto('file:///app/Caches/ProductImages/i.png')).resolves.toMatchObject({ format: 'png' });
    expect(mockNormalize).toHaveBeenCalledWith(
      'file:///app/Caches/ProductImages/i.png',
      expect.objectContaining({ crop: 'none', format: 'png' }),
    );
  });
});
