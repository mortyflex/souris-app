// Souris — protected application group
//
// Mounted only while the root gate resolves to `app` (signed in + bound
// Business). It owns the operational session providers, so no Client,
// Appointment, Service, Product, or Sale state exists in the tree while the
// user is signed out, and every screen stamps new records with the bound
// Business through CurrentBusinessProvider.
//
// Every workflow route is a native form sheet configured ONCE in
// src/providers/sheet-route-options.ts with the canonical Souris shell and an
// explicit gesture policy (workflows with long scrolling bodies never dismiss
// on a swipe — closing goes through their « Annuler »).

import { Stack } from 'expo-router';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { useBusinessSession } from '@/features/business/session/BusinessSessionProvider';
import { CurrentBusinessProvider } from '@/features/business/session/CurrentBusinessProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { contentSheet, editorSheet, workflowSheet } from '@/providers/sheet-route-options';
import { colors, semanticColors } from '@/shared/ui/theme';

const pushedScreen = {
  headerShown: false,
  contentStyle: { backgroundColor: semanticColors.screenWarm },
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
                  <Stack.Screen name="appointments/[appointmentId]" options={contentSheet} />
                  <Stack.Screen name="appointments/new" options={workflowSheet} />
                  <Stack.Screen name="appointments/edit/[appointmentId]" options={workflowSheet} />
                  <Stack.Screen name="clients/[clientId]" options={pushedScreen} />
                  <Stack.Screen name="services/index" options={pushedScreen} />
                  <Stack.Screen name="cash-register/index" options={pushedScreen} />
                  <Stack.Screen name="services/new" options={editorSheet} />
                  <Stack.Screen name="services/[serviceId]" options={editorSheet} />
                  <Stack.Screen name="products/index" options={pushedScreen} />
                  <Stack.Screen name="products/new" options={editorSheet} />
                  <Stack.Screen name="products/[productId]" options={editorSheet} />
                  <Stack.Screen name="sales/new" options={workflowSheet} />
                </Stack>
              </AppointmentSessionProvider>
            </SaleSessionProvider>
          </ProductCatalogProvider>
        </ServiceCatalogProvider>
      </ClientSessionProvider>
    </CurrentBusinessProvider>
  );
}
