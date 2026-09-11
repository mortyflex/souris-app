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

import { colors, semanticColors } from '@/shared/ui/theme';
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

// Keep the native splash screen visible until Plus Jakarta Sans is ready AND
// the local database is bootstrapped, so the first frame never renders in a
// fallback font nor with empty/legacy data.
SplashScreen.preventAutoHideAsync();

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
  root: { flex: 1 },
});
