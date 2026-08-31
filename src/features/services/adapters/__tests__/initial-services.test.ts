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
    // Approved product distinction: SERVICE = no pose, TECHNIQUE = has pose.
    expect(first.filter((service) => service.type === 'SERVICE')).toHaveLength(8);
    expect(first.filter((service) => service.type === 'TECHNIQUE')).toHaveLength(8);
    expect(first.map((service) => service.id)).toEqual(
      second.map((service) => service.id),
    );
    expect(first[0].name).toBe('Brushing 1');
    expect(first.every((service) => service.businessId === DEVELOPMENT_BUSINESS_ID)).toBe(
      true,
    );
  });

  it('classifies the real records according to their timing semantics', () => {
    const services = createInitialServiceCatalog();
    const byName = new Map(services.map((service) => [service.name, service]));

    for (const name of ['Brushing 1', 'Brushing 2', 'Brushing 3', 'Coupe Femme / Homme']) {
      const service = byName.get(name);
      expect(service?.type).toBe('SERVICE');
      expect(service?.phases).toHaveLength(1);
      expect(service?.phases[0].requiresStaff).toBe(true);
    }

    // Zero-break legacy technique records are continuous professional work.
    for (const name of ['Coupe Brushing 1', 'Coupe Brushing 2', 'Coupe Brushing 3']) {
      const service = byName.get(name);
      expect(service?.type).toBe('SERVICE');
      expect(service?.phases.some((phase) => !phase.requiresStaff)).toBe(false);
    }

    // Real pose-based records stay TECHNIQUE with at least one processing phase.
    const balayage = byName.get('Balayage 1');
    expect(balayage?.type).toBe('TECHNIQUE');
    expect(balayage?.phases.some((phase) => !phase.requiresStaff)).toBe(true);
  });

  it('produces the expected fresh-session 8 Services / 8 Techniques catalog', () => {
    const services = createInitialServiceCatalog();
    const namesByType = (type: 'SERVICE' | 'TECHNIQUE') =>
      services
        .filter((service) => service.type === type)
        .map((service) => service.name)
        .sort();

    expect(namesByType('SERVICE')).toEqual([
      'Brushing 1',
      'Brushing 2',
      'Brushing 3',
      'Chignon',
      'Coupe Brushing 1',
      'Coupe Brushing 2',
      'Coupe Brushing 3',
      'Coupe Femme / Homme',
    ]);
    expect(namesByType('TECHNIQUE')).toEqual([
      'Balayage 1',
      'Balayage 2',
      'Balayage 3',
      'Couleur Racines',
      'Dose Supplémentaire',
      'Soin Classique',
      'Soin Profond',
      'Traitement SOS',
    ]);
  });

  it('never contains a SERVICE with a processing phase', () => {
    for (const service of createInitialServiceCatalog()) {
      if (service.type === 'SERVICE') {
        expect(service.phases.some((phase) => !phase.requiresStaff)).toBe(false);
      }
    }
  });

  it('gives every imported TECHNIQUE a processing phase with positive duration', () => {
    for (const service of createInitialServiceCatalog()) {
      if (service.type === 'TECHNIQUE') {
        expect(service.phases.length).toBeGreaterThanOrEqual(1);
        expect(
          service.phases.some((phase) => !phase.requiresStaff && phase.durationMinutes > 0),
        ).toBe(true);
      }
    }
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
