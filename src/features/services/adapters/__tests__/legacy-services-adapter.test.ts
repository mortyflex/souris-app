import {
  generateServiceId,
  normalizeLegacyService,
  normalizeLegacyServices,
} from '../legacy-services-adapter';

const businessId = 'business-test';
const legacyService = Object.freeze({
  name: 'Brushing 1',
  duration: 30,
  break: 0,
  price: 20,
  color: '#ec4899',
});

describe('legacy SERVICE adapter', () => {
  it('maps the real legacy shape to one canonical staff-required phase', () => {
    const result = normalizeLegacyService(legacyService, 'Brushing', businessId);

    expect(result).toEqual({
      id: 'service-brushing-brushing-1',
      businessId,
      name: 'Brushing 1',
      type: 'SERVICE',
      price: 20,
      phases: [
        {
          id: 'service-brushing-brushing-1-phase',
          name: 'Brushing 1',
          durationMinutes: 30,
          requiresStaff: true,
        },
      ],
      active: true,
    });
  });

  it('is deterministic, preserves input, and discards legacy-only fields', () => {
    const before = JSON.stringify(legacyService);
    const first = normalizeLegacyService(legacyService, 'Brushing', businessId);
    const second = normalizeLegacyService(legacyService, 'Brushing', businessId);

    expect(first).toEqual(second);
    expect(JSON.stringify(legacyService)).toBe(before);
    expect(first).not.toHaveProperty('duration');
    expect(first).not.toHaveProperty('break');
    expect(first).not.toHaveProperty('color');
  });

  it('preserves source order across categories without duplicate identities', () => {
    const result = normalizeLegacyServices(
      [
        { category: 'Brushing', services: [legacyService] },
        {
          category: 'Coupe & Coiffage',
          services: [
            {
              name: 'Chignon',
              duration: 60,
              break: 0,
              price: 60,
              color: '#8b5cf6',
            },
          ],
        },
      ],
      businessId,
    );

    expect(result.services.map((service) => service.name)).toEqual([
      'Brushing 1',
      'Chignon',
    ]);
    expect(new Set(result.services.map((service) => service.id)).size).toBe(2);
  });

  it('derives stable legacy ids from source identity', () => {
    expect(generateServiceId('Coupe & Coiffage', 'Coupe Femme / Homme')).toBe(
      'service-coupe-coiffage-coupe-femme-homme',
    );
    expect(generateServiceId('Brushing', 'Brushing 1')).toBe(
      generateServiceId('Brushing', 'Brushing 1'),
    );
  });
});
