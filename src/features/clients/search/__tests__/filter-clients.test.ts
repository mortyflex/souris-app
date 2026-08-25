import { filterClients } from '../filter-clients';
import { normalizedClients } from '../../adapters/normalized-clients';
import type { NormalizedClient } from '../../adapters/legacy-clients-adapter';

function client(overrides: Partial<NormalizedClient> & { id: string }): NormalizedClient {
  return {
    firstName: 'Default',
    ...overrides,
  };
}

describe('filterClients', () => {
  const clients: readonly NormalizedClient[] = [
    client({ id: '1', firstName: 'Alice', lastName: 'Dupont', phone: '0612345678' }),
    client({ id: '2', firstName: 'Béatrice', lastName: 'Martin', phone: '0698765432' }),
    client({ id: '3', firstName: 'Camille', lastName: 'Durand' }),
    client({ id: '4', firstName: 'Élodie', lastName: 'Bernard', phone: '0123456789' }),
    client({ id: '5', firstName: 'François', lastName: 'Petit', email: 'francois@example.com' }),
  ];

  it('returns all clients for empty query', () => {
    expect(filterClients(clients, '')).toEqual(clients);
  });

  it('returns all clients for whitespace-only query', () => {
    expect(filterClients(clients, '   ')).toEqual(clients);
  });

  it('matches by firstName', () => {
    const result = filterClients(clients, 'alice');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('matches by lastName', () => {
    const result = filterClients(clients, 'martin');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('matches by full name', () => {
    const result = filterClients(clients, 'camille durand');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('matches by phone', () => {
    const result = filterClients(clients, '0612');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('is case-insensitive', () => {
    const result1 = filterClients(clients, 'ALICE');
    const result2 = filterClients(clients, 'Alice');
    const result3 = filterClients(clients, 'alice');

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });

  it('is accent-insensitive', () => {
    // "Élodie" should match "elodie" (no accent)
    const result1 = filterClients(clients, 'elodie');
    const result2 = filterClients(clients, 'Élodie');

    expect(result1).toHaveLength(1);
    expect(result1[0].id).toBe('4');
    expect(result1).toEqual(result2);
  });

  it('is accent-insensitive for Béatrice', () => {
    const result = filterClients(clients, 'beatrice');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('is accent-insensitive for François', () => {
    const result = filterClients(clients, 'francois');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('5');
  });

  it('matches partial names', () => {
    const result = filterClients(clients, 'ali');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('matches partial phone numbers', () => {
    const result = filterClients(clients, '6123');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('returns empty array when no match', () => {
    const result = filterClients(clients, 'xyz123');
    expect(result).toHaveLength(0);
  });

  it('returns multiple matches when query is common', () => {
    // "06" appears in two phones
    const result = filterClients(clients, '06');
    expect(result).toHaveLength(2);
  });

  it('does not match email (not a searchable field)', () => {
    const result = filterClients(clients, 'example.com');
    expect(result).toHaveLength(0);
  });

  it('handles missing lastName gracefully', () => {
    const clientsWithMissing = [
      client({ id: '1', firstName: 'Alice' }),
      client({ id: '2', firstName: 'Bob', lastName: 'Smith' }),
    ];

    const result = filterClients(clientsWithMissing, 'alice');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('handles missing phone gracefully', () => {
    const clientsWithMissing = [
      client({ id: '1', firstName: 'Alice' }),
      client({ id: '2', firstName: 'Bob', phone: '0612345678' }),
    ];

    const result = filterClients(clientsWithMissing, '0612');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});

describe('filterClients over the normalized legacy source', () => {
  it('searches the complete dataset: a client beyond index 60 remains findable', () => {
    expect(normalizedClients.length).toBeGreaterThan(60);

    const target = normalizedClients[120];
    expect(target).toBeDefined();

    const query = `${target.firstName} ${target.lastName ?? ''}`.trim();
    const results = filterClients(normalizedClients, query);

    expect(results.map((entry) => entry.id)).toContain(target.id);
  });

  it('keeps every client reachable by phone search beyond index 60', () => {
    const beyond = normalizedClients
      .slice(61)
      .find((entry) => entry.phone !== undefined && entry.phone.length > 0);
    expect(beyond).toBeDefined();
    if (!beyond) return;

    const results = filterClients(normalizedClients, beyond.phone ?? '');
    expect(results.map((entry) => entry.id)).toContain(beyond.id);
  });
});
