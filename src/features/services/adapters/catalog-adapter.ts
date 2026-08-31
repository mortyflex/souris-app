// Souris — Catalog adapter
//
// Combines the one-way legacy imports into canonical Service values.

import type { Service } from '@/domain/appointments';
import {
  normalizeLegacyServices,
  type LegacyServiceCategory,
  type AdapterDiagnostic as ServiceDiagnostic,
} from './legacy-services-adapter';
import {
  normalizeLegacyTechniques,
  type LegacyTechniqueCategory,
  type AdapterDiagnostic as TechniqueDiagnostic,
} from './legacy-techniques-adapter';

export type AdapterDiagnostic = ServiceDiagnostic | TechniqueDiagnostic;

export interface Catalog {
  readonly services: readonly Service[];
  readonly diagnostics: readonly AdapterDiagnostic[];
}

/**
 * Builds a unified catalog from legacy services and techniques.
 *
 * Returns:
 * - services: all normalized services and techniques
 * - diagnostics: all warnings/errors from normalization
 */
export function buildCatalog(
  serviceCategories: readonly LegacyServiceCategory[],
  techniqueCategories: readonly LegacyTechniqueCategory[],
  businessId: string,
): Catalog {
  const servicesResult = normalizeLegacyServices(serviceCategories, businessId);
  const techniquesResult = normalizeLegacyTechniques(techniqueCategories, businessId);
  const services = [...servicesResult.services, ...techniquesResult.techniques];

  return {
    services,
    diagnostics: [...servicesResult.diagnostics, ...techniquesResult.diagnostics],
  };
}

/**
 * Finds a service by ID in the catalog.
 * Returns undefined if not found.
 */
export function findServiceById(
  catalog: Catalog,
  serviceId: string,
): Service | undefined {
  return catalog.services.find((s) => s.id === serviceId);
}
