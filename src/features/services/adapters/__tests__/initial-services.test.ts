import {
  createInitialServiceCatalog,
  createInitialServiceImport,
  DEVELOPMENT_BUSINESS_ID,
} from '../../data/initial-services';

describe('initial Service catalog', () => {
  it('composes the real legacy sources once, in deterministic source order', () => {
    const first = createInitialServiceCatalog();
    const second = createInitialServiceCatalog();

    expect(first).toHaveLength(16);
    expect(first.filter((service) => service.type === 'SERVICE')).toHaveLength(5);
    expect(first.filter((service) => service.type === 'TECHNIQUE')).toHaveLength(11);
    expect(first.map((service) => service.id)).toEqual(
      second.map((service) => service.id),
    );
    expect(first[0].name).toBe('Brushing 1');
    expect(first[5].name).toBe('Balayage 1');
    expect(first.every((service) => service.businessId === DEVELOPMENT_BUSINESS_ID)).toBe(
      true,
    );
  });

  it('contains no duplicate service identity or equivalent source record', () => {
    const services = createInitialServiceCatalog();
    const ids = services.map((service) => service.id);
    const equivalents = services.map(
      (service) => `${service.type}:${service.name}:${service.price}`,
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(equivalents).size).toBe(equivalents.length);
  });

  it('reports the only unmappable Multiprix record instead of duplicating it', () => {
    const result = createInitialServiceImport();

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        source: 'technique',
        category: 'Coloration',
        name: 'Gloss',
        reason: 'Non-numeric price: Multiprix',
      }),
    ]);
    expect(result.services.some((service) => service.name === 'Gloss')).toBe(false);
  });
});
