// BeautIzzy — the authoritative Product photo
//
// A Product has ONE photo for the whole Business, identified by the Product
// id (never a barcode, a SKU or a name). Its bytes live in the Business media
// storage (persistence/media/business-media.ts, shared with Client photos);
// the Product carries only the STABLE object path:
//
//   <business_id>/products/<product_id>/<photo_id>.<jpg|png>
//
// (`png` for a transparent cut-out, so it keeps its sticker presentation.)
// Each device keeps a cached copy under <documents>/product-photos/ — never
// authoritative: the path is.
//
// Display precedence — deterministic, and the ONLY place it is decided:
//
//   photoPath set    → the shared photo (its cached/downloaded file), or the
//                      no-photo placeholder while it cannot be had. A legacy
//                      local image NEVER overrides it.
//   no photoPath     → the legacy device-local `imageUri`, if this device has
//                      one (display-only, never synced, never uploaded)
//   neither          → the no-photo placeholder

import type { Product } from '@/domain/products';

export const PRODUCT_PHOTO_CACHE_DIRECTORY = 'product-photos/';

export type ProductPhotoFormat = 'jpg' | 'png';

export function createProductPhotoPath(
  businessId: string,
  productId: string,
  photoId: string,
  format: ProductPhotoFormat,
): string {
  return `${businessId}/products/${productId}/${photoId}.${format}`;
}

/** Which image a Product shows on this device (see the precedence above). */
export function selectProductImageUri(
  product: Pick<Product, 'photoPath' | 'imageUri'> | undefined,
  sharedPhotoUri: string | undefined,
): string | undefined {
  if (!product) return undefined;
  if (product.photoPath !== undefined) return sharedPhotoUri;
  return product.imageUri;
}

/** Raised when a new Product photo could not be prepared or stored; the Product is unchanged. */
export class ProductPhotoSaveError extends Error {
  constructor() {
    super('The Product photo could not be saved');
    this.name = 'ProductPhotoSaveError';
  }
}
