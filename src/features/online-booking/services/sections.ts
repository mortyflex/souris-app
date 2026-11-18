// BeautIzzy — « Prestations proposées en ligne »: grouping and bulk plans (pure)
//
// The server's list, organised the way the professional's own catalogue is
// (catalogue-presentation.ts), never by a vocabulary of its own:
//
//   SERVICE_TYPES  (hairdressing and every established activity) the
//                  Services / Techniques groups, subdivided by her categories
//                  only when she assigned some — the catalogue's own rule;
//   CATEGORIES     (nails, esthetics, wellness) her categories in her order,
//                  then « Sans catégorie ».
//
// Every unavailable service (inactive, no duration, longer than the limit)
// is gathered last under « Indisponibles en ligne », with its reason, so the
// switches above are all ones she can turn. Alphabetical (French) inside a
// group. Bulk plans name exactly the ids the list shows — never « all ».

import type { CatalogueOrganization } from '@/features/services/catalogue-presentation';

import { SERVICE_PUBLICATION_MAX_IDS, type PublishableService, type ServicePublication } from '../gateway';

import { UNAVAILABLE_SECTION_TITLE } from './presentation';

export const UNCATEGORIZED_SECTION_TITLE = 'Sans catégorie';

export interface ServicePublicationSection {
  readonly key: string;
  /** « Services » / « Techniques » above the first section of a type group (SERVICE_TYPES only). */
  readonly groupLabel?: string;
  readonly title: string;
  readonly unavailable: boolean;
  readonly services: readonly PublishableService[];
}

const TYPE_GROUPS = [
  { type: 'SERVICE', label: 'Services' },
  { type: 'TECHNIQUE', label: 'Techniques' },
] as const;

const byFrenchName = (left: PublishableService, right: PublishableService) =>
  left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' }) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

/** Her categories in her order (position, then id), then the uncategorized ones; empty groups omitted. */
function groupByCategory(services: readonly PublishableService[]): readonly { key: string; title: string; services: PublishableService[] }[] {
  const categories = new Map<string, NonNullable<PublishableService['category']>>();
  for (const service of services) {
    if (service.category !== undefined) categories.set(service.category.id, service.category);
  }
  const ordered = [...categories.values()].sort(
    (left, right) => left.position - right.position || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
  const groups = ordered.map((category) => ({
    key: `category:${category.id}`,
    title: category.name,
    services: services.filter((service) => service.category?.id === category.id).sort(byFrenchName),
  }));
  const uncategorized = services.filter((service) => service.category === undefined).sort(byFrenchName);
  if (uncategorized.length > 0) {
    groups.push({ key: 'uncategorized', title: UNCATEGORIZED_SECTION_TITLE, services: uncategorized });
  }
  return groups;
}

export function buildServicePublicationSections(
  publication: ServicePublication,
  organization: CatalogueOrganization,
): readonly ServicePublicationSection[] {
  const available = publication.services.filter((service) => service.eligible);
  const unavailable = publication.services.filter((service) => !service.eligible).sort(byFrenchName);
  const sections: ServicePublicationSection[] = [];

  if (organization === 'CATEGORIES') {
    for (const group of groupByCategory(available)) {
      sections.push({ key: group.key, title: group.title, unavailable: false, services: group.services });
    }
  } else {
    for (const { type, label } of TYPE_GROUPS) {
      const ofType = available.filter((service) => service.type === type);
      if (ofType.length === 0) continue;
      if (!ofType.some((service) => service.category !== undefined)) {
        sections.push({ key: `type:${type}`, title: label, unavailable: false, services: [...ofType].sort(byFrenchName) });
        continue;
      }
      groupByCategory(ofType).forEach((group, index) => {
        sections.push({
          key: `type:${type}:${group.key}`,
          ...(index === 0 ? { groupLabel: label } : {}),
          title: group.title,
          unavailable: false,
          services: group.services,
        });
      });
    }
  }

  if (unavailable.length > 0) {
    sections.push({ key: 'unavailable', title: UNAVAILABLE_SECTION_TITLE, unavailable: true, services: unavailable });
  }
  return sections;
}

export interface BulkPlan {
  /** Exactly the ids the list shows for this action. */
  readonly serviceIds: readonly string[];
  /** More ids than one server change accepts: the action is not offered. */
  readonly tooMany: boolean;
}

/** « Tout proposer »: every AVAILABLE service of the list — never an unavailable one. */
export function planSelectAll(publication: ServicePublication): BulkPlan {
  const serviceIds = publication.services.filter((service) => service.eligible).map((service) => service.id);
  return { serviceIds, tooMany: serviceIds.length > SERVICE_PUBLICATION_MAX_IDS };
}

/** « Tout retirer »: every chosen service of the list, an unavailable one included. */
export function planWithdrawAll(publication: ServicePublication): BulkPlan {
  const serviceIds = publication.services.filter((service) => service.selected).map((service) => service.id);
  return { serviceIds, tooMany: serviceIds.length > SERVICE_PUBLICATION_MAX_IDS };
}

/** Whether « Tout proposer » would change anything: an available service not chosen yet. */
export function canSelectAll(publication: ServicePublication): boolean {
  return publication.services.some((service) => service.eligible && !service.selected);
}

/** Whether « Tout retirer » would change anything. */
export function canWithdrawAll(publication: ServicePublication): boolean {
  return publication.services.some((service) => service.selected);
}
