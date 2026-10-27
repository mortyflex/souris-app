// BeautIzzy — Playground demo runtime (development ONLY)
//
// The isolated application context the `(demo)` route group runs in. It
// mounts the REAL operational providers — the very ones of `(app)/_layout` —
// around the real screens, but binds their boundaries to memory:
//
//   persistence    a private in-memory SQLite database (opened by the
//                  injected factory, never the device file), seeded with the
//                  profession's fixtures through the normal first-run seed;
//                  the sync outbox the stores mark lives in that same memory
//                  and no runner ever reads it;
//   files          an in-memory LocalFiles under `file:///playground-demo/`;
//   media remote   undefined — photos cannot be saved, the screens say so;
//   communications undefined — reminders read as disabled, nothing is sent;
//   access         enforcement disabled, no subscription source: every
//                  mutation permitted, no store or RevenueCat call;
//   business       the fictional demo Business, through CurrentBusinessProvider.
//
// What is deliberately NOT here: an AuthProvider (the root's stays as it is —
// signed out — and nothing fakes a session), a BusinessSessionProvider (no
// Business is bound to the device), the CloudSyncRunner (nothing is pushed or
// pulled), the RevenueCat source, the Supabase gateways. None of these modules
// is even imported by this file.
//
// The runtime is keyed by the session's scenario (profession + generation):
// starting, resetting or switching profession unmounts the whole tree —
// providers, navigator, drafts — closes the database and opens a new one
// seeded afresh. Leaving the group (« Quitter », « Changer de métier », a back
// gesture) clears the session on unmount, so a demo never outlives its
// screens. Nothing is written anywhere that survives.

import { Redirect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BusinessProfile } from '@/domain/business';
import { BusinessAccessProvider } from '@/features/access/session/BusinessAccessProvider';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CurrentBusinessProvider } from '@/features/business/session/CurrentBusinessProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { CommunicationPreferencesProvider } from '@/features/communications/preferences/CommunicationPreferencesProvider';
import { CommunicationsGatewayProvider } from '@/features/communications/session/CommunicationsGatewayProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import type { SourisDatabase } from '@/persistence/database';
import { BusinessMediaProvider } from '@/providers/BusinessMediaProvider';
import { PersistenceProvider } from '@/providers/PersistenceProvider';
import { AppText } from '@/shared/ui/AppText';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import { isPlaygroundAvailable } from '../availability';
import { createPlaygroundDemoFiles } from './demo-files';
import { createPlaygroundDemoScenario } from './scenarios';
import { usePlaygroundDemoSession, type PlaygroundDemoScenarioRef } from './session';

/** The discreet, permanent mention every demo screen carries. */
export const DEMO_INDICATOR_LABEL = 'Démonstration';

interface PlaygroundDemoRuntimeProps {
  /** Opens a NEW private in-memory database; called once per generation. */
  readonly openDatabase: () => SourisDatabase;
  /** The clock the fixtures are built against; the system clock in the app. */
  readonly now?: () => Date;
}

export function PlaygroundDemoRuntime({
  openDatabase,
  now = () => new Date(),
  children,
}: PropsWithChildren<PlaygroundDemoRuntimeProps>) {
  const { scenario, exit } = usePlaygroundDemoSession();

  // Leaving the demo group ends the demo: the next entry is always a fresh one.
  useEffect(() => () => exit(), [exit]);

  if (!isPlaygroundAvailable()) return <Redirect href="/" />;
  // A direct navigation into the group without a chosen demo: back to the landing.
  if (scenario === null) return <Redirect href="/playground" />;

  return (
    <PlaygroundDemoScenarioRuntime
      key={`${scenario.activityType}:${scenario.generation}`}
      now={now}
      openDatabase={openDatabase}
      scenario={scenario}
    >
      {children}
    </PlaygroundDemoScenarioRuntime>
  );
}

interface PlaygroundDemoScenarioRuntimeProps extends Required<PlaygroundDemoRuntimeProps> {
  readonly scenario: PlaygroundDemoScenarioRef;
}

function closeQuietly(database: SourisDatabase): void {
  try {
    database.closeSync();
  } catch {
    // A connection that cannot be closed holds nothing but memory.
  }
}

/** One generation of one demo: its own fixtures, files, database and providers. */
function PlaygroundDemoScenarioRuntime({
  scenario,
  openDatabase,
  now,
  children,
}: PropsWithChildren<PlaygroundDemoScenarioRuntimeProps>) {
  const [data] = useState(() => createPlaygroundDemoScenario(scenario.activityType, now()));
  const [files] = useState(createPlaygroundDemoFiles);
  // Every database this generation opened (the bootstrap, a retry): closed with it.
  const databases = useRef<SourisDatabase[]>([]);
  const open = useCallback(() => {
    const database = openDatabase();
    databases.current.push(database);
    return database;
  }, [openDatabase]);
  useEffect(
    () => () => {
      for (const database of databases.current) closeQuietly(database);
      databases.current = [];
    },
    [],
  );
  const createSeed = useCallback(() => data.seed, [data]);

  return (
    <View style={styles.root} testID="playground-demo-runtime">
      <PersistenceProvider
        createDevelopmentSeed={createSeed}
        createSeed={createSeed}
        files={files}
        openDatabase={open}
      >
        {/* Follows the ROOT auth state (signed out): nobody to verify, every mutation permitted. */}
        <BusinessAccessProvider enforcement="disabled" source={undefined}>
          <BusinessMediaProvider remote={undefined}>
            <CommunicationsGatewayProvider gateway={undefined}>
              <CurrentBusinessProvider business={data.business}>
                <ClientSessionProvider>
                  <ServiceCatalogProvider>
                    <ProductCatalogProvider>
                      <SaleSessionProvider>
                        <AppointmentSessionProvider>
                          <CalendarBlockSessionProvider>
                            <CommunicationPreferencesProvider>{children}</CommunicationPreferencesProvider>
                          </CalendarBlockSessionProvider>
                        </AppointmentSessionProvider>
                      </SaleSessionProvider>
                    </ProductCatalogProvider>
                  </ServiceCatalogProvider>
                </ClientSessionProvider>
              </CurrentBusinessProvider>
            </CommunicationsGatewayProvider>
          </BusinessMediaProvider>
        </BusinessAccessProvider>
      </PersistenceProvider>
      <DemoIndicator business={data.business} />
    </View>
  );
}

/** A small non-interactive pill under the status bar: visible on every demo screen, in the way of none. */
function DemoIndicator({ business }: { readonly business: BusinessProfile }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityLabel={`${DEMO_INDICATOR_LABEL} : ${business.name}`}
      accessibilityRole="text"
      pointerEvents="none"
      style={[styles.indicator, { top: insets.top + spacing.xs }]}
      testID="playground-demo-indicator"
    >
      <AppText style={styles.indicatorText} variant="metadata">
        {DEMO_INDICATOR_LABEL}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  indicator: {
    backgroundColor: semanticColors.accent,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    position: 'absolute',
    right: spacing.md,
  },
  indicatorText: { color: semanticColors.onAccent },
});
