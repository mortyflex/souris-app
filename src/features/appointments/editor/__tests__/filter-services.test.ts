import type { Service } from '@/domain/appointments';

import { filterCatalogServices } from '../filter-services';

function service(id: string, name: string): Service {
  return {
    id,
    businessId: 'business-test',
    name,
    type: 'SERVICE',
    price: 10,
    phases: [{ id: `${id}-phase`, name, durationMinutes: 30, requiresStaff: true }],
    active: true,
  };
}

describe('filterCatalogServices', () => {
  const catalog = [
    service('a', 'Brushing 1'),
    service('b', 'Balayage 1'),
    service('c', 'Chignon'),
  ];

  it('matches substrings case-insensitively', () => {
    expect(filterCatalogServices(catalog, 'BRUSHING').map((s) => s.id)).toEqual(['a']);
  });

  it('matches accent-insensitively', () => {
    expect(filterCatalogServices(catalog, 'chignôn').map((s) => s.id)).toEqual(['c']);
  });

  it('returns no matches for a blank query without mutating input', () => {
    const before = JSON.stringify(catalog);
    expect(filterCatalogServices(catalog, '   ')).toEqual([]);
    expect(JSON.stringify(catalog)).toBe(before);
  });
});
