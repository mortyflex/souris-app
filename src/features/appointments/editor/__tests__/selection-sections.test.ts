import type { Service } from '@/domain/appointments';

import {
  buildServiceSelectionSections,
  filterServicesOfType,
  toServiceGridRows,
} from '../selection-sections';

function service(
  id: string,
  type: Service['type'],
  name = id,
): Service {
  return {
    id,
    businessId: 'business-test',
    name,
    type,
    price: 10,
    phases: [
      {
        id: `${id}-phase`,
        name,
        durationMinutes: 30,
        requiresStaff: true,
      },
    ],
    active: true,
  };
}

describe('buildServiceSelectionSections', () => {
  it('groups by Service.type only and preserves source order', () => {
    const sections = buildServiceSelectionSections([
      service('a', 'SERVICE'),
      service('b', 'TECHNIQUE'),
      service('c', 'SERVICE'),
      service('d', 'TECHNIQUE'),
    ]);

    expect(sections.map((section) => section.title)).toEqual([
      'Services',
      'Techniques',
    ]);
    expect(sections[0].data.map((item) => item.id)).toEqual(['a', 'c']);
    expect(sections[1].data.map((item) => item.id)).toEqual(['b', 'd']);
  });

  it('omits empty sections', () => {
    const sections = buildServiceSelectionSections([
      service('a', 'TECHNIQUE'),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Techniques');
  });

  it('filters each section independently and hides emptied sections', () => {
    const sections = buildServiceSelectionSections(
      [
        service('simple', 'SERVICE', 'Brushing'),
        service('technique', 'TECHNIQUE', 'Balayage'),
      ],
      'balayage',
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Techniques');
    expect(sections[0].data[0].name).toBe('Balayage');
  });

  it('never mutates the source catalog', () => {
    const services = [service('a', 'SERVICE'), service('b', 'TECHNIQUE')];
    const before = JSON.stringify(services);

    buildServiceSelectionSections(services, '  balayage  ');

    expect(JSON.stringify(services)).toBe(before);
  });
});

describe('toServiceGridRows', () => {
  it('packs services into two-column rows', () => {
    const rows = toServiceGridRows([
      service('a', 'SERVICE'),
      service('b', 'SERVICE'),
      service('c', 'SERVICE'),
    ]);

    expect(rows).toEqual([
      [service('a', 'SERVICE'), service('b', 'SERVICE')],
      [service('c', 'SERVICE'), undefined],
    ]);
  });
});

describe('filterServicesOfType', () => {
  const catalog = [
    service('brushing', 'SERVICE', 'Brushing'),
    service('balayage', 'TECHNIQUE', 'Balayage'),
    service('coupe', 'SERVICE', 'Coupe'),
    service('coupe-couleur', 'TECHNIQUE', 'Coupe couleur'),
  ];

  it('keeps only the requested type, in source order', () => {
    expect(filterServicesOfType(catalog, 'SERVICE').map(({ id }) => id)).toEqual([
      'brushing',
      'coupe',
    ]);
    expect(filterServicesOfType(catalog, 'TECHNIQUE').map(({ id }) => id)).toEqual([
      'balayage',
      'coupe-couleur',
    ]);
  });

  it('searches inside the requested type only', () => {
    expect(filterServicesOfType(catalog, 'SERVICE', ' coupe ').map(({ id }) => id)).toEqual([
      'coupe',
    ]);
    expect(filterServicesOfType(catalog, 'TECHNIQUE', 'coupe').map(({ id }) => id)).toEqual([
      'coupe-couleur',
    ]);
    expect(filterServicesOfType(catalog, 'SERVICE', 'balayage')).toEqual([]);
  });
});
