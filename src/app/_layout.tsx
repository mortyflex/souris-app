import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors, semanticColors } from '@/shared/ui/theme';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';

// Keep the native splash screen visible until Plus Jakarta Sans is ready so
// the first frame never renders in a fallback font.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
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
      <GestureHandlerRootView style={styles.root}>
        <ClientSessionProvider>
          <ServiceCatalogProvider>
            <ProductCatalogProvider>
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
                    contentStyle: { backgroundColor: semanticColors.screenWarm },
                    sheetAllowedDetents: 'fitToContents',
                    sheetGrabberVisible: true,
                  }}
                />
                <Stack.Screen
                  name="appointments/new"
                  options={{
                    presentation: 'formSheet',
                    headerShown: false,
                    contentStyle: { backgroundColor: semanticColors.screenWarm },
                    sheetAllowedDetents: [0.92],
                    sheetGrabberVisible: true,
                  }}
                />
                <Stack.Screen
                  name="appointments/edit/[appointmentId]"
                  options={{
                    presentation: 'formSheet',
                    headerShown: false,
                    contentStyle: { backgroundColor: semanticColors.screenWarm },
                    sheetAllowedDetents: [0.92],
                    sheetGrabberVisible: true,
                  }}
                />
                <Stack.Screen
                  name="clients/[clientId]"
                  options={{
                    headerShown: false,
                    contentStyle: { backgroundColor: semanticColors.screenWarm },
                  }}
                />
                <Stack.Screen
                  name="services/index"
                  options={{
                    headerShown: false,
                    contentStyle: { backgroundColor: semanticColors.screenWarm },
                  }}
                />
                <Stack.Screen
                  name="services/new"
                  options={{
                    presentation: 'formSheet',
                    headerShown: false,
                    contentStyle: { backgroundColor: semanticColors.screenWarm },
                    sheetAllowedDetents: [0.92],
                    sheetGrabberVisible: true,
                  }}
                />
                <Stack.Screen
                  name="services/[serviceId]"
                  options={{
                    presentation: 'formSheet',
                    headerShown: false,
                    contentStyle: { backgroundColor: semanticColors.screenWarm },
                    sheetAllowedDetents: [0.92],
                    sheetGrabberVisible: true,
                  }}
                />
                <Stack.Screen
                  name="products/index"
                  options={{
                    headerShown: false,
                    contentStyle: { backgroundColor: semanticColors.screenWarm },
                  }}
                />
                <Stack.Screen
                  name="products/new"
                  options={{
                    presentation: 'formSheet',
                    headerShown: false,
                    contentStyle: { backgroundColor: semanticColors.screenWarm },
                    sheetAllowedDetents: [0.92],
                    sheetGrabberVisible: true,
                  }}
                />
                <Stack.Screen
                  name="products/[productId]"
                  options={{
                    presentation: 'formSheet',
                    headerShown: false,
                    contentStyle: { backgroundColor: semanticColors.screenWarm },
                    sheetAllowedDetents: [0.92],
                    sheetGrabberVisible: true,
                  }}
                />
              </Stack>
            </AppointmentSessionProvider>
            </ProductCatalogProvider>
          </ServiceCatalogProvider>
        </ClientSessionProvider>
      </GestureHandlerRootView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
