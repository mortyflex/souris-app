import { buildCatalog, findServiceById } from '../catalog-adapter';

const businessId = 'business-test';

describe('buildCatalog', () => {
  it('combines both one-way sources into one canonical Service array', () => {
    const result = buildCatalog(
      [
        {
          category: 'Brushing',
          services: [
            {
              name: 'Brushing 1',
              duration: 30,
              break: 0,
              price: 20,
              color: '#ec4899',
            },
          ],
        },
      ],
      [
        {
          category: 'Balayage',
          techniques: [
            {
              name: 'Balayage 1',
              duration: 90,
              break: 60,
              price: 45,
              color: '#3b82f6',
            },
          ],
        },
      ],
      businessId,
    );

    expect(result.services.map((service) => service.type)).toEqual([
      'SERVICE',
      'TECHNIQUE',
    ]);
    expect(result.services.every((service) => service.businessId === businessId)).toBe(true);
    expect(findServiceById(result, 'technique-balayage-balayage-1')?.name).toBe(
      'Balayage 1',
    );
  });

  it('keeps import diagnostics outside canonical Service values', () => {
    const result = buildCatalog(
      [],
      [
        {
          category: 'Coloration',
          techniques: [
            {
              name: 'Gloss',
              duration: 10,
              break: 10,
              price: 'Multiprix',
              color: '#10b981',
            },
          ],
        },
      ],
      businessId,
    );

    expect(result.services).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
  });
});
