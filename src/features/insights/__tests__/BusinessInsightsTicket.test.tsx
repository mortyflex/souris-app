// BeautIzzy — « Tops & tendances » ticket: opening a client from their place
//
// The receipt lives in a Modal, so the ticket steps aside to open a profile:
// the paper leaves, the profile is pushed by the client's stable id once it is
// gone, and the ticket comes back as it was when its screen regains focus.

import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { loadClients } from '@/persistence/stores/clients';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { receiptPrint } from '@/shared/ui/theme';

import { BusinessInsightsTicket } from '../BusinessInsightsTicket';
import { INSIGHTS_CLIENT_PLACE_HINT } from '../components/InsightsPodium';
import { formatInsightsClientName } from '../insights-receipt';

const mockPush = jest.fn();
// Every mounted focus effect, so a test can make the screen regain focus.
const mockFocusEffects = new Set<() => void>();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(() => {
      mockFocusEffects.add(effect);
      effect();
      return () => {
        mockFocusEffects.delete(effect);
      };
    }, [effect]);
  },
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
jest.mock('@/shared/lib/image-pixel-size', () => ({ fitImageToPixelSize: jest.fn(async () => undefined) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

// The same pinned day as the Agenda: the seed has completed visits in September 2026.
const NOW = new Date(2026, 8, 16, 15, 0);

function seededDatabase(): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, () => createDevelopmentSeed(NOW));
  return database;
}

/** A screen that owns the ticket's visibility, like Home and the Agenda do. */
function Screen({ onClose }: { readonly onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable onPress={() => setVisible(true)} testID="open-insights">
        <Text>Tops & tendances</Text>
      </Pressable>
      <BusinessInsightsTicket
        anchor={NOW}
        onClose={() => {
          onClose();
          setVisible(false);
        }}
        visible={visible}
      />
    </>
  );
}

function renderScreen(database: SourisDatabase, onClose = jest.fn()) {
  return render(
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <ProductCatalogProvider>
            <SaleSessionProvider>
              <CalendarBlockSessionProvider>
                <Screen onClose={onClose} />
              </CalendarBlockSessionProvider>
            </SaleSessionProvider>
          </ProductCatalogProvider>
        </AppointmentSessionProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

type ScreenView = Awaited<ReturnType<typeof renderScreen>>;

const press = (view: ScreenView, testID: string) =>
  act(async () => fireEvent.press(view.getByTestId(testID)));
const settleDismiss = () =>
  act(async () => {
    jest.advanceTimersByTime(receiptPrint.dismiss);
  });
const regainFocus = () =>
  act(async () => {
    for (const effect of mockFocusEffects) effect();
  });
const periodLabel = (view: ScreenView) =>
  view.getByTestId('business-insights-period-label').props.children as string;
const paginationLabel = (view: ScreenView) =>
  view.getByTestId('business-insights-pagination').props.accessibilityLabel as string;
const swipeToLastCategory = (view: ScreenView) =>
  act(async () =>
    fireEvent(view.getByTestId('business-insights-rankings'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 10_000, y: 0 } },
    }),
  );

describe('BusinessInsightsTicket — client places', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
    mockPush.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens the client profile by the stable id of the place, once the paper has left, and comes back as it was', async () => {
    const database = seededDatabase();
    const onClose = jest.fn();
    const print = jest.spyOn(haptics, 'print');
    const view = await renderScreen(database, onClose);
    await press(view, 'open-insights');
    expect(periodLabel(view)).toBe('Septembre 2026');

    // Browse away from the opening state: the year, on « Clients les plus fidèles ».
    await press(view, 'business-insights-period-year');
    await swipeToLastCategory(view);
    expect(periodLabel(view)).toBe('2026');
    expect(paginationLabel(view)).toBe('Clients les plus fidèles, 4 sur 4');

    const place = view.getByTestId('business-insights-podium-loyalClients-place-1');
    expect(place.props.accessibilityRole).toBe('button');
    expect(place.props.accessibilityHint).toBe(INSIGHTS_CLIENT_PLACE_HINT);
    const spokenName = (place.props.accessibilityLabel as string).replace(/^Première place, (.+), \d+ rendez-vous$/, '$1');

    await act(async () => fireEvent.press(place));

    // Nothing is pushed while the paper is still leaving; the screen's close is not requested.
    expect(mockPush).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await settleDismiss();
    expect(view.queryByTestId('business-insights-receipt')).toBeNull();
    expect(mockPush).toHaveBeenCalledTimes(1);
    const [route] = mockPush.mock.calls[0] as [{ pathname: string; params: { clientId: string } }];
    expect(route.pathname).toBe('/clients/[clientId]');
    // The id is the client's own stable id — the one the place was named after.
    const client = loadClients(database).find((candidate) => candidate.id === route.params.clientId);
    expect(client).toBeDefined();
    expect(formatInsightsClientName(client)).toBe(spokenName);
    expect(onClose).not.toHaveBeenCalled();

    // Back on the screen: the ticket prints again exactly where it was.
    await regainFocus();
    expect(view.getByTestId('business-insights-receipt')).toBeTruthy();
    expect(periodLabel(view)).toBe('2026');
    expect(paginationLabel(view)).toBe('Clients les plus fidèles, 4 sur 4');
    expect(view.getByTestId('business-insights-rankings').props.contentOffset.x).toBeGreaterThan(0);
    expect(view.getByTestId('business-insights-podium-loyalClients-place-1').props.accessibilityLabel).toBe(
      place.props.accessibilityLabel,
    );
    // Regaining focus without having left (any later focus) changes nothing.
    await regainFocus();
    expect(periodLabel(view)).toBe('2026');
    expect(mockPush).toHaveBeenCalledTimes(1);

    // A close requested by the screen forgets the browsing: the next opening starts over.
    await press(view, 'business-insights-close');
    expect(onClose).toHaveBeenCalledTimes(1);
    await settleDismiss();
    expect(view.queryByTestId('business-insights-receipt')).toBeNull();
    expect(mockPush).toHaveBeenCalledTimes(1);
    await press(view, 'open-insights');
    expect(periodLabel(view)).toBe('Septembre 2026');
    expect(paginationLabel(view)).toBe('Top prestations, 1 sur 4');
    print.mockRestore();
  });

  it('keeps service places static and ignores a second place while one is already opening', async () => {
    const view = await renderScreen(seededDatabase());
    await press(view, 'open-insights');

    const service = view.getByTestId('business-insights-podium-services-place-1');
    expect(service.props.accessibilityRole).toBeUndefined();
    await act(async () => fireEvent.press(service));
    await settleDismiss();
    expect(mockPush).not.toHaveBeenCalled();
    expect(view.getByTestId('business-insights-receipt')).toBeTruthy();

    await swipeToLastCategory(view);
    const first = view.getByTestId('business-insights-podium-loyalClients-place-1');
    await act(async () => fireEvent.press(first));
    // The paper is leaving; another press cannot change where it goes.
    await act(async () => fireEvent.press(first));
    await settleDismiss();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
