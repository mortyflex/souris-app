import { createInitialClients } from '../initial-clients';
import { developmentClients } from '../development-clients';

describe('createInitialClients (real legacy data + development seed)', () => {
  const clients = createInitialClients();

  it('contains the mapped legacy dataset and the development seed', () => {
    expect(clients.length).toBeGreaterThan(600);
    for (const dev of developmentClients) {
      expect(clients).toContainEqual(dev);
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

  it('every development fixture client id is resolvable', () => {
    const byId = new Map(clients.map((client) => [client.id, client]));
    for (const dev of developmentClients) {
      expect(byId.get(dev.id)).toEqual(dev);
    }
  });
});
