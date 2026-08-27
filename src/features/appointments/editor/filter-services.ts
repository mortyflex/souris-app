// Souris — Catalog search for the Appointment service editor
//
// Name-substring search over the normalized catalog, case- and
// accent-insensitive. The full catalog is searched; no display cap is
// applied at this layer.

import type { Service } from '@/domain/appointments';

function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filters catalog services by name. An empty query returns no matches —
 * the caller shows the grouped catalog instead.
 */
export function filterCatalogServices(
  services: readonly Service[],
  query: string,
): readonly Service[] {
  const normalizedQuery = normalizeForSearch(query);
  if (normalizedQuery.length === 0) {
    return [];
  }

  return services.filter((service) =>
    normalizeForSearch(service.name).includes(normalizedQuery),
  );
}
