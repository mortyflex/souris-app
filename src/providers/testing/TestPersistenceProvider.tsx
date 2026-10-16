// BeautIzzy — test persistence wrapper
//
// Wraps the real PersistenceProvider around a fresh in-memory SQLite
// database and in-memory files, seeded with the DEVELOPMENT seed (legacy
// data + Agenda fixtures) unless a test passes its own, and provides the
// fixture Business every operational screen stamps new records with. Each
// render gets isolated state. Never imported by application code.
//
// Business access (BeautIzzy Plus). The business session providers read
// `useBusinessAccess` for their write guards, so the fixture mounts the REAL
// BusinessAccessProvider — in the application's order: Auth → Access →
// bound Business — and never a stub returning full access. By default it is
// the production state of this phase: enforcement DISABLED, nobody signed in
// to the access session (nothing is verified, no listener or timer joins the
// tree a test observes), every mutation permitted. A test that validates the
// protection passes `access` with enforcement ENABLED and the fake
// SubscriptionSource it scripts; the access session then follows a fake Auth
// signed in as `fakeUser` unless the test hands it another gateway.

import { useState, type PropsWithChildren } from 'react';

import type { AccessEnforcement } from '@/domain/access';
import type { BusinessProfile } from '@/domain/business';
import { BusinessAccessProvider } from '@/features/access/session/BusinessAccessProvider';
import type { SubscriptionSource } from '@/features/access/subscription-source';
import type { AuthGateway } from '@/features/auth/gateway';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import { CurrentBusinessProvider } from '@/features/business/session/CurrentBusinessProvider';
import { DEVELOPMENT_BUSINESS_ID } from '@/features/services/data/initial-services';
import type { SourisDatabase } from '@/persistence/database';
import type { FirstRunSeed } from '@/persistence/seed';
import { createMemoryLocalFiles, type MemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { createDevelopmentSeed } from '../development-seed';
import { PersistenceProvider } from '../PersistenceProvider';

export interface TestBusinessAccessOptions {
  readonly enforcement: AccessEnforcement;
  /** Undefined behaves like the unconfigured source: every verification is unavailable. */
  readonly source?: SubscriptionSource;
  /** The Auth the access session follows; signed in as `fakeUser` when omitted. */
  readonly auth?: AuthGateway;
  /** Injected clock of the access session; the system clock when omitted. */
  readonly clock?: () => Date;
}

interface TestPersistenceProviderProps {
  readonly database?: SourisDatabase;
  readonly files?: MemoryLocalFiles;
  readonly createSeed?: () => FirstRunSeed;
  readonly business?: BusinessProfile;
  /** Omitted: enforcement disabled, nobody signed in to the access session — every mutation permitted. */
  readonly access?: TestBusinessAccessOptions;
}

const defaultCreateSeed = () => createDevelopmentSeed(new Date());

/** The Business the development seed and the screens under test share. */
export const testBusiness: BusinessProfile = {
  id: DEVELOPMENT_BUSINESS_ID,
  ownerUserId: 'user-lea',
  ownerFirstName: 'Léa',
  ownerLastName: 'Martin',
  name: 'Maison Léa',
  activityType: 'HAIRDRESSING',
  createdAt: new Date('2026-09-12T10:00:00.000Z'),
  updatedAt: new Date('2026-09-12T10:00:00.000Z'),
};

const signedInAuth = () =>
  createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });

export function TestPersistenceProvider({
  database,
  files,
  createSeed = defaultCreateSeed,
  business = testBusiness,
  access,
  children,
}: PropsWithChildren<TestPersistenceProviderProps>) {
  const [db] = useState(() => database ?? openTestDatabase());
  const [localFiles] = useState(() => files ?? createMemoryLocalFiles());
  // Fixed for the life of the fixture, like the application's gateways.
  const [auth] = useState<AuthGateway>(() =>
    access === undefined ? createFakeAuthGateway() : (access.auth ?? signedInAuth()),
  );

  return (
    <PersistenceProvider
      createDevelopmentSeed={createSeed}
      createSeed={createSeed}
      files={localFiles}
      openDatabase={() => db}
    >
      <AuthProvider gateway={auth}>
        <BusinessAccessProvider
          clock={access?.clock}
          enforcement={access?.enforcement ?? 'disabled'}
          source={access?.source}
        >
          <CurrentBusinessProvider business={business}>{children}</CurrentBusinessProvider>
        </BusinessAccessProvider>
      </AuthProvider>
    </PersistenceProvider>
  );
}
