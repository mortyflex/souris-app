// Souris — the image a Product shows on this device
//
// Resolves the authoritative `photoPath` through the shared Business media
// cache and applies the ONE display precedence of product-photo-storage.ts:
// shared photo first, legacy local image only when there is no shared photo.

import type { Product } from '@/domain/products';
import { useBusinessMediaUri } from '@/providers/BusinessMediaProvider';

import { PRODUCT_PHOTO_CACHE_DIRECTORY, selectProductImageUri } from './product-photo-storage';

export function useProductImageUri(
  product: Pick<Product, 'photoPath' | 'imageUri'> | undefined,
): string | undefined {
  const sharedPhotoUri = useBusinessMediaUri(product?.photoPath, PRODUCT_PHOTO_CACHE_DIRECTORY);
  return selectProductImageUri(product, sharedPhotoUri);
}
