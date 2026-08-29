import type { Client } from '@/domain/clients';

import { prepareClientDirectory, sortClients } from '../sort-clients';

function client(id: string, firstName: string, lastName?: string): Client {
  return { id, firstName, lastName };
}

describe('sortClients', () => {
  it('orders by firstName, then lastName', () => {
    const clients = [
      client('3', 'Camille', 'Durand'),
      client('1', 'Léa', 'Martin'),
      client('4', 'Camille', 'Bernard'),
      client('2', 'Anaïs', 'Petit'),
    ];

    expect(sortClients(clients).map((entry) => entry.id)).toEqual(['2', '4', '3', '1']);
  });

  it('is accent-insensitive with French collation', () => {
    const clients = [client('1', 'Élodie'), client('2', 'Emma'), client('3', 'Elsa')];

    expect(sortClients(clients).map((entry) => entry.id)).toEqual(['1', '3', '2']);
  });

  it('is case-insensitive', () => {
    const clients = [client('1', 'Baudry'), client('2', 'bedjaoui')];

    expect(sortClients(clients).map((entry) => entry.id)).toEqual(['1', '2']);
  });

  it('breaks exact ties by id for full determinism', () => {
    const clients = [client('b', 'Léa', 'Martin'), client('a', 'Léa', 'Martin')];

    expect(sortClients(clients).map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the source array', () => {
    const clients = [client('2', 'Zoé'), client('1', 'Ana')];

    sortClients(clients);

    expect(clients.map((entry) => entry.id)).toEqual(['2', '1']);
  });
});

describe('prepareClientDirectory', () => {
  const clients = [
    client('3', 'Camille', 'Durand'),
    client('1', 'Léa', 'Martin'),
    client('2', 'Anaïs', 'Petit'),
  ];

  it('returns all clients appropriately sorted for an empty query', () => {
    const emptyQuery = prepareClientDirectory(clients, '   ');

    expect(emptyQuery.map((entry) => entry.id)).toEqual(['2', '3', '1']);
  });

  it('filters while preserving alphabetical order', () => {
    const results = prepareClientDirectory(
      [...clients, client('4', 'Léa', 'Bernard'), client('5', 'Léonie', 'Martin')],
      'lé',
    );

    expect(results.map((entry) => entry.id)).toEqual(['3', '4', '1', '5']);
  });

  it('does not mutate the source array', () => {
    const before = clients.map((entry) => entry.id);

    prepareClientDirectory(clients, 'lea');

    expect(clients.map((entry) => entry.id)).toEqual(before);
  });
});
