import {
  normalizeLegacyService,
  normalizeLegacyServiceCategory,
  normalizeLegacyServices,
  generateServiceId,
} from '../legacy-services-adapter';

describe('generateServiceId', () => {
  it('generates deterministic ID from category and name', () => {
    const id = generateServiceId('Coupe & Coiffage', 'Brushing 1');

    expect(id).toBe('service-coupe-coiffage-brushing-1');
  });

  it('handles special characters', () => {
    const id = generateServiceId('Coupe & Coiffage', 'Coupe Femme / Homme');

    expect(id).toBe('service-coupe-coiffage-coupe-femme-homme');
  });

  it('collapses multiple hyphens', () => {
    const id = generateServiceId('Soin', 'Soin Classique');

    expect(id).toBe('service-soin-soin-classique');
  });

  it('produces same ID for same input', () => {
    const id1 = generateServiceId('Brushing', 'Brushing 1');
    const id2 = generateServiceId('Brushing', 'Brushing 1');

    expect(id1).toBe(id2);
  });
});

describe('normalizeLegacyService', () => {
  it('normalizes a service with valid numeric price', () => {
    const legacy = {
      name: 'Brushing 1',
      duration: 30,
      break: 0,
      price: 20,
      color: '#ec4899',
    };

    const result = normalizeLegacyService(legacy, 'Brushing');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('service-brushing-brushing-1');
    expect(result!.name).toBe('Brushing 1');
    expect(result!.type).toBe('SERVICE');
    expect(result!.price).toBe(20);
  });

  it('creates exactly one phase with requiresStaff: true', () => {
    const legacy = {
      name: 'Brushing 2',
      duration: 45,
      break: 0,
      price: 25,
    };

    const result = normalizeLegacyService(legacy, 'Brushing');

    expect(result!.phases).toHaveLength(1);
    expect(result!.phases[0].requiresStaff).toBe(true);
    expect(result!.phases[0].durationMinutes).toBe(45);
    expect(result!.phases[0].name).toBe('Brushing 2');
  });

  it('ignores break field (services have no processing time)', () => {
    const legacy = {
      name: 'Brushing',
      duration: 30,
      break: 15, // Should be ignored
      price: 20,
    };

    const result = normalizeLegacyService(legacy, 'Brushing');

    expect(result!.phases).toHaveLength(1);
    expect(result!.phases[0].durationMinutes).toBe(30);
    // No second phase for processing time
  });

  it('ignores color field', () => {
    const legacy = {
      name: 'Brushing',
      duration: 30,
      break: 0,
      price: 20,
      color: '#ec4899', // Should be ignored
    };

    const result = normalizeLegacyService(legacy, 'Brushing');

    expect(result).not.toBeNull();
    if (!result) return;
    expect('color' in result).toBe(false);
  });

  it('returns null for non-numeric price (Multiprix)', () => {
    const legacy = {
      name: 'Gloss',
      duration: 10,
      break: 10,
      price: 'Multiprix',
    };

    const result = normalizeLegacyService(legacy, 'Coloration');

    expect(result).toBeNull();
  });

  it('returns null for invalid price (NaN)', () => {
    const legacy = {
      name: 'Invalid',
      duration: 30,
      break: 0,
      price: NaN,
    };

    const result = normalizeLegacyService(legacy, 'Test');

    expect(result).toBeNull();
  });
});

describe('normalizeLegacyServiceCategory', () => {
  it('normalizes all valid services in a category', () => {
    const category = {
      category: 'Brushing',
      services: [
        { name: 'Brushing 1', duration: 30, break: 0, price: 20 },
        { name: 'Brushing 2', duration: 45, break: 0, price: 25 },
      ],
    };

    const result = normalizeLegacyServiceCategory(category);

    expect(result.services).toHaveLength(2);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('excludes services with non-numeric prices and reports in diagnostics', () => {
    const category = {
      category: 'Coloration',
      services: [
        { name: 'Couleur Racines', duration: 45, break: 20, price: 30 },
        { name: 'Gloss', duration: 10, break: 10, price: 'Multiprix' },
      ],
    };

    const result = normalizeLegacyServiceCategory(category);

    expect(result.services).toHaveLength(1);
    expect(result.services[0].name).toBe('Couleur Racines');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].name).toBe('Gloss');
    expect(result.diagnostics[0].reason).toContain('Multiprix');
  });
});

describe('normalizeLegacyServices', () => {
  it('batch-normalizes multiple categories', () => {
    const categories = [
      {
        category: 'Brushing',
        services: [
          { name: 'Brushing 1', duration: 30, break: 0, price: 20 },
          { name: 'Brushing 2', duration: 45, break: 0, price: 25 },
        ],
      },
      {
        category: 'Coupe & Coiffage',
        services: [
          { name: 'Coupe Femme / Homme', duration: 20, break: 0, price: 25 },
        ],
      },
    ];

    const result = normalizeLegacyServices(categories);

    expect(result.services).toHaveLength(3);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('aggregates diagnostics from all categories', () => {
    const categories = [
      {
        category: 'Coloration',
        services: [
          { name: 'Gloss', duration: 10, break: 10, price: 'Multiprix' },
        ],
      },
      {
        category: 'Soin',
        services: [
          { name: 'Invalid', duration: 30, break: 0, price: 'Sur devis' },
        ],
      },
    ];

    const result = normalizeLegacyServices(categories);

    expect(result.services).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(2);
  });
});
