import type { Service } from '@/domain/appointments';
import { groupServicesByCategory, type ServiceCategory } from '@/domain/services';

export type CatalogGroupLabel = 'ACTIVES' | 'INACTIVES';
export type CatalogSectionTitle = 'Services' | 'Techniques';

export interface CatalogListSection {
  readonly key: string;
  readonly groupLabel: CatalogGroupLabel;
  /** True for the first rendered subsection of its group. */
  readonly showGroupLabel: boolean;
  /** A type title, a professional category name, « Sans catégorie » or « Inactives ». */
  readonly title: string;
  readonly data: readonly Service[];
}

export const UNCATEGORIZED_TITLE = 'Sans catégorie';
export const INACTIVES_TITLE = 'Inactives';

/** Whether any of these Services names a category that exists. */
export function hasCategorizedServices(
  services: readonly Service[],
  categories: readonly ServiceCategory[],
): boolean {
  const known = new Set(categories.map((category) => category.id));
  return services.some((service) => service.categoryId !== undefined && known.has(service.categoryId));
}

/**
 * The catalogue grouped by the professional's categories: the ACTIVE
 * Services under each category in the professional's order, then « Sans
 * catégorie » (no category, or one that no longer exists), then every
 * inactive Service under « Inactives » — so nothing reachable before is
 * hidden. Source order is kept inside a section; empty sections are omitted.
 */
export function buildCategoryCatalogSections(
  services: readonly Service[],
  categories: readonly ServiceCategory[],
): readonly CatalogListSection[] {
  const actives = services.filter((service) => service.active);
  const inactives = services.filter((service) => !service.active);
  const sections: CatalogListSection[] = groupServicesByCategory(actives, categories).map((group, index) => ({
    key: `ACTIVES:${group.category?.id ?? 'uncategorized'}`,
    groupLabel: 'ACTIVES',
    showGroupLabel: index === 0,
    title: group.category?.name ?? UNCATEGORIZED_TITLE,
    data: group.items,
  }));
  if (inactives.length > 0) {
    sections.push({ key: 'INACTIVES', groupLabel: 'INACTIVES', showGroupLabel: true, title: INACTIVES_TITLE, data: inactives });
  }
  return sections;
}

/**
 * Splits the canonical catalog into activation groups, each visually
 * separated into SERVICE and TECHNIQUE subsections.
 *
 * - source order is preserved inside every subsection;
 * - empty subsections are omitted entirely;
 * - this is TYPE grouping only — legacy categories never reappear;
 * - the source array is never mutated.
 */
export function buildCatalogSections(
  services: readonly Service[],
): readonly CatalogListSection[] {
  const sections: CatalogListSection[] = [];

  const push = (
    groupLabel: CatalogGroupLabel,
    title: CatalogSectionTitle,
    data: readonly Service[],
  ) => {
    if (data.length === 0) return;
    const previous = sections[sections.length - 1];
    sections.push({
      key: `${groupLabel}:${title}`,
      groupLabel,
      showGroupLabel: previous?.groupLabel !== groupLabel,
      title,
      data,
    });
  };

  const actives = services.filter((service) => service.active);
  const inactives = services.filter((service) => !service.active);

  push(
    'ACTIVES',
    'Services',
    actives.filter((service) => service.type === 'SERVICE'),
  );
  push(
    'ACTIVES',
    'Techniques',
    actives.filter((service) => service.type === 'TECHNIQUE'),
  );
  push(
    'INACTIVES',
    'Services',
    inactives.filter((service) => service.type === 'SERVICE'),
  );
  push(
    'INACTIVES',
    'Techniques',
    inactives.filter((service) => service.type === 'TECHNIQUE'),
  );

  return sections;
}
