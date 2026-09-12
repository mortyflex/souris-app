// Souris — root navigation gate
//
// Reads the Auth and Business session states, resolves ONE root route
// (root-route.ts), and mounts only the matching route group through
// Expo Router's Protected guards. While booting it renders the same branded
// surface the native splash shows, so the transition is seamless and no
// protected screen ever flashes. Conflict and error states are dedicated
// explanatory surfaces outside the navigator.

import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/session/AuthProvider';
import { AccountConflictScreen } from '@/features/business/AccountConflictScreen';
import { AccountUnavailableScreen } from '@/features/business/AccountUnavailableScreen';
import { useBusinessSession } from '@/features/business/session/BusinessSessionProvider';
import { BrandComposition } from '@/shared/ui/BrandMark';
import { colors } from '@/shared/ui/theme';

import { resolveRootRoute } from './root-route';

export function RootNavigator() {
  const { state: auth } = useAuth();
  const { state: business } = useBusinessSession();
  const route = resolveRootRoute(auth, business);

  switch (route) {
    case 'booting':
      return <BootSurface />;
    case 'device-account-conflict':
      return <AccountConflictScreen />;
    case 'auth-error':
    case 'business-error':
      return <AccountUnavailableScreen />;
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

/** Mirrors the iOS splash (mark above wordmark at 260 dp on white). */
function BootSurface() {
  return (
    <View style={styles.boot} testID="boot-surface">
      <BrandComposition size={260} decorative />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: colors.background },
  boot: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});
