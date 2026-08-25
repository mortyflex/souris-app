import { catalog, catalogDiagnostics } from '../catalog';

describe('catalog (real legacy data)', () => {
  it('loads and normalizes legacy services', () => {
    // Should have at least the 5 services from legacy data
    expect(catalog.services.filter((s) => s.type === 'SERVICE').length).toBeGreaterThanOrEqual(5);
  });

  it('loads and normalizes legacy techniques', () => {
    // Should have at least some techniques from legacy data
    expect(catalog.services.filter((s) => s.type === 'TECHNIQUE').length).toBeGreaterThanOrEqual(1);
  });

  it('all service IDs are unique', () => {
    const ids = catalog.services.map((s) => s.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it('has no services with NaN or undefined prices', () => {
    for (const service of catalog.services) {
      expect(Number.isFinite(service.price)).toBe(true);
    }
  });

  it('reports Multiprix in diagnostics', () => {
    const multiprixDiagnostic = catalogDiagnostics.find(
      (d) => d.name === 'Gloss' && d.reason.includes('Multiprix'),
    );

    expect(multiprixDiagnostic).toBeDefined();
  });

  it('SERVICE types have exactly one phase with requiresStaff: true', () => {
    const services = catalog.services.filter((s) => s.type === 'SERVICE');

    for (const service of services) {
      expect(service.phases).toHaveLength(1);
      expect(service.phases[0].requiresStaff).toBe(true);
    }
  });

  it('TECHNIQUE types have at least one phase', () => {
    const techniques = catalog.services.filter((s) => s.type === 'TECHNIQUE');

    for (const technique of techniques) {
      expect(technique.phases.length).toBeGreaterThanOrEqual(1);
      expect(technique.phases[0].requiresStaff).toBe(true);
    }
  });

  it('no technique has a processing phase when break was 0', () => {
    // Techniques with break=0 in legacy should only have the active phase
    const techniques = catalog.services.filter((s) => s.type === 'TECHNIQUE');

    for (const technique of techniques) {
      // If it has only 1 phase, that's fine (break was 0)
      // If it has 2 phases, the second must be processing
      if (technique.phases.length === 2) {
        expect(technique.phases[1].requiresStaff).toBe(false);
        expect(technique.phases[1].name).toBe('Temps de pose');
      } else {
        expect(technique.phases).toHaveLength(1);
      }
    }
  });
});
