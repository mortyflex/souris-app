// Souris — Appointment service-selection sections
//
// Pure presentation helpers for the shared compact grouped picker. Groups
// are derived from Service.type only; legacy categories never reappear.

import type { Service } from '@/domain/appointments';

import { filterCatalogServices } from './filter-services';

export type SelectionSectionTitle = 'Services' | 'Techniques';

export interface ServiceSelectionSection {
  readonly title: SelectionSectionTitle;
  readonly data: readonly Service[];
}

export type ServiceGridRow = readonly [Service, Service | undefined];

/**
 * Splits active Services into SERVICE / TECHNIQUE sections, optionally
 * filtered by the search query. Source order is preserved inside every
 * section and empty sections are omitted. The source array is never mutated.
 */
export function buildServiceSelectionSections(
  services: readonly Service[],
  query = '',
): readonly ServiceSelectionSection[] {
  const trimmed = query.trim();
  const filter = (candidates: readonly Service[]) =>
    trimmed.length > 0 ? filterCatalogServices(candidates, trimmed) : candidates;

  const sections: ServiceSelectionSection[] = [];
  const simples = filter(services.filter((service) => service.type === 'SERVICE'));
  const techniques = filter(services.filter((service) => service.type === 'TECHNIQUE'));
  if (simples.length > 0) {
    sections.push({ title: 'Services', data: simples });
  }
  if (techniques.length > 0) {
    sections.push({ title: 'Techniques', data: techniques });
  }
  return sections;
}

/**
 * Packs a section into two-column rows for the wrapping grid.
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
