// Souris — test persistence wrapper
//
// Wraps the real PersistenceProvider around a fresh in-memory SQLite
// database and in-memory files, seeded with the DEVELOPMENT seed (legacy
// data + Agenda fixtures) unless a test passes its own, and provides the
// fixture Business every operational screen stamps new records with. Each
// render gets isolated state. Never imported by application code.

import { useState, type PropsWithChildren } from 'react';

import type { BusinessProfile } from '@/domain/business';
import { CurrentBusinessProvider } from '@/features/business/session/CurrentBusinessProvider';
import { DEVELOPMENT_BUSINESS_ID } from '@/features/services/data/initial-services';
import type { SourisDatabase } from '@/persistence/database';
import type { FirstRunSeed } from '@/persistence/seed';
import { createMemoryLocalFiles, type MemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { createDevelopmentSeed } from '../development-seed';
import { PersistenceProvider } from '../PersistenceProvider';

interface TestPersistenceProviderProps {
  readonly database?: SourisDatabase;
  readonly files?: MemoryLocalFiles;
  readonly createSeed?: () => FirstRunSeed;
  readonly business?: BusinessProfile;
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

export function TestPersistenceProvider({
  database,
  files,
  createSeed = defaultCreateSeed,
  business = testBusiness,
  children,
}: PropsWithChildren<TestPersistenceProviderProps>) {
  const [db] = useState(() => database ?? openTestDatabase());
  const [localFiles] = useState(() => files ?? createMemoryLocalFiles());

  return (
    <PersistenceProvider
      createDevelopmentSeed={createSeed}
      createSeed={createSeed}
      files={localFiles}
      openDatabase={() => db}
    >
      <CurrentBusinessProvider business={business}>{children}</CurrentBusinessProvider>
    </PersistenceProvider>
  );
}
