import type { Service } from '@/domain/appointments';

import { filterServicesOfType, toServiceGridRows } from '../selection-sections';

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
