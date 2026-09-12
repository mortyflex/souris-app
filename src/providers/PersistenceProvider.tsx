// Souris — application persistence boundary
//
// The single bootstrap state of the app:
//
//   initializing → open database → migrate → first-run seed (once) → hydrate → ready
//                                                                            ↘ failed
//
// Every step — including opening the database file — runs inside this
// controlled boundary, so no persistence failure can throw during React
// render. A failure shows one recoverable "Réessayer" screen whose retry
// performs a fresh bootstrap (a new connection is opened).
//
// Nothing below this provider renders before the snapshot is ready, so no
// screen ever shows legacy/default data for a frame. The feature session
// providers read the hydrated snapshot and the database from this context;
// their mutations write through the database first and only then update
// React state.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { StyleSheet, View } from 'react-native';

import { getProductImagesDirectoryUri } from '@/features/products/images/product-image-storage';
import { bootstrapPersistence, type PersistedSnapshot } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { clearPersistedDataForDevelopment } from '@/persistence/development-reset';
import type { LocalFiles } from '@/persistence/files/local-files';
import type { FirstRunSeed } from '@/persistence/seed';
import { readBusinessProfile } from '@/persistence/stores/business-profile';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { semanticColors, spacing } from '@/shared/ui/theme';

export interface PersistenceValue {
  readonly database: SourisDatabase;
  readonly files: LocalFiles;
  /** Canonical state loaded at bootstrap; providers hydrate from it once. */
  readonly snapshot: PersistedSnapshot;
  /**
   * Development-only: wipes every persisted record and owned image (the
   * account binding is kept), seeds the DEVELOPMENT seed (legacy pilot data +
   * fixtures) under the bound Business id, and remounts the feature
   * providers. No-op in production builds.
   */
  readonly resetForDevelopment: () => void;
}

type BootstrapState =
  | { readonly status: 'initializing' }
  | {
      readonly status: 'ready';
      readonly database: SourisDatabase;
      readonly snapshot: PersistedSnapshot;
      readonly generation: number;
    }
  | { readonly status: 'failed'; readonly error: unknown };

const PersistenceContext = createContext<PersistenceValue | null>(null);

export interface DevelopmentSeedContext {
  /** The Business this device is bound to, so fixtures never introduce a foreign business id. */
  readonly businessId: string | undefined;
}

interface PersistenceProviderProps {
  /** Opens (or creates) the database; called inside the bootstrap boundary, and again on retry. */
  readonly openDatabase: () => SourisDatabase;
  readonly files: LocalFiles;
  /** Production first-run seed (empty since Account & Onboarding V1). */
  readonly createSeed: () => FirstRunSeed;
  /** Seed used by the development reset; defaults to `createSeed`. */
  readonly createDevelopmentSeed?: (context: DevelopmentSeedContext) => FirstRunSeed;
  /** Called once the bootstrap settled (ready or failed), e.g. to hide the splash screen. */
  readonly onSettled?: () => void;
}

function closeQuietly(database: SourisDatabase | undefined): void {
  try {
    database?.closeSync();
  } catch {
    // A connection that cannot be closed must not block a fresh bootstrap.
  }
}

export function PersistenceProvider({
  openDatabase,
  files,
  createSeed,
  createDevelopmentSeed,
  onSettled,
  children,
}: PropsWithChildren<PersistenceProviderProps>) {
  const [state, setState] = useState<BootstrapState>({ status: 'initializing' });
  // Latest-value refs: a changed callback must not re-run the bootstrap.
  const openDatabaseRef = useRef(openDatabase);
  const createSeedRef = useRef(createSeed);
  const createDevelopmentSeedRef = useRef(createDevelopmentSeed);
  const onSettledRef = useRef(onSettled);
  const databaseRef = useRef<SourisDatabase | undefined>(undefined);
  const generation = useRef(0);
  useEffect(() => {
    openDatabaseRef.current = openDatabase;
    createSeedRef.current = createSeed;
    createDevelopmentSeedRef.current = createDevelopmentSeed;
    onSettledRef.current = onSettled;
  }, [openDatabase, createSeed, createDevelopmentSeed, onSettled]);

  const bootstrap = useCallback((seed: () => FirstRunSeed, options: { freshConnection: boolean }) => {
    if (options.freshConnection) {
      closeQuietly(databaseRef.current);
      databaseRef.current = undefined;
    }
    try {
      const database = databaseRef.current ?? openDatabaseRef.current();
      databaseRef.current = database;
      const snapshot = bootstrapPersistence(database, seed);
      generation.current += 1;
      setState({ status: 'ready', database, snapshot, generation: generation.current });
    } catch (error) {
      closeQuietly(databaseRef.current);
      databaseRef.current = undefined;
      setState({ status: 'failed', error });
    }
    onSettledRef.current?.();
  }, []);

  useEffect(() => {
    bootstrap(() => createSeedRef.current(), { freshConnection: true });
  }, [bootstrap]);

  /** A retry is a fresh controlled bootstrap: new connection, same production seed. */
  const retry = useCallback(() => {
    bootstrap(() => createSeedRef.current(), { freshConnection: true });
  }, [bootstrap]);

  const resetForDevelopment = useCallback(() => {
    const database = databaseRef.current;
    if (!__DEV__ || !database) return;
    clearPersistedDataForDevelopment(database);
    files.deleteDirectory(getProductImagesDirectoryUri(files));
    // The account binding survives the reset; fixtures adopt its Business id.
    const context: DevelopmentSeedContext = { businessId: readBusinessProfile(database)?.id };
    bootstrap(
      () =>
        createDevelopmentSeedRef.current
          ? createDevelopmentSeedRef.current(context)
          : createSeedRef.current(),
      { freshConnection: false },
    );
  }, [bootstrap, files]);

  if (state.status === 'initializing') {
    return null;
  }

  if (state.status === 'failed') {
    return <PersistenceFailure onRetry={retry} />;
  }

  return (
    <PersistenceContext.Provider
      key={state.generation}
      value={{ database: state.database, files, snapshot: state.snapshot, resetForDevelopment }}
    >
      {children}
    </PersistenceContext.Provider>
  );
}

export function usePersistence(): PersistenceValue {
  const value = useContext(PersistenceContext);
  if (!value) {
    throw new Error('usePersistence must be used inside PersistenceProvider');
  }
  return value;
}

function PersistenceFailure({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <View style={styles.failure} testID="persistence-failure">
      <AppText variant="stateTitle" accessibilityRole="header">
        Impossible d’ouvrir vos données
      </AppText>
      <AppText variant="metadata" style={styles.failureText}>
        Souris n’a pas pu ouvrir sa base locale. Réessayez ou relancez l’application.
      </AppText>
      <AppButton onPress={onRetry} title="Réessayer" variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  failure: {
    alignItems: 'center',
    backgroundColor: semanticColors.screenWarm,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  failureText: { color: semanticColors.foregroundSoft, textAlign: 'center' },
});
