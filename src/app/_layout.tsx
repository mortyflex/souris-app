import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SUBSCRIPTION_ENFORCEMENT } from '@/features/access/enforcement';
import { createEntitlementEvidenceStore } from '@/features/access/evidence/entitlement-evidence-store';
import { BusinessAccessProvider } from '@/features/access/session/BusinessAccessProvider';
import type { SubscriptionSource } from '@/features/access/subscription-source';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { BusinessSessionProvider } from '@/features/business/session/BusinessSessionProvider';
import { CommunicationsGatewayProvider } from '@/features/communications/session/CommunicationsGatewayProvider';
import { createAccountSubscriptionSource } from '@/infrastructure/revenuecat';
import { createAccountGateways, type AccountGateways } from '@/infrastructure/supabase';
import { openSourisDatabase } from '@/persistence/expo-database';
import { createExpoLocalFiles } from '@/persistence/files/expo-local-files';
import { readBusinessProfile } from '@/persistence/stores/business-profile';
import { BusinessMediaProvider } from '@/providers/BusinessMediaProvider';
import { CloudSyncRunner } from '@/providers/CloudSyncRunner';
import { createFirstRunSeed } from '@/providers/first-run-seed';
import {
  PersistenceProvider,
  usePersistence,
  type DevelopmentSeedContext,
} from '@/providers/PersistenceProvider';
import { RootNavigator } from '@/providers/RootNavigator';
import { duration, semanticColors } from '@/shared/ui/theme';

// Bootstrap flow:
//
//   native BeautIzzy splash (app.json → expo-splash-screen: primary logo on white)
//     ↓ fonts (Plus Jakarta Sans) + SQLite open / migrate / hydrate
//   hideAsync() once both are settled and the first surface is committed
//     ↓ local Supabase session restoration + local account binding (no network needed)
//   RootNavigator: booting surface (same brand composition) → Welcome | Business setup | App
//   CloudSyncRunner: fire-and-forget push of local data, only with a live bound session
//
// Nothing renders underneath the splash until fonts and persistence are
// settled, and the root gate never mounts a protected screen before the
// session resolved, so the first frame is never a fallback font, empty data,
// or an unbranded surface.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: duration.settle, fade: true });

// The development seed embeds the synthetic address book, the pilot catalogs,
// and the Agenda fixtures. It is required inside a `__DEV__` branch (never
// imported statically) so Metro drops the whole module graph from release
// bundles: no development data ships inside a TestFlight / App Store binary.
const createDevelopmentSeed = __DEV__
  ? ({ businessId }: DevelopmentSeedContext) => {
      const seed =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@/providers/development-seed') as typeof import('@/providers/development-seed');
      return seed.createDevelopmentSeed(new Date(), businessId);
    }
  : undefined;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const [files] = useState(createExpoLocalFiles);
  const [gateways] = useState(createAccountGateways);
  const [subscriptionSource] = useState(createAccountSubscriptionSource);
  const [persistenceSettled, setPersistenceSettled] = useState(false);
  const fontsReady = fontsLoaded || fontError !== null;

  // Runs after the commit that mounted the first surface (or the recoverable
  // persistence failure), so the splash never hides over an empty root.
  useEffect(() => {
    if (fontsReady && persistenceSettled) {
      void SplashScreen.hideAsync();
    }
  }, [fontsReady, persistenceSettled]);

  return (
    <>
      <StatusBar style="dark" />
      <GestureHandlerRootView style={styles.root}>
        <PersistenceProvider
          createDevelopmentSeed={createDevelopmentSeed}
          createSeed={createFirstRunSeed}
          files={files}
          onSettled={() => setPersistenceSettled(true)}
          openDatabase={openSourisDatabase}
        >
          {fontsReady && <AccountSession gateways={gateways} subscriptionSource={subscriptionSource} />}
        </PersistenceProvider>
      </GestureHandlerRootView>
    </>
  );
}

/**
 * Auth → Business → Access → root gate. Lives below PersistenceProvider
 * because the offline session fallback and the Business resolution both read
 * the local account binding. Business access (BeautIzzy Plus) sits above the
 * root gate so routing and the (app) providers can both read it later. The
 * subscription source is the RevenueCat one when this build holds a valid SDK
 * configuration (src/infrastructure/revenuecat), the unconfigured one
 * otherwise; enforcement stays disabled either way: nothing is restricted.
 */
function AccountSession({
  gateways,
  subscriptionSource,
}: {
  readonly gateways: AccountGateways;
  readonly subscriptionSource: SubscriptionSource;
}) {
  const { database } = usePersistence();
  const resolveLocalOwner = useCallback(() => {
    const profile = readBusinessProfile(database);
    return profile ? { id: profile.ownerUserId } : undefined;
  }, [database]);
  // The persisted proof of the subscription (BeautIzzy Plus): one metadata row of the device database.
  const evidenceStore = useMemo(() => createEntitlementEvidenceStore(database), [database]);

  return (
    <AuthProvider
      gateway={gateways.auth}
      passwordResetCooldown={gateways.passwordResetCooldown}
      resolveLocalOwner={resolveLocalOwner}
    >
      <BusinessSessionProvider gateway={gateways.business}>
        <BusinessAccessProvider enforcement={SUBSCRIPTION_ENFORCEMENT} source={subscriptionSource} evidenceStore={evidenceStore}>
          {/* Renders nothing of its own; pushes local data only once the live session is bound to its Business. */}
          <CloudSyncRunner gateway={gateways.sync}>
            <BusinessMediaProvider remote={gateways.media}>
              <CommunicationsGatewayProvider gateway={gateways.communications}>
                <RootNavigator />
              </CommunicationsGatewayProvider>
            </BusinessMediaProvider>
          </CloudSyncRunner>
        </BusinessAccessProvider>
      </BusinessSessionProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.screen },
});
