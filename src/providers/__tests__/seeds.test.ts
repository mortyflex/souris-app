import { bootstrapPersistence } from '@/persistence/bootstrap';
import { readSeedVersion } from '@/persistence/seed';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { developmentClients } from '@/features/clients/data/development-clients';

import { createDevelopmentSeed } from '../development-seed';
import { createFirstRunSeed } from '../first-run-seed';

const isFixtureClient = (id: string) => id.startsWith('client-agenda-');

describe('production first-run seed', () => {
  it('contains only approved legacy data: no fixture clients, no appointments, no sales', () => {
    const seed = createFirstRunSeed();

    expect(seed.clients.length).toBeGreaterThan(600);
    expect(seed.clients.some((client) => isFixtureClient(client.id))).toBe(false);
    for (const dev of developmentClients) {
      expect(seed.clients.find((client) => client.id === dev.id)).toBeUndefined();
    }
    expect(seed.services.length).toBeGreaterThan(0);
    expect(seed.products.length).toBeGreaterThan(0);
    expect(seed.appointments).toEqual([]);
    expect(seed.sales).toEqual([]);
  });

  it('seeds a fresh database once and never duplicates across restarts', () => {
    const db = openTestDatabase();
    const first = bootstrapPersistence(db, createFirstRunSeed);
    const second = bootstrapPersistence(db, createFirstRunSeed);

    expect(readSeedVersion(db)).toBe(1);
    expect(second.clients).toHaveLength(first.clients.length);
    expect(second.services).toHaveLength(first.services.length);
    expect(second.products).toHaveLength(first.products.length);
    expect(second.appointments).toEqual([]);
    expect(
      db.getFirstSync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM clients WHERE id LIKE 'client-agenda-%'",
      )?.count,
    ).toBe(0);
  });
});

describe('development seed', () => {
  it('adds the Agenda fixtures and their clients on top of the production seed', () => {
    const production = createFirstRunSeed();
    const development = createDevelopmentSeed(new Date(2026, 8, 11, 10));

    expect(development.services).toEqual(production.services);
    expect(development.products).toEqual(production.products);
    expect(development.clients).toHaveLength(production.clients.length + developmentClients.length);
    expect(development.appointments.length).toBeGreaterThan(0);
    for (const appointment of development.appointments) {
      expect(isFixtureClient(appointment.clientId)).toBe(true);
      expect(development.clients.find((client) => client.id === appointment.clientId)).toBeDefined();
    }
  });
});
