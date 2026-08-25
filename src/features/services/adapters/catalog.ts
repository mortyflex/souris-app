// Souris — Catalog instance
//
// Loads the real legacy data and normalizes it into a unified catalog.
// This is the single source of truth for services and techniques in the app.

import { services_list } from '../data/legacy-services';
import { packages_list } from '../data/legacy-techniques';
import { buildCatalog, type Catalog } from './catalog-adapter';

/**
 * The normalized catalog of all services and techniques.
 * Built once at module load time from legacy data.
 */
export const catalog: Catalog = buildCatalog(
  Object.entries(services_list).map(([category, services]) => ({
    category,
    services,
  })),
  Object.entries(packages_list).map(([category, techniques]) => ({
    category,
    techniques,
  })),
);

/**
 * All diagnostics (warnings/errors) from the normalization process.
 * Log these at app startup to identify data quality issues.
 */
export const catalogDiagnostics = catalog.diagnostics;
