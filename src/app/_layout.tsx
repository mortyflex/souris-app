import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { colors } from '@/shared/ui/theme';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';

// Keep the native splash screen visible until Inter is ready so the first
// frame never renders in a fallback font.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <>
      <StatusBar style="dark" />
      <AppointmentSessionProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen
            name="appointments/[appointmentId]"
            options={{
              presentation: 'formSheet',
              headerShown: false,
              sheetAllowedDetents: 'fitToContents',
              sheetGrabberVisible: true,
            }}
          />
          <Stack.Screen
            name="appointments/new"
            options={{
              presentation: 'formSheet',
              headerShown: false,
              sheetAllowedDetents: [0.92],
              sheetGrabberVisible: true,
            }}
          />
        </Stack>
      </AppointmentSessionProvider>
    </>
  );
}
