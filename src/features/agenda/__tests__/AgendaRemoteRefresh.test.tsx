// Reactive synchronization: an Appointment booked on another device appears on
// the Agenda that stays open — with the tick, or at once with the pull gesture
// of the Day timeline and of the Week view.

import { act, fireEvent, waitFor } from '@testing-library/react-native';

import type { Appointment } from '@/domain/appointments';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { SYNC_REFRESH_CONTROL_TEST_ID } from '@/features/sync/SyncRefreshControl';
import { insertAppointment } from '@/persistence/stores/appointments';
import { clientLea, createTestSeed, serviceCut } from '@/persistence/testing/fixtures';
import { renderTwoDevices, REMOTE_BUSINESS_ID } from '@/providers/testing/cloud-sync-harness';

import { AgendaScreen } from '../AgendaScreen';

jest.mock('expo-router', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoRouterMock());
jest.mock('expo-symbols', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoSymbolsMock());
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
jest.mock('@/shared/lib/image-pixel-size', () => ({ fitImageToPixelSize: jest.fn(async () => undefined) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));
jest.mock('react-native-reanimated', () => jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'));
jest.mock('react-native-safe-area-context', () => jest.requireActual('@/shared/ui/testing/screen-mocks').safeAreaMock());
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () =>
  jest.requireActual('@/shared/ui/testing/mock-refresh-control'),
);

// A fixed "today", mid-morning: the booking below is later the same day.
const NOW = new Date(2026, 10, 2, 9, 0);

function bookedElsewhere(id: string, hour: number): Appointment {
  return {
    id,
    businessId: REMOTE_BUSINESS_ID,
    clientId: clientLea.id,
    staffMemberId: 'staff-amelie',
    startAt: new Date(2026, 10, 2, hour, 0),
    status: 'SCHEDULED',
    items: [
      {
        id: `${id}-item-0`,
        serviceId: serviceCut.id,
        order: 0,
        serviceName: 'Coupe',
        serviceType: 'SERVICE',
        price: 40,
        phases: [{ id: 'cut', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
      },
    ],
  };
}

const seed = () => createTestSeed({ clients: [clientLea], services: [serviceCut], products: [], appointments: [] });

const renderAgenda = () =>
  renderTwoDevices(seed, () => (
    <ClientSessionProvider>
      <AppointmentSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <CalendarBlockSessionProvider>
              <AgendaScreen />
            </CalendarBlockSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </AppointmentSessionProvider>
    </ClientSessionProvider>
  ));

describe('Agenda — remote Appointments', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });
  beforeEach(() => jest.setSystemTime(NOW));
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => jest.useRealTimers());

  it('shows the Appointment another device booked, on the open Day timeline, with the tick', async () => {
    const { view, other, tick, remote } = await renderAgenda();
    await waitFor(() => expect(view.getByTestId('agenda-day-canvas')).toBeTruthy());
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    expect(view.queryByText(/Léa/)).toBeNull();

    insertAppointment(other.database, bookedElsewhere('booked-elsewhere', 11));
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    await tick();
    await waitFor(() => expect(view.getByText(/Léa/)).toBeTruthy());
  });

  it('pull-to-refresh on the Day timeline and on the Week view fetches the booking now', async () => {
    const { view, other, remote } = await renderAgenda();
    await waitFor(() => expect(view.getByTestId('agenda-day-canvas')).toBeTruthy());
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));

    insertAppointment(other.database, bookedElsewhere('booked-elsewhere', 14));
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(view.getByText(/Léa/)).toBeTruthy());
    expect(control().props.refreshing).toBe(false);

    // The Week view carries the same control; a second booking arrives through it.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Semaine'));
    });
    insertAppointment(other.database, bookedElsewhere('booked-elsewhere-2', 16));
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(view.getAllByText(/Léa/).length).toBeGreaterThanOrEqual(2));
  });
});
