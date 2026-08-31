import type { Service, ServicePhase } from '@/domain/appointments';

import { buildCatalogSections } from '../catalog-sections';

function phase(id: string, requiresStaff: boolean): ServicePhase {
  return { id, name: 'Phase', durationMinutes: 10, requiresStaff };
}

function service(
  id: string,
  type: Service['type'],
  active: boolean,
): Service {
  return {
    id,
    businessId: 'business-test',
    name: id,
    type,
    price: 10,
    phases: [phase(`${id}-phase`, true)],
    active,
  };
}

describe('buildCatalogSections', () => {
  it('groups active/inactive services by SERVICE and TECHNIQUE only', () => {
    const services: readonly Service[] = [
      service('simple-active', 'SERVICE', true),
      service('technique-inactive', 'TECHNIQUE', false),
      service('simple-inactive', 'SERVICE', false),
      service('technique-active', 'TECHNIQUE', true),
    ];

    const sections = buildCatalogSections(services);

    expect(sections.map((section) => `${section.groupLabel}:${section.title}`)).toEqual([
      'ACTIVES:Prestations simples',
      'ACTIVES:Techniques',
      'INACTIVES:Prestations simples',
      'INACTIVES:Techniques',
    ]);
    expect(sections[0].data.map((s) => s.id)).toEqual(['simple-active']);
    expect(sections[1].data.map((s) => s.id)).toEqual(['technique-active']);
    expect(sections[2].data.map((s) => s.id)).toEqual(['simple-inactive']);
    expect(sections[3].data.map((s) => s.id)).toEqual(['technique-inactive']);
  });

  it('only renders non-empty subsections and flags the first of each group', () => {
    const sections = buildCatalogSections([
      service('simple-active', 'SERVICE', true),
      service('simple-inactive', 'SERVICE', false),
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[0].showGroupLabel).toBe(true);
    expect(sections[1].showGroupLabel).toBe(true);
  });

  it('preserves source order inside every subsection without duplication', () => {
    const services: readonly Service[] = [
      service('a', 'SERVICE', true),
      service('b', 'TECHNIQUE', true),
      service('c', 'SERVICE', true),
      service('d', 'TECHNIQUE', true),
    ];

    const sections = buildCatalogSections(services);

    const ids = sections.flatMap((section) => section.data.map((s) => s.id));
    expect(ids).toEqual(['a', 'c', 'b', 'd']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never mutates the source catalog and ignores legacy categories', () => {
    const services: readonly Service[] = [
      service('simple-active', 'SERVICE', true),
      service('technique-active', 'TECHNIQUE', true),
    ];
    const before = JSON.stringify(services);

    const sections = buildCatalogSections(services);

    expect(JSON.stringify(services)).toBe(before);
    expect(sections.some((section) => section.title.includes('Brushing'))).toBe(false);
  });
});
