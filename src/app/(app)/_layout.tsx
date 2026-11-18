// BeautIzzy — protected application group
//
// Mounted only while the root gate resolves to `app` (signed in + bound
// Business). It owns the operational session providers, so no Client,
// Appointment, Calendar Block, Service, Product, or Sale state exists in the tree while the
// user is signed out, and every screen stamps new records with the bound
// Business through CurrentBusinessProvider.
//
// Every workflow route is a native form sheet configured ONCE in
// src/providers/sheet-route-options.ts with the canonical BeautIzzy shell and an
// explicit gesture policy (workflows with long scrolling bodies never dismiss
// on a swipe — closing goes through their « Annuler »).

import { Stack } from 'expo-router';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { CommunicationPreferencesProvider } from '@/features/communications/preferences/CommunicationPreferencesProvider';
import { useBusinessSession } from '@/features/business/session/BusinessSessionProvider';
import { CurrentBusinessProvider } from '@/features/business/session/CurrentBusinessProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { SyncRefreshFeedback } from '@/features/sync/SyncRefreshFeedback';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { contentSheet, editorSheet, workflowSheet } from '@/providers/sheet-route-options';
import { semanticColors } from '@/shared/ui/theme';

const pushedScreen = {
  headerShown: false,
  contentStyle: { backgroundColor: semanticColors.screen },
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
                <CalendarBlockSessionProvider>
                  <CommunicationPreferencesProvider>
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: semanticColors.screen },
                      }}>
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="appointments/[appointmentId]" options={contentSheet} />
                      <Stack.Screen name="appointments/new" options={workflowSheet} />
                      <Stack.Screen name="appointments/edit/[appointmentId]" options={workflowSheet} />
                      <Stack.Screen name="estimations/new" options={workflowSheet} />
                      <Stack.Screen name="calendar-blocks/[calendarBlockId]" options={contentSheet} />
                      <Stack.Screen name="clients/[clientId]" options={pushedScreen} />
                      {/* Client import: inside the bound (app) group only — its writes need the Business binding. */}
                      <Stack.Screen name="clients/import" options={pushedScreen} />
                      <Stack.Screen name="clients/appointments/[clientId]" options={pushedScreen} />
                      <Stack.Screen name="clients/purchases/[clientId]" options={pushedScreen} />
                      <Stack.Screen name="services/index" options={pushedScreen} />
                      <Stack.Screen name="services/categories" options={pushedScreen} />
                      <Stack.Screen name="cash-register/index" options={pushedScreen} />
                      <Stack.Screen name="reminder-settings" options={pushedScreen} />
                      <Stack.Screen name="lifecycle-sms-settings" options={pushedScreen} />
                      <Stack.Screen name="online-booking-settings" options={pushedScreen} />
                      <Stack.Screen name="online-booking-services" options={pushedScreen} />
                      <Stack.Screen name="working-hours-settings" options={pushedScreen} />
                      <Stack.Screen name="services/new" options={editorSheet} />
                      <Stack.Screen name="services/[serviceId]" options={editorSheet} />
                      <Stack.Screen name="products/index" options={pushedScreen} />
                      <Stack.Screen name="products/new" options={editorSheet} />
                      <Stack.Screen name="products/[productId]" options={editorSheet} />
                      <Stack.Screen name="sales/new" options={editorSheet} />
                      <Stack.Screen name="sales/index" options={pushedScreen} />
                      <Stack.Screen name="sales/[saleId]" options={pushedScreen} />
                      <Stack.Screen name="sales/adjust/[saleId]" options={pushedScreen} />
                      <Stack.Screen name="sales/refund/[adjustmentId]" options={pushedScreen} />
                    </Stack>
                    {/* After the Stack: drawn above the screens on both platforms (Android paints siblings in order). */}
                    <SyncRefreshFeedback />
                  </CommunicationPreferencesProvider>
                </CalendarBlockSessionProvider>
              </AppointmentSessionProvider>
            </SaleSessionProvider>
          </ProductCatalogProvider>
        </ServiceCatalogProvider>
      </ClientSessionProvider>
    </CurrentBusinessProvider>
  );
}
