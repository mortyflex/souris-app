// Souris — development seed
//
// The pilot data set for development builds and tests: the legacy client
// address book, the legacy service and product catalogs, the Agenda demo
// Appointments (relative to `now`), and the clients they reference. Reached
// only through the __DEV__ reset on the Plus tab and through
// TestPersistenceProvider — never through the production first-run path.
//
// `businessId` stamps every business-scoped record. The development reset
// passes the Business the device is bound to, so a reset never leaves rows
// under a second, foreign business id.

import { startOfLocalDay } from '@/features/agenda/calendar/week';
import { createAgendaFixtures } from '@/features/agenda/fixtures/agenda-fixtures';
import { developmentClients } from '@/features/clients/data/development-clients';
import { createInitialClients } from '@/features/clients/data/initial-clients';
import { createInitialProductCatalog } from '@/features/products/data/initial-products';
import {
  createInitialServiceCatalog,
  DEVELOPMENT_BUSINESS_ID,
} from '@/features/services/data/initial-services';
import type { FirstRunSeed } from '@/persistence/seed';

export function createDevelopmentSeed(
  now = new Date(),
  businessId: string = DEVELOPMENT_BUSINESS_ID,
): FirstRunSeed {
  return {
    clients: [...createInitialClients(), ...developmentClients],
    services: createInitialServiceCatalog(businessId),
    products: createInitialProductCatalog(businessId),
    appointments: createAgendaFixtures(startOfLocalDay(now)).map((entry) => ({
      ...entry.appointment,
      businessId,
    })),
    sales: [],
  };
}
