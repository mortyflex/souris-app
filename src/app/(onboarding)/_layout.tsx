import { Stack } from 'expo-router';

import { semanticColors } from '@/shared/ui/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: semanticColors.screenWarm },
      }}
    />
  );
}
