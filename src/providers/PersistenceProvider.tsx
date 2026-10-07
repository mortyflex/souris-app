// BeautIzzy — application persistence boundary
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

import { getClientPhotoCacheDirectoryUri } from '@/features/clients/photo/client-photo-storage';
import { getProductImagesDirectoryUri } from '@/features/products/images/product-image-storage';
import { bootstrapPersistence, loadSnapshot, type PersistedSnapshot } from '@/persistence/bootstrap';
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
  /**
   * Canonical state read from SQLite: at bootstrap, then again — IN PLACE —
   * whenever the cloud sync runner applied remote rows. Providers hydrate
   * from it on mount and adopt every later re-read through `useSnapshotRefresh`.
   */
  readonly snapshot: PersistedSnapshot;
  /**
   * Development-only: wipes every persisted record and owned image (the
   * account binding is kept), seeds the DEVELOPMENT seed (synthetic clients,
   * pilot catalogs + fixtures) under the bound Business id, and remounts the feature
   * providers. No-op in production builds.
   */
  readonly resetForDevelopment: () => void;
  /**
   * Re-reads the snapshot from SQLite IN PLACE: nothing is remounted — the
   * navigation, open sheets, scroll positions and every draft (a Sale being
   * composed, an Appointment being created or edited, a form being filled)
   * stay exactly as they are, while the session providers adopt the fresh
   * persisted state (`useSnapshotRefresh`). The ONLY caller is the cloud sync
   * runner, after a run that wrote operational rows on behalf of the remote
   * (a new-device restore, an applied pull). A run that changed nothing never
   * calls it, so an idle periodic pull re-renders nothing.
   */
  readonly reloadSnapshot: () => void;
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

  const reloadSnapshot = useCallback(() => {
    const database = databaseRef.current;
    if (!database) return;
    try {
      const snapshot = loadSnapshot(database);
      // Same generation: the keyed subtree is NOT remounted (unlike the
      // development reset and a retry, which start over on purpose).
      setState({ status: 'ready', database, snapshot, generation: generation.current });
    } catch (error) {
      closeQuietly(databaseRef.current);
      databaseRef.current = undefined;
      setState({ status: 'failed', error });
    }
  }, []);

  const resetForDevelopment = useCallback(() => {
    const database = databaseRef.current;
    if (!__DEV__ || !database) return;
    clearPersistedDataForDevelopment(database);
    files.deleteDirectory(getProductImagesDirectoryUri(files));
    // Local copies only: the remote objects belong to the Business, not to this reset.
    files.deleteDirectory(getClientPhotoCacheDirectoryUri(files));
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
      value={{
        database: state.database,
        files,
        snapshot: state.snapshot,
        resetForDevelopment,
        reloadSnapshot,
      }}
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
        BeautIzzy n’a pas pu ouvrir sa base locale. Réessayez ou relancez l’application.
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

/**
 * Lets a session provider adopt a snapshot re-read in place (`reloadSnapshot`):
 * `adopt` runs with the fresh snapshot each time it changes after mount —
 * never on mount, where the provider already hydrated from it. Providers
 * replace their PERSISTED collections only; drafts live in screens and are
 * never touched.
 */
export function useSnapshotRefresh(adopt: (snapshot: PersistedSnapshot) => void): void {
  const { snapshot } = usePersistence();
  const adopted = useRef(snapshot);
  const latestAdopt = useRef(adopt);
  useEffect(() => {
    latestAdopt.current = adopt;
  });
  useEffect(() => {
    if (adopted.current === snapshot) return;
    adopted.current = snapshot;
    latestAdopt.current(snapshot);
  }, [snapshot]);
}
