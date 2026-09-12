// Souris — Initial (development) Product catalog
//
// The strictly-mapped legacy pilot products, reached only by the development
// seed — a fresh production install starts empty. Legacy files are one-way import
// sources; runtime features receive canonical Product values only.

import type { Product } from '@/domain/products';
import { DEVELOPMENT_BUSINESS_ID } from '@/features/services/data/initial-services';

import { mapLegacyProducts } from '../adapters/legacy-products-adapter';
import { products_list } from './legacy-products';

/** Builds a fresh, deterministic normalization result from the legacy file. */
export function createInitialProductImport(businessId: string = DEVELOPMENT_BUSINESS_ID) {
  return mapLegacyProducts(products_list, businessId);
}

/** Builds the canonical development catalog, stamped with `businessId`. */
export function createInitialProductCatalog(
  businessId: string = DEVELOPMENT_BUSINESS_ID,
): readonly Product[] {
  return createInitialProductImport(businessId).products;
}
