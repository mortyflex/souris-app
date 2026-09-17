import { createInitialClients } from '../initial-clients';
import { developmentClients } from '../development-clients';

describe('createInitialClients (synthetic legacy-shaped data only)', () => {
  const clients = createInitialClients();

  it('contains the mapped legacy dataset and none of the development fixtures', () => {
    expect(clients.length).toBeGreaterThan(600);
    const ids = new Set(clients.map((client) => client.id));
    for (const dev of developmentClients) {
      expect(ids.has(dev.id)).toBe(false);
    }
  });

  it('carries only fictional contact data: reserved phone ranges and example.com emails', () => {
    const phones = clients.flatMap((client) => (client.phone ? [client.phone] : []));
    const emails = clients.flatMap((client) => (client.email ? [client.email] : []));

    expect(phones.length).toBeGreaterThan(0);
    expect(emails.length).toBeGreaterThan(0);
    for (const phone of phones) {
      // ARCEP (06 39 98 xx xx) and Ofcom (+44 7700 900xxx) ranges reserved for fiction.
      expect(phone).toMatch(/^\+3363998\d{4}$|^\+447700900\d{3}$/);
    }
    for (const email of emails) {
      expect(email.endsWith('@example.com')).toBe(true);
    }
    for (const client of clients) {
      expect(client.id.startsWith('synthetic-client-')).toBe(true);
    }
  });

  it('keeps the legacy export edge cases: no last name, no phone, no email', () => {
    expect(clients.some((client) => client.lastName === undefined)).toBe(true);
    expect(clients.some((client) => client.phone === undefined)).toBe(true);
    expect(clients.some((client) => client.email === undefined)).toBe(true);
    for (const client of clients) {
      expect(client.lastName).toBe(client.lastName?.trim());
      expect(client.phone).toBe(client.phone?.trim());
      expect(client.email).toBe(client.email?.trim());
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

  it('no client has an invented birthday', () => {
    for (const client of clients) {
      expect('birthday' in client).toBe(false);
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
