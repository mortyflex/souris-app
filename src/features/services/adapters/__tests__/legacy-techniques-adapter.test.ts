import {
  normalizeLegacyTechnique,
  normalizeLegacyTechniqueCategory,
  normalizeLegacyTechniques,
  generateTechniqueId,
} from '../legacy-techniques-adapter';

describe('generateTechniqueId', () => {
  it('generates deterministic ID from category and name', () => {
    const id = generateTechniqueId('Balayage', 'Balayage 1');

    expect(id).toBe('technique-balayage-balayage-1');
  });

  it('handles special characters', () => {
    const id = generateTechniqueId('Coloration', 'Couleur Racines');

    expect(id).toBe('technique-coloration-couleur-racines');
  });

  it('produces same ID for same input', () => {
    const id1 = generateTechniqueId('Balayage', 'Balayage 1');
    const id2 = generateTechniqueId('Balayage', 'Balayage 1');

    expect(id1).toBe(id2);
  });
});

describe('normalizeLegacyTechnique', () => {
  it('normalizes a technique with valid price and break > 0', () => {
    const legacy = {
      name: 'Balayage 1',
      duration: 90,
      break: 60,
      price: 45,
      color: '#3b82f6',
    };

    const result = normalizeLegacyTechnique(legacy, 'Balayage');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('technique-balayage-balayage-1');
    expect(result!.name).toBe('Balayage 1');
    expect(result!.type).toBe('TECHNIQUE');
    expect(result!.price).toBe(45);
  });

  it('creates two phases when break > 0', () => {
    const legacy = {
      name: 'Balayage 1',
      duration: 90,
      break: 60,
      price: 45,
    };

    const result = normalizeLegacyTechnique(legacy, 'Balayage');

    expect(result!.phases).toHaveLength(2);

    // Active phase
    expect(result!.phases[0].name).toBe('Balayage 1');
    expect(result!.phases[0].durationMinutes).toBe(90);
    expect(result!.phases[0].requiresStaff).toBe(true);

    // Processing phase
    expect(result!.phases[1].name).toBe('Temps de pose');
    expect(result!.phases[1].durationMinutes).toBe(60);
    expect(result!.phases[1].requiresStaff).toBe(false);
  });

  it('creates only one phase when break === 0', () => {
    const legacy = {
      name: 'Coupe Brushing 1',
      duration: 50,
      break: 0,
      price: 40,
    };

    const result = normalizeLegacyTechnique(legacy, 'Coupe');

    expect(result!.phases).toHaveLength(1);
    expect(result!.phases[0].name).toBe('Coupe Brushing 1');
    expect(result!.phases[0].durationMinutes).toBe(50);
    expect(result!.phases[0].requiresStaff).toBe(true);
  });

  it('ignores color field', () => {
    const legacy = {
      name: 'Balayage 1',
      duration: 90,
      break: 60,
      price: 45,
      color: '#3b82f6', // Should be ignored
    };

    const result = normalizeLegacyTechnique(legacy, 'Balayage');

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

    const result = normalizeLegacyTechnique(legacy, 'Coloration');

    expect(result).toBeNull();
  });

  it('returns null for invalid price (NaN)', () => {
    const legacy = {
      name: 'Invalid',
      duration: 30,
      break: 0,
      price: NaN,
    };

    const result = normalizeLegacyTechnique(legacy, 'Test');

    expect(result).toBeNull();
  });
});

describe('normalizeLegacyTechniqueCategory', () => {
  it('normalizes all valid techniques in a category', () => {
    const category = {
      category: 'Balayage',
      techniques: [
        { name: 'Balayage 1', duration: 90, break: 60, price: 45 },
        { name: 'Balayage 2', duration: 105, break: 60, price: 50 },
      ],
    };

    const result = normalizeLegacyTechniqueCategory(category);

    expect(result.techniques).toHaveLength(2);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('excludes techniques with non-numeric prices and reports in diagnostics', () => {
    const category = {
      category: 'Coloration',
      techniques: [
        { name: 'Couleur Racines', duration: 45, break: 20, price: 30 },
        { name: 'Gloss', duration: 10, break: 10, price: 'Multiprix' },
      ],
    };

    const result = normalizeLegacyTechniqueCategory(category);

    expect(result.techniques).toHaveLength(1);
    expect(result.techniques[0].name).toBe('Couleur Racines');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].name).toBe('Gloss');
    expect(result.diagnostics[0].reason).toContain('Multiprix');
  });
});

describe('normalizeLegacyTechniques', () => {
  it('batch-normalizes multiple categories', () => {
    const categories = [
      {
        category: 'Balayage',
        techniques: [
          { name: 'Balayage 1', duration: 90, break: 60, price: 45 },
          { name: 'Balayage 2', duration: 105, break: 60, price: 50 },
        ],
      },
      {
        category: 'Coloration',
        techniques: [
          { name: 'Couleur Racines', duration: 45, break: 20, price: 30 },
        ],
      },
    ];

    const result = normalizeLegacyTechniques(categories);

    expect(result.techniques).toHaveLength(3);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('aggregates diagnostics from all categories', () => {
    const categories = [
      {
        category: 'Coloration',
        techniques: [
          { name: 'Gloss', duration: 10, break: 10, price: 'Multiprix' },
        ],
      },
      {
        category: 'Soin',
        techniques: [
          { name: 'Invalid', duration: 30, break: 0, price: 'Sur devis' },
        ],
      },
    ];

    const result = normalizeLegacyTechniques(categories);

    expect(result.techniques).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(2);
  });
});
