import { buildCatalog, findServiceById, groupServicesByCategory } from '../catalog-adapter';

describe('buildCatalog', () => {
  it('combines services and techniques into a unified catalog', () => {
    const serviceCategories = [
      {
        category: 'Brushing',
        services: [
          { name: 'Brushing 1', duration: 30, break: 0, price: 20 },
          { name: 'Brushing 2', duration: 45, break: 0, price: 25 },
        ],
      },
    ];

    const techniqueCategories = [
      {
        category: 'Balayage',
        techniques: [
          { name: 'Balayage 1', duration: 90, break: 60, price: 45 },
        ],
      },
    ];

    const catalog = buildCatalog(serviceCategories, techniqueCategories);

    expect(catalog.services).toHaveLength(3);
    expect(catalog.services[0].type).toBe('SERVICE');
    expect(catalog.services[1].type).toBe('SERVICE');
    expect(catalog.services[2].type).toBe('TECHNIQUE');
  });

  it('aggregates diagnostics from both services and techniques', () => {
    const serviceCategories = [
      {
        category: 'Coloration',
        services: [
          { name: 'Gloss', duration: 10, break: 10, price: 'Multiprix' },
        ],
      },
    ];

    const techniqueCategories = [
      {
        category: 'Soin',
        techniques: [
          { name: 'Invalid', duration: 30, break: 0, price: 'Sur devis' },
        ],
      },
    ];

    const catalog = buildCatalog(serviceCategories, techniqueCategories);

    expect(catalog.services).toHaveLength(0);
    expect(catalog.diagnostics).toHaveLength(2);
    expect(catalog.diagnostics[0].source).toBe('service');
    expect(catalog.diagnostics[1].source).toBe('technique');
  });
});

describe('findServiceById', () => {
  it('finds a service by ID', () => {
    const catalog = buildCatalog(
      [
        {
          category: 'Brushing',
          services: [
            { name: 'Brushing 1', duration: 30, break: 0, price: 20 },
          ],
        },
      ],
      [],
    );

    const service = findServiceById(catalog, 'service-brushing-brushing-1');

    expect(service).toBeDefined();
    expect(service!.name).toBe('Brushing 1');
  });

  it('returns undefined for non-existent ID', () => {
    const catalog = buildCatalog([], []);

    const service = findServiceById(catalog, 'non-existent');

    expect(service).toBeUndefined();
  });
});

describe('groupServicesByCategory', () => {
  it('groups services and techniques by category', () => {
    const serviceCategories = [
      {
        category: 'Brushing',
        services: [
          { name: 'Brushing 1', duration: 30, break: 0, price: 20 },
          { name: 'Brushing 2', duration: 45, break: 0, price: 25 },
        ],
      },
    ];

    const techniqueCategories = [
      {
        category: 'Balayage',
        techniques: [
          { name: 'Balayage 1', duration: 90, break: 60, price: 45 },
        ],
      },
    ];

    const groups = groupServicesByCategory(serviceCategories, techniqueCategories);

    expect(groups).toHaveLength(2);
    expect(groups[0].category).toBe('Brushing');
    expect(groups[0].services).toHaveLength(2);
    expect(groups[1].category).toBe('Balayage');
    expect(groups[1].services).toHaveLength(1);
  });

  it('excludes empty categories', () => {
    const serviceCategories = [
      {
        category: 'Coloration',
        services: [
          { name: 'Gloss', duration: 10, break: 10, price: 'Multiprix' },
        ],
      },
    ];

    const techniqueCategories = [
      {
        category: 'Balayage',
        techniques: [
          { name: 'Balayage 1', duration: 90, break: 60, price: 45 },
        ],
      },
    ];

    const groups = groupServicesByCategory(serviceCategories, techniqueCategories);

    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('Balayage');
  });

  it('ensures all service IDs are unique', () => {
    const serviceCategories = [
      {
        category: 'Brushing',
        services: [
          { name: 'Brushing 1', duration: 30, break: 0, price: 20 },
          { name: 'Brushing 2', duration: 45, break: 0, price: 25 },
        ],
      },
    ];

    const techniqueCategories = [
      {
        category: 'Balayage',
        techniques: [
          { name: 'Balayage 1', duration: 90, break: 60, price: 45 },
        ],
      },
    ];

    const catalog = buildCatalog(serviceCategories, techniqueCategories);
    const ids = catalog.services.map((s) => s.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });
});
