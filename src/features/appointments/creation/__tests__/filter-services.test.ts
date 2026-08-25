import { filterCatalogServices } from '../filter-services';
import type { Service } from '@/domain/appointments';

const services: readonly Service[] = [
  { id: 's1', businessId: 'b', name: 'Brushing 1', type: 'SERVICE', price: 20, active: true, phases: [] },
  { id: 's2', businessId: 'b', name: 'Brushing 2', type: 'SERVICE', price: 25, active: true, phases: [] },
  { id: 't1', businessId: 'b', name: 'Balayage 1', type: 'TECHNIQUE', price: 45, active: true, phases: [] },
  { id: 't2', businessId: 'b', name: 'Balayage spécial', type: 'TECHNIQUE', price: 95, active: true, phases: [] },
  { id: 't3', businessId: 'b', name: 'Coloration racines', type: 'TECHNIQUE', price: 30, active: true, phases: [] },
];

describe('filterCatalogServices', () => {
  it('returns no matches for an empty query', () => {
    expect(filterCatalogServices(services, '')).toEqual([]);
    expect(filterCatalogServices(services, '   ')).toEqual([]);
  });

  it('matches by name substring', () => {
    expect(filterCatalogServices(services, 'balayage').map((s) => s.id)).toEqual(['t1', 't2']);
  });

  it('is case- and accent-insensitive', () => {
    expect(filterCatalogServices(services, 'COLORATION').map((s) => s.id)).toEqual(['t3']);
    expect(filterCatalogServices(services, 'coloration').map((s) => s.id)).toEqual(['t3']);
  });

  it('returns no matches when nothing fits', () => {
    expect(filterCatalogServices(services, 'xyz')).toEqual([]);
  });
});
