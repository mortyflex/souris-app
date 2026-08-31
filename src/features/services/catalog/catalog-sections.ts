import type { Service } from '@/domain/appointments';

export type CatalogGroupLabel = 'ACTIVES' | 'INACTIVES';
export type CatalogSectionTitle = 'Services' | 'Techniques';

export interface CatalogListSection {
  readonly key: string;
  readonly groupLabel: CatalogGroupLabel;
  /** True for the first rendered subsection of its group. */
  readonly showGroupLabel: boolean;
  readonly title: CatalogSectionTitle;
  readonly data: readonly Service[];
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
