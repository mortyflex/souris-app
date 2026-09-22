// Souris — Appointment service-selection sections
//
// Pure presentation helpers for the shared prestation catalogue. Categories
// are derived from Service.type only; legacy categories never reappear.

import type { Service, ServiceType } from '@/domain/appointments';

import { filterCatalogServices } from './filter-services';

export type ServiceGridRow = readonly [Service, Service | undefined];

/**
 * The Services of ONE type (the Services / Techniques segment of « Modifier
 * le rendez-vous »), optionally filtered by the search query. Source order is
 * preserved; an empty query keeps every Service of that type.
 */
export function filterServicesOfType(
  services: readonly Service[],
  type: ServiceType,
  query = '',
): readonly Service[] {
  const trimmed = query.trim();
  const ofType = services.filter((service) => service.type === type);
  return trimmed.length > 0 ? filterCatalogServices(ofType, trimmed) : ofType;
}

/**
 * Packs a category into two-column rows for the card grid.
 */
export function toServiceGridRows(
  services: readonly Service[],
): readonly ServiceGridRow[] {
  const rows: ServiceGridRow[] = [];
  for (let index = 0; index < services.length; index += 2) {
    rows.push([services[index], services[index + 1]]);
  }
  return rows;
}
