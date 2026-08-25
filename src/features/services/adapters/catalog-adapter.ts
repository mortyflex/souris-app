// Souris — Catalog adapter
//
// Combines normalized services and techniques into a unified catalog
// for use in the Appointment Creation flow.

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

export interface CatalogGroup {
  readonly category: string;
  readonly services: readonly Service[];
}

export interface Catalog {
  readonly services: readonly Service[];
  readonly groups: readonly CatalogGroup[];
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
): Catalog {
  const servicesResult = normalizeLegacyServices(serviceCategories);
  const techniquesResult = normalizeLegacyTechniques(techniqueCategories);
  const services = [...servicesResult.services, ...techniquesResult.techniques];
  const groups: CatalogGroup[] = [];

  for (const category of serviceCategories) {
    const categoryServices = services.filter((service) =>
      service.id.startsWith(`service-${slugify(category.category)}-`),
    );
    if (categoryServices.length > 0) {
      groups.push({ category: category.category, services: categoryServices });
    }
  }

  for (const category of techniqueCategories) {
    const categoryServices = services.filter((service) =>
      service.id.startsWith(`technique-${slugify(category.category)}-`),
    );
    if (categoryServices.length > 0) {
      groups.push({ category: category.category, services: categoryServices });
    }
  }

  return {
    services,
    groups,
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

/**
 * Groups services by category for display purposes.
 *
 * Note: This is a presentation helper, not a domain operation.
 * The canonical Service type does not have a category field.
 */
export function groupServicesByCategory(
  serviceCategories: readonly LegacyServiceCategory[],
  techniqueCategories: readonly LegacyTechniqueCategory[],
): readonly { category: string; services: Service[] }[] {
  return buildCatalog(serviceCategories, techniqueCategories).groups.map((group) => ({
    category: group.category,
    services: [...group.services],
  }));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
