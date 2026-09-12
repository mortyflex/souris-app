// Souris — protected application group
//
// Mounted only while the root gate resolves to `app` (signed in + bound
// Business). It owns the operational session providers, so no Client,
// Appointment, Service, Product, or Sale state exists in the tree while the
// user is signed out, and every screen stamps new records with the bound
// Business through CurrentBusinessProvider.

import { Stack } from 'expo-router';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { useBusinessSession } from '@/features/business/session/BusinessSessionProvider';
import { CurrentBusinessProvider } from '@/features/business/session/CurrentBusinessProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { colors, semanticColors } from '@/shared/ui/theme';

const warmSheet = {
  presentation: 'formSheet' as const,
  headerShown: false,
  contentStyle: { backgroundColor: semanticColors.screenWarm },
  sheetAllowedDetents: [0.92],
  sheetGrabberVisible: true,
};

export default function AppLayout() {
  const { state } = useBusinessSession();
  // The Protected guard already prevents this; keep the invariant explicit.
  if (state.status !== 'ready') return null;

  return (
    <CurrentBusinessProvider business={state.business}>
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
                  <Stack.Screen name="(tabs)" />
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
                  <Stack.Screen name="appointments/new" options={warmSheet} />
                  <Stack.Screen name="appointments/edit/[appointmentId]" options={warmSheet} />
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
                  <Stack.Screen name="services/new" options={warmSheet} />
                  <Stack.Screen name="services/[serviceId]" options={warmSheet} />
                  <Stack.Screen
                    name="products/index"
                    options={{
                      headerShown: false,
                      contentStyle: { backgroundColor: semanticColors.screenWarm },
                    }}
                  />
                  <Stack.Screen name="products/new" options={warmSheet} />
                  <Stack.Screen name="products/[productId]" options={warmSheet} />
                  <Stack.Screen name="sales/new" options={warmSheet} />
                </Stack>
              </AppointmentSessionProvider>
            </SaleSessionProvider>
          </ProductCatalogProvider>
        </ServiceCatalogProvider>
      </ClientSessionProvider>
    </CurrentBusinessProvider>
  );
}
