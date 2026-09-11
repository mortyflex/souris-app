import { createInitialClients } from '../initial-clients';
import { developmentClients } from '../development-clients';

describe('createInitialClients (real legacy data only)', () => {
  const clients = createInitialClients();

  it('contains the mapped legacy dataset and none of the development fixtures', () => {
    expect(clients.length).toBeGreaterThan(600);
    const ids = new Set(clients.map((client) => client.id));
    for (const dev of developmentClients) {
      expect(ids.has(dev.id)).toBe(false);
    }
  });

  it('every client has a non-empty id and firstName', () => {
    for (const client of clients) {
      expect(client.id.length).toBeGreaterThan(0);
      expect(client.firstName.length).toBeGreaterThan(0);
    }
  });

  it('no client carries legacy commercial history or bookkeeping fields', () => {
    for (const client of clients) {
      expect('totalSpent' in client).toBe(false);
      expect('ticketAverage' in client).toBe(false);
      expect('visitNb' in client).toBe(false);
      expect('lastVisitDate' in client).toBe(false);
      expect('stats' in client).toBe(false);
      expect('notes' in client).toBe(false);
      expect('importedVisitNotes' in client).toBe(false);
      expect('createdAt' in client).toBe(false);
      expect('_id' in client).toBe(false);
    }
  });

  it('no client has an invented birthDate', () => {
    for (const client of clients) {
      expect('birthDate' in client).toBe(false);
    }
  });

  it('all client ids are unique', () => {
    const ids = clients.map((client) => client.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('development fixture ids never collide with legacy ids', () => {
    const ids = new Set(clients.map((client) => client.id));
    for (const dev of developmentClients) {
      expect(dev.id.startsWith('client-agenda-')).toBe(true);
      expect(ids.has(dev.id)).toBe(false);
    }
  });
});
