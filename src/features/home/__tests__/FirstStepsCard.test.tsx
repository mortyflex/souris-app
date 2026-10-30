// BeautIzzy — Accueil « Premiers pas avec BeautIzzy » (behavioural)

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { useEffect, type ReactElement } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { createAppointmentItemSnapshot, type Appointment, type Service } from '@/domain/appointments';
import { currentStaffMemberId } from '@/features/appointments/current-staff-member';
import { ClientSessionProvider, useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { reducedMotion } from '@/features/clients/birthday/testing/mock-reanimated';
import { ProductCatalogProvider, useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { ServiceCatalogProvider, useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { haptics } from '@/shared/lib/haptics';
import { firstSteps as firstStepsMotion } from '@/shared/ui/theme';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { readMetadata } from '@/persistence/metadata';
import type { FirstRunSeed } from '@/persistence/seed';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { createFirstRunSeed } from '@/providers/first-run-seed';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';

import { HomeScreen } from '../HomeScreen';
import { consumeFirstArrival, requestFirstArrival } from '../first-steps/arrival';
import { closeFirstSteps, firstStepsKey, startFirstSteps } from '../first-steps/first-steps-store';

const mockPush = jest.fn();
let mockFocused = true;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => mockFocused,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
jest.mock('@/shared/lib/image-pixel-size', () => ({ fitImageToPixelSize: jest.fn(async () => undefined) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));
jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);
jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { DateTimePicker: () => React.createElement(View, null) };
});
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const NOW = new Date(2026, 5, 1, 8, 0);

const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });

/** A starter prestation as onboarding writes it: active, at 0 € (« à renseigner »). */
const starter: Service = {
  id: 'service-starter',
  businessId: testBusiness.id,
  name: 'Coupe femme',
  type: 'SERVICE',
  price: 0,
  phases: [{ id: 'phase-starter', name: 'Coupe', durationMinutes: 45, requiresStaff: true }],
  active: true,
};

/** A fresh Business: the empty first-run seed, plus what a test adds. */
function newBusinessDatabase(extra: Partial<FirstRunSeed> = {}): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, () => ({ ...createFirstRunSeed(), ...extra }));
  return database;
}

/** An established Business: hundreds of clients, appointments, a priced catalogue. */
function establishedDatabase(): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, () => createDevelopmentSeed(NOW));
  return database;
}

/** The session actions a test uses to change the data while Accueil is mounted. */
const sessions: {
  current?: {
    readonly clients: ReturnType<typeof useClientSession>;
    readonly services: ReturnType<typeof useServiceCatalog>;
    readonly products: ReturnType<typeof useProductCatalog>;
  };
} = {};
function SessionsProbe() {
  const clients = useClientSession();
  const services = useServiceCatalog();
  const products = useProductCatalog();
  useEffect(() => {
    sessions.current = { clients, services, products };
  });
  return null;
}

function homeTree(database: SourisDatabase): ReactElement {
  return (
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
        <ServiceCatalogProvider>
          <AppointmentSessionProvider>
            <ProductCatalogProvider>
              <SaleSessionProvider>
                <CalendarBlockSessionProvider>
                  <HomeScreen />
                  <SessionsProbe />
                </CalendarBlockSessionProvider>
              </SaleSessionProvider>
            </ProductCatalogProvider>
          </AppointmentSessionProvider>
        </ServiceCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>
  );
}

async function renderHome(database: SourisDatabase) {
  const view = await render(homeTree(database));
  await act(async () => {});
  return view;
}

const status = (database: SourisDatabase) => readMetadata(database, firstStepsKey(testBusiness.id));

describe('Accueil — Premiers pas avec BeautIzzy', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
    mockPush.mockClear();
    mockFocused = true;
    reducedMotion.enabled = false;
    sessions.current = undefined;
    consumeFirstArrival();
  });

  afterEach(() => {
    jest.useRealTimers();
    reducedMotion.enabled = false;
  });

  it('is never shown to an established Business (no onboarding finished on this device)', async () => {
    const database = establishedDatabase();
    const view = await renderHome(database);

    expect(view.getByTestId('home-screen')).toBeTruthy();
    expect(view.queryByTestId('home-first-steps')).toBeNull();
    expect(view.queryByText('Premiers pas avec BeautIzzy')).toBeNull();
    expect(status(database)).toBeUndefined();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('is never shown to an EMPTY Business without the onboarding flag either: data alone never turns it on', async () => {
    const database = newBusinessDatabase();
    const view = await renderHome(database);

    expect(view.queryByTestId('home-first-steps')).toBeNull();
    expect(status(database)).toBeUndefined();
  });

  it('guides a just-onboarded Business: four steps, products optional, nothing ticked without evidence', async () => {
    const database = newBusinessDatabase({ services: [starter] });
    startFirstSteps(database, testBusiness.id);
    const view = await renderHome(database);

    const card = within(view.getByTestId('home-first-steps'));
    expect(card.getByText('Premiers pas avec BeautIzzy')).toBeTruthy();
    expect(view.getByTestId('home-first-steps-progress').props.children).toBe('0 sur 3 · à votre rythme');
    // The starter prestation is waiting for its price: not done.
    expect(view.getByTestId('home-first-step-services').props.accessibilityLabel).toBe(
      'Compléter vos prestations et tarifs, 1 tarif à renseigner, à faire',
    );
    expect(view.getByTestId('home-first-step-clients').props.accessibilityState).toMatchObject({ checked: false });
    expect(view.getByTestId('home-first-step-appointment').props.accessibilityState).toMatchObject({ checked: false });
    // Products are offered, never required.
    expect(view.getByTestId('home-first-step-products').props.accessibilityLabel).toMatch(/facultatif$/);
    expect(card.getByText('Facultatif')).toBeTruthy();
    // Online booking is not available: never advertised.
    expect(view.queryByText(/réservation en ligne/i)).toBeNull();
  });

  it.each([
    ['services', '/services'],
    ['clients', '/clients/import'],
    ['appointment', '/appointments/new'],
    ['products', '/products/new'],
  ])('the « %s » step opens the existing flow %s', async (key, route) => {
    const database = newBusinessDatabase();
    startFirstSteps(database, testBusiness.id);
    const view = await renderHome(database);

    await press(view.getByTestId(`home-first-step-${key}`));

    expect(mockPush).toHaveBeenCalledWith(route);
  });

  it('derives each state from the data: a client ticks the import step, a priced catalogue the services step', async () => {
    const database = newBusinessDatabase({
      services: [{ ...starter, price: 3500 }],
      clients: [{ id: 'client-1', businessId: testBusiness.id, firstName: 'Inès' } as FirstRunSeed['clients'][number]],
    });
    startFirstSteps(database, testBusiness.id);
    const view = await renderHome(database);

    expect(view.getByTestId('home-first-steps-progress').props.children).toBe('2 sur 3 · à votre rythme');
    expect(view.getByTestId('home-first-step-services').props.accessibilityState).toMatchObject({ checked: true });
    expect(view.getByTestId('home-first-step-clients').props.accessibilityState).toMatchObject({ checked: true });
    // A done step leads nowhere.
    await press(view.getByTestId('home-first-step-clients'));
    expect(mockPush).not.toHaveBeenCalled();
    // Still not complete: no appointment yet — the card stays.
    expect(status(database)).toBe('active');
  });

  it('« ✕ » dismisses it for good, and a clean Accueil remains', async () => {
    const database = newBusinessDatabase();
    startFirstSteps(database, testBusiness.id);
    const view = await renderHome(database);

    await press(view.getByTestId('home-first-steps-dismiss'));

    expect(view.queryByTestId('home-first-steps')).toBeNull();
    expect(status(database)).toBe('dismissed');
    expect(view.getByTestId('home-quick-actions')).toBeTruthy();
    // Onboarding never turns a closed guide back on.
    startFirstSteps(database, testBusiness.id);
    expect(status(database)).toBe('dismissed');
  });

  it('a dismissed guide stays hidden on the next visit', async () => {
    const database = newBusinessDatabase();
    closeFirstSteps(database, testBusiness.id, 'dismissed');
    const view = await renderHome(database);

    expect(view.queryByTestId('home-first-steps')).toBeNull();
  });

  it('closes itself once every required step is done (products never required)', async () => {
    const database = establishedDatabase();
    startFirstSteps(database, testBusiness.id);
    const view = await renderHome(database);

    expect(view.queryByTestId('home-first-steps')).toBeNull();
    expect(status(database)).toBe('completed');
  });

  it('opens the existing client import once when onboarding asked for it', async () => {
    const database = newBusinessDatabase();
    startFirstSteps(database, testBusiness.id);
    requestFirstArrival('client-import');
    await renderHome(database);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/clients/import');
    // One-shot: nothing is left for a later visit.
    expect(consumeFirstArrival()).toBeUndefined();
  });

  describe('micro-interactions', () => {
    const client = (id: string) =>
      ({ id, businessId: testBusiness.id, firstName: 'Inès' }) as FirstRunSeed['clients'][number];
    const appointment: Appointment = {
      id: 'appointment-first',
      businessId: testBusiness.id,
      clientId: 'client-1',
      staffMemberId: currentStaffMemberId,
      startAt: new Date(2026, 5, 2, 10, 0),
      status: 'SCHEDULED',
      items: [createAppointmentItemSnapshot({ id: 'appointment-first-item-1', service: starter, order: 0 })],
    };
    /** Two of three done: a client and an appointment, the starter still at 0 €. */
    const almostDone = () => newBusinessDatabase({ services: [starter], clients: [client('client-1')], appointments: [appointment] });

    let selection: jest.SpyInstance;
    let success: jest.SpyInstance;
    let announce: jest.SpyInstance;
    let screenReader: jest.SpyInstance;
    beforeEach(() => {
      screenReader = jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
      selection = jest.spyOn(haptics, 'selection').mockImplementation(() => {});
      success = jest.spyOn(haptics, 'success').mockImplementation(() => {});
      announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    });
    afterEach(() => {
      selection.mockRestore();
      success.mockRestore();
      announce.mockRestore();
      screenReader.mockRestore();
    });

    const addClient = (id: string) =>
      act(async () => {
        sessions.current!.clients.addClient(client(id));
      });
    const priceStarter = () =>
      act(async () => {
        sessions.current!.services.updateService({ ...starter, price: 3500 });
      });
    const advance = (ms: number) =>
      act(async () => {
        jest.advanceTimersByTime(ms);
      });

    it('uses gentle entrance and completion timings', () => {
      expect(firstStepsMotion.enter).toBeGreaterThanOrEqual(400);
      expect(firstStepsMotion.enter).toBeLessThanOrEqual(500);
      expect(firstStepsMotion.rise).toBeGreaterThanOrEqual(12);
      expect(firstStepsMotion.rise).toBeLessThanOrEqual(16);
      expect(firstStepsMotion.rowStagger).toBeGreaterThanOrEqual(50);
      expect(firstStepsMotion.rowStagger).toBeLessThanOrEqual(70);
      // 3 sur 3: the visuals settle first, THEN a ~3 s reading period, then a 450–500 ms fold.
      expect(firstStepsMotion.finalSettle).toBeGreaterThanOrEqual(firstStepsMotion.progress);
      expect(firstStepsMotion.finalSettle).toBeGreaterThanOrEqual(firstStepsMotion.highlightIn);
      expect(firstStepsMotion.finalHold).toBeGreaterThanOrEqual(2800);
      expect(firstStepsMotion.finalHold).toBeLessThanOrEqual(3200);
      expect(firstStepsMotion.exit).toBeGreaterThanOrEqual(450);
      expect(firstStepsMotion.exit).toBeLessThanOrEqual(500);
    });

    it('appears with the data it mounted with — already-done steps ticked, never celebrated', async () => {
      const database = newBusinessDatabase({ services: [starter], clients: [client('client-1')] });
      startFirstSteps(database, testBusiness.id);
      const view = await renderHome(database);
      await advance(2000);

      expect(view.getByTestId('home-first-step-clients').props.accessibilityState).toMatchObject({ checked: true });
      expect(view.getByTestId('home-first-steps-progress').props.children).toBe('1 sur 3 · à votre rythme');
      expect(selection).not.toHaveBeenCalled();
      expect(success).not.toHaveBeenCalled();
      expect(announce).not.toHaveBeenCalled();
    });

    it('celebrates a step that genuinely turns done: one haptic, one announcement, progress and line updated', async () => {
      const database = newBusinessDatabase({ services: [starter] });
      startFirstSteps(database, testBusiness.id);
      const view = await renderHome(database);
      // The line is decorative (hidden from assistive technology): the spoken progress is the text.
      const lineWidth = () =>
        StyleSheet.flatten(view.getByTestId('home-first-steps-line-fill', { includeHiddenElements: true }).props.style)
          .width;
      expect(lineWidth()).toBe('0%');

      await addClient('client-1');

      expect(view.getByTestId('home-first-step-clients').props.accessibilityState).toMatchObject({ checked: true });
      expect(view.getByTestId('home-first-steps-progress').props.children).toBe('1 sur 3 · à votre rythme');
      expect(parseFloat(lineWidth() as string)).toBeCloseTo(100 / 3);
      expect(selection).toHaveBeenCalledTimes(1);
      expect(success).not.toHaveBeenCalled();
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith('Importer votre clientèle : fait. 1 sur 3.');

      // The same state again — another client, timers, re-renders — is no new completion.
      await addClient('client-2');
      await advance(2000);
      expect(selection).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledTimes(1);
    });

    it('never counts the optional products: a quiet tick, no haptic, the progress unchanged', async () => {
      const database = newBusinessDatabase();
      startFirstSteps(database, testBusiness.id);
      const view = await renderHome(database);

      await act(async () => {
        await sessions.current!.products.addProduct({
          id: 'product-1',
          businessId: testBusiness.id,
          name: 'Shampooing',
          price: 1800,
          stockQuantity: 4,
          active: true,
        });
      });

      expect(view.getByTestId('home-first-step-products').props.accessibilityState).toMatchObject({ checked: true });
      expect(view.getByTestId('home-first-steps-progress').props.children).toBe('0 sur 3 · à votre rythme');
      expect(selection).not.toHaveBeenCalled();
      expect(announce).toHaveBeenCalledWith('Ajouter vos produits : fait.');
    });

    it('waits until Accueil is in front again to celebrate a step done in another screen', async () => {
      const database = newBusinessDatabase();
      startFirstSteps(database, testBusiness.id);
      const view = await renderHome(database);

      mockFocused = false;
      await act(async () => view.rerender(homeTree(database)));
      await addClient('client-1');
      expect(selection).not.toHaveBeenCalled();
      expect(announce).not.toHaveBeenCalled();

      mockFocused = true;
      await act(async () => view.rerender(homeTree(database)));
      expect(selection).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledTimes(1);

      // Leaving and coming back again replays nothing.
      mockFocused = false;
      await act(async () => view.rerender(homeTree(database)));
      mockFocused = true;
      await act(async () => view.rerender(homeTree(database)));
      expect(selection).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledTimes(1);
    });

    it('3 sur 3: shows the « ready » moment first, then folds away for good', async () => {
      const database = almostDone();
      startFirstSteps(database, testBusiness.id);
      const view = await renderHome(database);
      expect(view.getByTestId('home-first-steps-progress').props.children).toBe('2 sur 3 · à votre rythme');

      await priceStarter();

      // The card is still there: last check, the ready message, the flourish.
      expect(view.getByTestId('home-first-steps')).toBeTruthy();
      expect(view.getByTestId('home-first-step-services').props.accessibilityState).toMatchObject({ checked: true });
      expect(view.getByTestId('home-first-steps-ready').props.children).toBe('Votre espace est prêt à vous accompagner !');
      expect(view.getByTestId('home-first-steps-flourish')).toBeTruthy();
      expect(view.queryByTestId('home-first-steps-dismiss')).toBeNull();
      // One success haptic — not a selection one on top — and one announcement.
      expect(success).toHaveBeenCalledTimes(1);
      expect(selection).not.toHaveBeenCalled();
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith('Premiers pas terminés. Votre espace est prêt à vous accompagner !');
      // Permanent at once.
      expect(status(database)).toBe('completed');

      // The visuals settle, then the WHOLE reading period: the card and its message stay.
      await advance(firstStepsMotion.finalSettle + firstStepsMotion.finalHold - 1);
      expect(view.getByTestId('home-first-steps-ready')).toBeTruthy();
      // The fold runs to its end before the card leaves.
      await advance(firstStepsMotion.exit);
      expect(view.getByTestId('home-first-steps-ready')).toBeTruthy();
      await advance(1);
      expect(view.queryByTestId('home-first-steps')).toBeNull();
      expect(success).toHaveBeenCalledTimes(1);
      expect(view.getByTestId('home-quick-actions')).toBeTruthy();
    });

    it('several steps done at once are ONE celebration: one haptic, one sentence', async () => {
      const database = newBusinessDatabase({ services: [starter] });
      startFirstSteps(database, testBusiness.id);
      await renderHome(database);

      await act(async () => {
        sessions.current!.clients.addClient(client('client-1'));
        sessions.current!.services.updateService({ ...starter, price: 3500 });
      });

      expect(selection).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith('Compléter vos prestations et tarifs, Importer votre clientèle : fait. 2 sur 3.');
    });

    it('Reduce Motion: the same states and « ready » moment, removed without a fold', async () => {
      reducedMotion.enabled = true;
      const database = almostDone();
      startFirstSteps(database, testBusiness.id);
      const view = await renderHome(database);

      await priceStarter();
      expect(view.getByTestId('home-first-steps-ready')).toBeTruthy();
      expect(success).toHaveBeenCalledTimes(1);

      // Readable for the full reading period, without motion…
      await advance(firstStepsMotion.finalHold - 1);
      expect(view.getByTestId('home-first-steps-ready')).toBeTruthy();
      // …then removed at once, without a fold.
      await advance(1);
      expect(view.queryByTestId('home-first-steps')).toBeNull();
      expect(status(database)).toBe('completed');
    });

    it('VoiceOver: no clock removes the « ready » card — it waits for « Fermer »', async () => {
      screenReader.mockResolvedValue(true);
      const database = almostDone();
      startFirstSteps(database, testBusiness.id);
      const view = await renderHome(database);

      await priceStarter();
      expect(announce).toHaveBeenCalledTimes(1);
      await advance(60_000);
      expect(view.getByTestId('home-first-steps-ready')).toBeTruthy();
      expect(status(database)).toBe('completed');

      const close = view.getByTestId('home-first-steps-close');
      expect(close.props.accessibilityLabel).toBe('Fermer les premiers pas');
      await press(close);
      expect(view.queryByTestId('home-first-steps')).toBeNull();
      expect(announce).toHaveBeenCalledTimes(1);
    });

    it('a remount on other data (a Playground stage switch, a return to Accueil) celebrates nothing', async () => {
      const first = newBusinessDatabase();
      startFirstSteps(first, testBusiness.id);
      const view = await renderHome(first);

      // A NEW tree on a later stage: steps already done, the guide still active.
      const later = newBusinessDatabase({ services: [starter], clients: [client('client-1')] });
      startFirstSteps(later, testBusiness.id);
      await act(async () => view.rerender(<View key="later">{homeTree(later)}</View>));
      await advance(2000);

      expect(view.getByTestId('home-first-step-clients').props.accessibilityState).toMatchObject({ checked: true });
      expect(selection).not.toHaveBeenCalled();
      expect(success).not.toHaveBeenCalled();
      expect(announce).not.toHaveBeenCalled();
    });

    it('a guide mounted already complete closes silently, without a « ready » moment', async () => {
      const database = establishedDatabase();
      startFirstSteps(database, testBusiness.id);
      const view = await renderHome(database);

      expect(view.queryByTestId('home-first-steps')).toBeNull();
      expect(view.queryByTestId('home-first-steps-ready')).toBeNull();
      expect(success).not.toHaveBeenCalled();
      expect(announce).not.toHaveBeenCalled();
    });
  });
});
