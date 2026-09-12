import { bootstrapPersistence } from '@/persistence/bootstrap';
import { readSeedVersion } from '@/persistence/seed';
import { listLocalBusinessIds } from '@/persistence/stores/business-profile';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { developmentClients } from '@/features/clients/data/development-clients';
import { createInitialClients } from '@/features/clients/data/initial-clients';
import { DEVELOPMENT_BUSINESS_ID } from '@/features/services/data/initial-services';

import { createDevelopmentSeed } from '../development-seed';
import { createFirstRunSeed } from '../first-run-seed';

const isFixtureClient = (id: string) => id.startsWith('client-agenda-');

describe('production first-run seed', () => {
  it('is empty: no pilot Clients, Services, Products, Appointments, or Sales', () => {
    expect(createFirstRunSeed()).toEqual({
      clients: [],
      services: [],
      products: [],
      appointments: [],
      sales: [],
    });
  });

  it('initializes a fresh database once, empty, and never re-seeds across restarts', () => {
    const db = openTestDatabase();
    const first = bootstrapPersistence(db, createFirstRunSeed);
    db.runSync("INSERT INTO clients (id, first_name) VALUES ('client-real', 'Nour')");
    const second = bootstrapPersistence(db, createFirstRunSeed);

    expect(readSeedVersion(db)).toBe(1);
    expect(first.clients).toEqual([]);
    expect(first.services).toEqual([]);
    expect(first.products).toEqual([]);
    expect(first.appointments).toEqual([]);
    expect(first.sales).toEqual([]);
    expect(second.clients.map((client) => client.id)).toEqual(['client-real']);
    expect(listLocalBusinessIds(db)).toEqual([]);
  });
});

describe('development seed', () => {
  it('carries the legacy pilot data, the Agenda fixtures, and their clients', () => {
    const development = createDevelopmentSeed(new Date(2026, 8, 11, 10));
    const legacyClients = createInitialClients();

    expect(legacyClients.length).toBeGreaterThan(600);
    expect(development.clients).toHaveLength(legacyClients.length + developmentClients.length);
    expect(development.services.length).toBeGreaterThan(0);
    expect(development.products.length).toBeGreaterThan(0);
    expect(development.appointments.length).toBeGreaterThan(0);
    expect(development.sales).toEqual([]);
    for (const appointment of development.appointments) {
      expect(isFixtureClient(appointment.clientId)).toBe(true);
      expect(development.clients.find((client) => client.id === appointment.clientId)).toBeDefined();
    }
  });

  it('stamps every business-scoped record with the fixture business by default', () => {
    const development = createDevelopmentSeed(new Date(2026, 8, 11, 10));

    expect(development.services.every((service) => service.businessId === DEVELOPMENT_BUSINESS_ID)).toBe(true);
    expect(development.products.every((product) => product.businessId === DEVELOPMENT_BUSINESS_ID)).toBe(true);
    expect(development.appointments.every((entry) => entry.businessId === DEVELOPMENT_BUSINESS_ID)).toBe(true);
  });

  it('adopts the bound Business id so a development reset never introduces a second id', () => {
    const boundId = '8f5c2a1e-3b7d-4c9a-9e2f-1a2b3c4d5e6f';
    const db = openTestDatabase();

    bootstrapPersistence(db, () => createDevelopmentSeed(new Date(2026, 8, 11, 10), boundId));

    expect(listLocalBusinessIds(db)).toEqual([boundId]);
  });
});
