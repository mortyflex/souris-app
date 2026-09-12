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
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors, duration, semanticColors } from '@/shared/ui/theme';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { openSourisDatabase } from '@/persistence/expo-database';
import { createExpoLocalFiles } from '@/persistence/files/expo-local-files';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { createFirstRunSeed } from '@/providers/first-run-seed';
import { PersistenceProvider } from '@/providers/PersistenceProvider';

// Bootstrap flow:
//
//   native Souris splash (app.json → expo-splash-screen: mark + wordmark on white)
//     ↓ fonts (Plus Jakarta Sans) + SQLite open / migrate / hydrate
//   hideAsync() once both are settled and the first screen is committed
//     ↓
//   Agenda
//
// Nothing renders underneath the splash until both gates are open: the tree
// below PersistenceProvider stays empty while it bootstraps and the router
// mounts only once fonts are ready, so the first frame never shows a fallback
// font, empty data, or an unbranded loading surface. The root view shares the
// splash background so the short native fade lands on the same white.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: duration.settle, fade: true });

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const [files] = useState(createExpoLocalFiles);
  const [persistenceSettled, setPersistenceSettled] = useState(false);
  const fontsReady = fontsLoaded || fontError !== null;

  // Runs after the commit that mounted the router (or the recoverable
  // persistence failure surface), so the splash never hides over an empty root.
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
        {fontsReady && (
        <ClientSessionProvider>
          <ServiceCatalogProvider>
            <ProductCatalogProvider>
              <SaleSessionProvider>
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
                <Stack.Screen
                  name="sales/new"
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
              </SaleSessionProvider>
            </ProductCatalogProvider>
          </ServiceCatalogProvider>
        </ClientSessionProvider>
        )}
        </PersistenceProvider>
      </GestureHandlerRootView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
