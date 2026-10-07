// Souris — root navigation gate
//
// Reads the Auth and Business session states, resolves ONE root route
// (root-route.ts), and mounts only the matching route group through
// Expo Router's Protected guards. While booting it renders the same branded
// surface the native splash shows, so the transition is seamless and no
// protected screen ever flashes. Conflict and error states are dedicated
// explanatory surfaces outside the navigator — including the one of an EMPTY
// device whose data could not be fetched yet (the first-sync gate of
// CloudSyncRunner): no screen that creates a record exists while it shows.

import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/session/AuthProvider';
import { AccountConflictScreen } from '@/features/business/AccountConflictScreen';
import { AccountUnavailableScreen } from '@/features/business/AccountUnavailableScreen';
import { DataLoadingScreen } from '@/features/business/DataLoadingScreen';
import { DataUnavailableScreen } from '@/features/business/DataUnavailableScreen';
import { useBusinessSession } from '@/features/business/session/BusinessSessionProvider';
import { BrandMark } from '@/shared/ui/BrandMark';
import { colors, semanticColors } from '@/shared/ui/theme';

import { useCloudSyncControl } from './CloudSyncRunner';
import { resolveRootRoute } from './root-route';

export function RootNavigator() {
  const { state: auth, retry: retryAuth, signOut } = useAuth();
  const { state: business } = useBusinessSession();
  const { firstSync, runNow } = useCloudSyncControl();
  const route = resolveRootRoute(auth, business, firstSync.status);

  switch (route) {
    case 'booting':
      return <BootSurface />;
    case 'device-account-conflict':
      return <AccountConflictScreen />;
    case 'auth-error':
    case 'business-error':
      return <AccountUnavailableScreen />;
    case 'data-loading':
      return <DataLoadingScreen />;
    case 'data-unavailable':
      return (
        <DataUnavailableScreen
          // Without a live session no fetch is possible: retrying starts with the session itself.
          onRetry={() => (runNow ? void runNow() : retryAuth())}
          onSignOut={() => void signOut()}
          retrying={firstSync.retrying}
        />
      );
    default:
      return (
        <Stack screenOptions={{ headerShown: false, contentStyle: styles.content }}>
          <Stack.Protected guard={route === 'auth'}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={route === 'onboarding'}>
            <Stack.Screen name="(onboarding)" />
          </Stack.Protected>
          <Stack.Protected guard={route === 'app'}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      );
  }
}

/** Mirrors the iOS splash (primary logo in a 252 dp box on white). */
function BootSurface() {
  return (
    <View style={styles.boot} testID="boot-surface">
      <BrandMark variant="primary" size={252} decorative />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: semanticColors.screen },
  boot: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});
