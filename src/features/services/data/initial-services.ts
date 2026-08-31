// Souris - Initial in-memory Service catalog
//
// Legacy files are one-way import sources. Runtime features receive only the
// canonical Service values returned here; legacy categories and UI colors do
// not cross this boundary.

import type { Service } from '@/domain/appointments';

import { buildCatalog, type Catalog } from '../adapters/catalog-adapter';
import { services_list } from './legacy-services';
import { packages_list } from './legacy-techniques';

export const DEVELOPMENT_BUSINESS_ID = 'fixture-business';

/** Builds a fresh, deterministic normalization result from both legacy files. */
export function createInitialServiceImport(): Catalog {
  return buildCatalog(
    Object.entries(services_list).map(([category, services]) => ({
      category,
      services,
    })),
    Object.entries(packages_list).map(([category, techniques]) => ({
      category,
      techniques,
    })),
    DEVELOPMENT_BUSINESS_ID,
  );
}

/** Builds the canonical seed used by each in-memory catalog session. */
export function createInitialServiceCatalog(): readonly Service[] {
  return createInitialServiceImport().services;
}
