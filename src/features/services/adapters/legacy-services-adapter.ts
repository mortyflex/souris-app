// Souris — Legacy services adapter
//
// Source: src/features/services/data/legacy-services.ts
// Target: Canonical Souris Service (src/domain/appointments/types.ts)
//
// This adapter transforms the legacy SERVICE records into canonical
// Souris Service objects. Services are simple staff-required work
// with no processing time (unlike TECHNIQUEs).

import type { Service, ServicePhase } from '@/domain/appointments';
import type { ServiceItem } from '../data/legacy-services';

export type LegacyService = Readonly<ServiceItem>;

export interface LegacyServiceCategory {
  readonly category: string;
  readonly services: readonly LegacyService[];
}

export interface AdapterDiagnostic {
  readonly source: 'service' | 'technique';
  readonly category: string;
  readonly name: string;
  readonly reason: string;
}

export interface ServicesAdapterResult {
  readonly services: readonly Service[];
  readonly diagnostics: readonly AdapterDiagnostic[];
}

/**
 * Generates a deterministic service ID from category and name.
 * Format: "service-{category-slug}-{name-slug}"
 *
 * Slugification:
 * - lowercase
 * - replace spaces with hyphens
 * - remove non-alphanumeric/hyphen characters
 * - collapse multiple hyphens
 */
export function generateServiceId(category: string, name: string): string {
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  return `service-${slugify(category)}-${slugify(name)}`;
}

/**
 * Generates a deterministic phase ID from service ID.
 * Format: "{serviceId}-phase"
 */
export function generateServicePhaseId(serviceId: string): string {
  return `${serviceId}-phase`;
}

/**
 * Normalizes a single legacy service into a canonical Service.
 *
 * Mapping rules:
 * - category + name → id (deterministic, slugified)
 * - name → name
 * - type: always "SERVICE"
 * - price: must be numeric, otherwise returns null
 * - duration → single phase with requiresStaff: true
 * - break: IGNORED (services have no processing time)
 * - color: IGNORED (design system owns colors)
 *
 * Returns null if price is non-numeric (e.g., "Multiprix").
 */
export function normalizeLegacyService(
  legacy: LegacyService,
  category: string,
  businessId: string,
): Service | null {
  // Validate price
  if (typeof legacy.price !== 'number' || !Number.isFinite(legacy.price)) {
    return null;
  }

  const serviceId = generateServiceId(category, legacy.name);
  const phaseId = generateServicePhaseId(serviceId);

  const phase: ServicePhase = {
    id: phaseId,
    name: legacy.name,
    durationMinutes: legacy.duration,
    requiresStaff: true,
  };

  return {
    id: serviceId,
    businessId,
    name: legacy.name,
    type: 'SERVICE',
    price: legacy.price,
    phases: [phase],
    active: true,
  };
}

/**
 * Normalizes a category of legacy services.
 *
 * Returns:
 * - services: successfully normalized services
 * - diagnostics: services that were excluded (e.g., non-numeric prices)
 */
export function normalizeLegacyServiceCategory(
  categoryData: LegacyServiceCategory,
  businessId: string,
): ServicesAdapterResult {
  const services: Service[] = [];
  const diagnostics: AdapterDiagnostic[] = [];

  for (const legacy of categoryData.services) {
    const normalized = normalizeLegacyService(legacy, categoryData.category, businessId);

    if (normalized) {
      services.push(normalized);
    } else {
      diagnostics.push({
        source: 'service',
        category: categoryData.category,
        name: legacy.name,
        reason: `Non-numeric price: ${legacy.price}`,
      });
    }
  }

  return { services, diagnostics };
}

/**
 * Batch-normalizes multiple categories of legacy services.
 * Convenience wrapper for normalizeLegacyServiceCategory.
 */
export function normalizeLegacyServices(
  categories: readonly LegacyServiceCategory[],
  businessId: string,
): ServicesAdapterResult {
  const allServices: Service[] = [];
  const allDiagnostics: AdapterDiagnostic[] = [];

  for (const category of categories) {
    const result = normalizeLegacyServiceCategory(category, businessId);
    allServices.push(...result.services);
    allDiagnostics.push(...result.diagnostics);
  }

  return { services: allServices, diagnostics: allDiagnostics };
}
