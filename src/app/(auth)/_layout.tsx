import { Stack } from 'expo-router';

import { isPlaygroundAvailable } from '@/features/playground/availability';
import { semanticColors } from '@/shared/ui/theme';

// The Playground demo session (which demo is being explored) lives in the
// signed-out group, above the landing and the `(demo)` routes, and dies with
// it. Required inside a `__DEV__` branch — never imported statically — so
// release bundles carry neither it nor what it leads to.
const PlaygroundDemoSessionProvider = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/features/playground/demo/session') as typeof import('@/features/playground/demo/session'))
      .PlaygroundDemoSessionProvider
  : undefined;

export default function AuthLayout() {
  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: semanticColors.screen },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="forgot-password" />
      {/* The recovery link's landing: no swipe back into the signed-out screens mid-recovery. */}
      <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
      {/* The Google sign-in callback (deep link on Android and on a cold start): a transient landing. */}
      <Stack.Screen name="auth-callback" options={{ gestureEnabled: false }} />
      {/* Developer Playground: exists in a Staging development build only — the routes enforce the same rule. */}
      <Stack.Protected guard={isPlaygroundAvailable()}>
        <Stack.Screen name="playground/index" />
        <Stack.Screen name="playground/[activityType]" />
        {/* The interactive demo of a profession: the real operational screens on in-memory data. */}
        <Stack.Screen name="(demo)" />
      </Stack.Protected>
    </Stack>
  );

  if (PlaygroundDemoSessionProvider === undefined || !isPlaygroundAvailable()) return stack;
  return <PlaygroundDemoSessionProvider>{stack}</PlaygroundDemoSessionProvider>;
}
