// BeautIzzy — Service categories (domain): stable ids, free names, the professional's order

import { createAppointmentItemSnapshot, type Service } from '@/domain/appointments';

import {
  createServiceCategory,
  detachServicesFromCategory,
  groupServicesByCategory,
  isValidServiceCategoryName,
  moveServiceCategory,
  nextServiceCategoryPosition,
  normalizeServiceCategoryName,
  resolveServiceCategory,
  ServiceCategoryInvalidError,
  sortServiceCategories,
  type ServiceCategory,
} from '../categories';
import { isValidServiceDescription, normalizeServiceDescription, SERVICE_DESCRIPTION_MAX_LENGTH } from '../description';

const category = (id: string, position: number, name = id): ServiceCategory => ({
  id,
  businessId: 'business-1',
  name,
  position,
});

const service = (id: string, categoryId?: string, active = true): Service => ({
  id,
  businessId: 'business-1',
  name: id,
  type: 'SERVICE',
  price: 30,
  phases: [{ id: `${id}-phase`, name: id, durationMinutes: 30, requiresStaff: true }],
  active,
  ...(categoryId !== undefined && { categoryId }),
});

describe('service categories', () => {
  it('creates a category with a trimmed one-line name and a normalised optional description', () => {
    expect(
      createServiceCategory({
        id: 'cat-gel',
        businessId: 'business-1',
        name: '  Extensions   et poses\ten gel ',
        description: '  Capsules ou chablons.\r\nSur rendez-vous.  ',
        position: 0,
      }),
    ).toEqual({
      id: 'cat-gel',
      businessId: 'business-1',
      name: 'Extensions et poses en gel',
      description: 'Capsules ou chablons.\nSur rendez-vous.',
      position: 0,
    });
    expect(createServiceCategory({ id: 'c', businessId: 'b', name: 'Épilations', description: '   ', position: 3 })).toEqual({
      id: 'c',
      businessId: 'b',
      name: 'Épilations',
      position: 3,
    });
  });

  it('refuses a blank or over-long name, an over-long description and an invalid position', () => {
    const base = { id: 'c', businessId: 'b', position: 0 };
    expect(() => createServiceCategory({ ...base, name: '   ' })).toThrow(ServiceCategoryInvalidError);
    expect(() => createServiceCategory({ ...base, name: 'x'.repeat(61) })).toThrow(/NAME_TOO_LONG/);
    expect(() =>
      createServiceCategory({ ...base, name: 'Ok', description: 'x'.repeat(SERVICE_DESCRIPTION_MAX_LENGTH + 1) }),
    ).toThrow(/DESCRIPTION_TOO_LONG/);
    expect(() => createServiceCategory({ ...base, name: 'Ok', position: -1 })).toThrow(/POSITION_INVALID/);
    expect(() => createServiceCategory({ ...base, name: 'Ok', position: 1.5 })).toThrow(/POSITION_INVALID/);
    expect(isValidServiceCategoryName(' Soins du visage ')).toBe(true);
    expect(isValidServiceCategoryName('')).toBe(false);
    expect(normalizeServiceCategoryName(' Beauté   du regard ')).toBe('Beauté du regard');
  });

  it('orders by position, then id when two devices chose the same position', () => {
    const ordered = sortServiceCategories([category('b', 1), category('z', 0), category('a', 1)]);
    expect(ordered.map((entry) => entry.id)).toEqual(['z', 'a', 'b']);
    expect(nextServiceCategoryPosition([])).toBe(0);
    expect(nextServiceCategoryPosition([category('a', 0), category('b', 4)])).toBe(5);
  });

  it('moves a category to a drop index and returns ONLY the categories whose position changed', () => {
    const categories = [category('a', 0), category('b', 1), category('c', 2), category('d', 3)];
    expect(moveServiceCategory(categories, 'c', 1)).toEqual([
      { ...category('c', 2), position: 1 },
      { ...category('b', 1), position: 2 },
    ]);
    // A long drag crosses several rows at once.
    expect(moveServiceCategory(categories, 'a', 3).map((entry) => [entry.id, entry.position])).toEqual([
      ['b', 0],
      ['c', 1],
      ['d', 2],
      ['a', 3],
    ]);
    expect(moveServiceCategory(categories, 'a', 0)).toEqual([]);
    expect(moveServiceCategory(categories, 'd', 4)).toEqual([]);
    expect(moveServiceCategory(categories, 'b', -1)).toEqual([]);
    expect(moveServiceCategory(categories, 'unknown', 1)).toEqual([]);
    // Positions with gaps or ties are renumbered 0…n-1 by the move.
    const messy = [category('a', 4), category('b', 4), category('c', 9)];
    expect(moveServiceCategory(messy, 'c', 1).map((entry) => [entry.id, entry.position])).toEqual([
      ['a', 0],
      ['c', 1],
      ['b', 2],
    ]);
  });

  it('resolves a Service category by id; a missing or unknown id is « Sans catégorie »', () => {
    const categories = [category('cat-gel', 0, 'Gel')];
    expect(resolveServiceCategory(service('s1', 'cat-gel'), categories)?.name).toBe('Gel');
    expect(resolveServiceCategory(service('s2'), categories)).toBeUndefined();
    expect(resolveServiceCategory(service('s3', 'cat-removed-elsewhere'), categories)).toBeUndefined();
  });

  it('a rename moves nothing: Services reference the stable id, never the name', () => {
    const before = [category('cat-gel', 0, 'Gel')];
    const after = [{ ...before[0]!, name: 'Extensions et poses en gel' }];
    const gelSet = service('gel-set', 'cat-gel');
    expect(resolveServiceCategory(gelSet, before)?.id).toBe('cat-gel');
    expect(resolveServiceCategory(gelSet, after)?.name).toBe('Extensions et poses en gel');
  });

  it('groups Services by category order, uncategorized (unknown ids included) last, empty groups omitted', () => {
    const categories = [category('feet', 1, 'Beauté des pieds'), category('gel', 0, 'Gel')];
    const services = [service('s1', 'feet'), service('s2'), service('s3', 'gel'), service('s4', 'ghost'), service('s5', 'gel')];
    const groups = groupServicesByCategory(services, categories);
    expect(groups.map((group) => [group.category?.name ?? 'Sans catégorie', group.items.map((item) => item.id)])).toEqual([
      ['Gel', ['s3', 's5']],
      ['Beauté des pieds', ['s1']],
      ['Sans catégorie', ['s2', 's4']],
    ]);
    expect(groupServicesByCategory([], categories)).toEqual([]);
    expect(groupServicesByCategory([service('only')], [])).toEqual([{ category: undefined, items: [service('only')] }]);
    expect(groupServicesByCategory([], categories, { includeEmpty: true }).map((group) => group.category?.id)).toEqual([
      'gel',
      'feet',
    ]);
  });

  it('deleting a category detaches its Services — none is deleted, other fields untouched', () => {
    const services = [service('s1', 'gel'), service('s2', 'feet'), service('s3', 'gel', false)];
    expect(detachServicesFromCategory(services, 'gel')).toEqual([service('s1'), service('s3', undefined, false)]);
    expect(detachServicesFromCategory(services, 'nothing')).toEqual([]);
  });

  it('never reaches an appointment snapshot: category and description stay in the catalogue', () => {
    const described: Service = { ...service('facial', 'face'), description: 'Venir sans maquillage.' };
    const item = createAppointmentItemSnapshot({ id: 'item-1', service: described, order: 0 });
    expect(item).not.toHaveProperty('categoryId');
    expect(item).not.toHaveProperty('description');
    expect(Object.keys(item).sort()).toEqual(
      ['id', 'order', 'phases', 'price', 'serviceId', 'serviceName', 'serviceOptionId', 'serviceType'].sort(),
    );
  });
});

describe('service description', () => {
  it('is plain text: trimmed, blank = none, line breaks kept, Windows endings normalised', () => {
    expect(normalizeServiceDescription(undefined)).toBeUndefined();
    expect(normalizeServiceDescription(null)).toBeUndefined();
    expect(normalizeServiceDescription(' \n \t ')).toBeUndefined();
    expect(normalizeServiceDescription('  Inclus : limage.\r\n\r\nExclu : nail art.  ')).toBe(
      'Inclus : limage.\n\nExclu : nail art.',
    );
    // Never interpreted: markup-looking text is kept verbatim.
    expect(normalizeServiceDescription('<b>Gel</b> & <script>x</script>')).toBe('<b>Gel</b> & <script>x</script>');
  });

  it('is bounded', () => {
    expect(isValidServiceDescription(undefined)).toBe(true);
    expect(isValidServiceDescription('x'.repeat(SERVICE_DESCRIPTION_MAX_LENGTH))).toBe(true);
    expect(isValidServiceDescription('x'.repeat(SERVICE_DESCRIPTION_MAX_LENGTH + 1))).toBe(false);
    expect(isValidServiceDescription(`  ${'x'.repeat(SERVICE_DESCRIPTION_MAX_LENGTH)}  `)).toBe(true);
  });
});
