// Souris — production first-run seed
//
// The ONE place where the approved legacy imports feed persistence. It runs
// once, on the very first launch (docs/architecture/PERSISTENCE.md §5), and
// contains ONLY legitimate legacy data: the client address book, the service
// catalog, and the product catalog. No Appointments, no Sales, and never a
// development fixture — those live in development-seed.ts.

import { createInitialClients } from '@/features/clients/data/initial-clients';
import { createInitialProductCatalog } from '@/features/products/data/initial-products';
import { createInitialServiceCatalog } from '@/features/services/data/initial-services';
import type { FirstRunSeed } from '@/persistence/seed';

export function createFirstRunSeed(): FirstRunSeed {
  return {
    clients: createInitialClients(),
    services: createInitialServiceCatalog(),
    products: createInitialProductCatalog(),
    appointments: [],
    sales: [],
  };
}
