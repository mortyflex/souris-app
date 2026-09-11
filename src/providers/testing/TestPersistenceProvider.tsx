// Souris — test persistence wrapper
//
// Wraps the real PersistenceProvider around a fresh in-memory SQLite
// database and in-memory files, seeded with the DEVELOPMENT seed (legacy
// data + Agenda fixtures) unless a test passes its own. Each render gets
// isolated state. Never imported by application code.

import { useState, type PropsWithChildren } from 'react';

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
}

const defaultCreateSeed = () => createDevelopmentSeed(new Date());

export function TestPersistenceProvider({
  database,
  files,
  createSeed = defaultCreateSeed,
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
      {children}
    </PersistenceProvider>
  );
}
