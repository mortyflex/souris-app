import { normalizedClients } from '../normalized-clients';

describe('normalizedClients (real legacy data)', () => {
  it('loads and normalizes legacy clients', () => {
    expect(normalizedClients.length).toBeGreaterThan(0);
  });

  it('all clients have a valid id', () => {
    for (const client of normalizedClients) {
      expect(client.id).toBeDefined();
      expect(client.id.length).toBeGreaterThan(0);
    }
  });

  it('all clients have a firstName', () => {
    for (const client of normalizedClients) {
      expect(client.firstName).toBeDefined();
      expect(client.firstName.length).toBeGreaterThan(0);
    }
  });

  it('no client has commercial history fields', () => {
    for (const client of normalizedClients) {
      expect('totalSpent' in client).toBe(false);
      expect('visitNb' in client).toBe(false);
      expect('createdAt' in client).toBe(false);
      expect('stats' in client).toBe(false);
    }
  });

  it('no client has an invented birthDate', () => {
    for (const client of normalizedClients) {
      expect('birthDate' in client).toBe(false);
    }
  });

  it('all client IDs are unique', () => {
    const ids = normalizedClients.map((c) => c.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });
});
