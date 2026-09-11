import { isIsolatedProductImage } from '../product-image-presentation';

describe('isIsolatedProductImage', () => {
  it('treats the PNG written by background removal as an isolated image', () => {
    expect(
      isIsolatedProductImage('file:///caches/ProductImages/product-ABC.png'),
    ).toBe(true);
    expect(isIsolatedProductImage('file:///library/render.PNG?size=1')).toBe(true);
  });

  it('keeps photographs and missing images as flat presentation', () => {
    expect(isIsolatedProductImage('file:///products/raw.jpg')).toBe(false);
    expect(isIsolatedProductImage('file:///products/raw.jpeg#x')).toBe(false);
    expect(isIsolatedProductImage('file:///products/png-folder/raw.heic')).toBe(false);
    expect(isIsolatedProductImage(undefined)).toBe(false);
    expect(isIsolatedProductImage('')).toBe(false);
  });
});
