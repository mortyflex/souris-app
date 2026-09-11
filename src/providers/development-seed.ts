// Souris — development seed
//
// The production seed PLUS the development fixtures: the Agenda demo
// Appointments (relative to `now`) and the clients they reference. Reached
// only through the __DEV__ reset on the Plus tab and through
// TestPersistenceProvider — never through the production first-run path.

import { startOfLocalDay } from '@/features/agenda/calendar/week';
import { createAgendaFixtures } from '@/features/agenda/fixtures/agenda-fixtures';
import { developmentClients } from '@/features/clients/data/development-clients';
import type { FirstRunSeed } from '@/persistence/seed';

import { createFirstRunSeed } from './first-run-seed';

export function createDevelopmentSeed(now = new Date()): FirstRunSeed {
  const production = createFirstRunSeed();
  return {
    ...production,
    clients: [...production.clients, ...developmentClients],
    appointments: createAgendaFixtures(startOfLocalDay(now)).map((entry) => entry.appointment),
  };
}
