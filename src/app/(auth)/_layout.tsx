import { Stack } from 'expo-router';

import { isPlaygroundAvailable } from '@/features/playground/availability';
import { semanticColors } from '@/shared/ui/theme';

export default function AuthLayout() {
  return (
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
      {/* Developer Playground: exists in a Staging development build only — the routes enforce the same rule. */}
      <Stack.Protected guard={isPlaygroundAvailable()}>
        <Stack.Screen name="playground/index" />
        <Stack.Screen name="playground/[activityType]" />
      </Stack.Protected>
    </Stack>
  );
}
