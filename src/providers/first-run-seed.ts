// Souris — production first-run seed
//
// Runs once, on the very first launch of a fresh install
// (docs/architecture/PERSISTENCE.md §5). Since Account & Onboarding V1 it is
// EMPTY: a new professional starts with no Clients, no Services, no Products,
// no Appointments, and no Sales. The legacy pilot address book and catalogs
// are business-specific and reach a database only through the development
// seed (development-seed.ts) — never through a real user's first launch.
//
// Existing installs are untouched: their `seed_version` marker is already
// present, so this seed is never consulted again.

import type { FirstRunSeed } from '@/persistence/seed';

export function createFirstRunSeed(): FirstRunSeed {
  return {
    clients: [],
    services: [],
    products: [],
    appointments: [],
    sales: [],
  };
}
