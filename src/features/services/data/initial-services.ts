// Souris - Initial (development) Service catalog
//
// Legacy pilot files are one-way import sources reached only by the
// development seed — a fresh production install starts empty. Runtime features receive only the
// canonical Service values returned here; legacy categories and UI colors do
// not cross this boundary.

import type { Service } from '@/domain/appointments';

import { buildCatalog, type Catalog } from '../adapters/catalog-adapter';
import { services_list } from './legacy-services';
import { packages_list } from './legacy-techniques';

export const DEVELOPMENT_BUSINESS_ID = 'fixture-business';

/** Builds a fresh, deterministic normalization result from both legacy files. */
export function createInitialServiceImport(businessId: string = DEVELOPMENT_BUSINESS_ID): Catalog {
  return buildCatalog(
    Object.entries(services_list).map(([category, services]) => ({
      category,
      services,
    })),
    Object.entries(packages_list).map(([category, techniques]) => ({
      category,
      techniques,
    })),
    businessId,
  );
}

/** Builds the canonical development catalog, stamped with `businessId`. */
export function createInitialServiceCatalog(
  businessId: string = DEVELOPMENT_BUSINESS_ID,
): readonly Service[] {
  return createInitialServiceImport(businessId).services;
}
