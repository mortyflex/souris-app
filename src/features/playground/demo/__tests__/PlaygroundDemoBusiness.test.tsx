// BeautIzzy — Playground Step B2: the real business screens on the demo data
//
// Accueil, Produits, « Nouvelle vente » (standalone and « Revente » from an
// appointment), the Cash Register and Tops & tendances, rendered inside the
// demo runtime exactly as the `(demo)` routes mount them, on the profession's
// in-memory database. Expected figures are computed with the SAME domain rules
// over the seeded records — never hardcoded — and every mutation is checked in
// the demo database only. The modules the demo must never touch throw on load
// (Supabase, RevenueCat, the device database binding, the cloud sync runner).

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Text } from 'react-native';

import {
  getAppointmentCheckoutDueCents,
  getAppointmentDaySummary,
  type Appointment,
  type AppointmentDeposit,
} from '@/domain/appointments';
import { getCashRegisterDaySummary } from '@/domain/cash-register';
import { getBusinessInsights, getInsightsPeriod } from '@/domain/insights';
import type { Product } from '@/domain/products';
import type { Sale } from '@/domain/sales';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { AuthProvider, useAuth, type AuthState } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import { CashRegisterScreen } from '@/features/cash-register/CashRegisterScreen';
import { HomeScreen } from '@/features/home/HomeScreen';
import { formatInsightsClientName } from '@/features/insights/insights-receipt';
import { ProductCatalogScreen } from '@/features/products/catalog/ProductCatalogScreen';
import { useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { SaleCreationScreen } from '@/features/sales/creation/SaleCreationScreen';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import type { SourisDatabase } from '@/persistence/database';
import { loadProducts } from '@/persistence/stores/products';
import { loadSales } from '@/persistence/stores/sales';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { formatCompactEuroCents, formatEuroCents } from '@/shared/lib/money';
import { receiptPrint } from '@/shared/ui/theme';

import { PlaygroundDemoHubScreen } from '../PlaygroundDemoHubScreen';
import { PlaygroundDemoRuntime } from '../PlaygroundDemoRuntime';
import { createPlaygroundDemoScenario, type PlaygroundDemoScenario } from '../scenarios';
import { PlaygroundDemoSessionProvider, usePlaygroundDemoSession, type PlaygroundDemoSessionValue } from '../session';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockFocusEffects = new Set<() => void>();

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text: RNText } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { readonly href: string }) => React.createElement(RNText, { testID: 'redirect' }, href),
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        mockFocusEffects.add(effect as () => void);
        const cleanup = effect();
        return () => {
          mockFocusEffects.delete(effect as () => void);
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]);
    },
    useRouter: () => ({ push: mockPush, back: mockBack, dismissTo: jest.fn() }),
    useNavigation: () => ({ dispatch: jest.fn() }),
    useIsFocused: () => true,
  };
});
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});
jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { DateTimePicker: () => React.createElement(View, null) };
});
jest.mock('@/shared/ui/BarcodeScannerModal', () => ({ BarcodeScannerModal: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
jest.mock('@/shared/lib/image-pixel-size', () => ({ fitImageToPixelSize: jest.fn(async () => undefined) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));
jest.mock('react-native-reanimated', () => jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'));
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  class MockModal extends React.Component<{ visible?: boolean; onDismiss?: () => void; children?: React.ReactNode }> {
    componentDidUpdate(previous: { visible?: boolean }) {
      if (previous.visible && !this.props.visible) this.props.onDismiss?.();
    }
    render() {
      return this.props.visible ? React.createElement(View, null, this.props.children) : null;
    }
  }
  return { __esModule: true, default: MockModal };
});
jest.mock('../../availability', () => ({ isPlaygroundAvailable: jest.fn(() => true) }));

// Isolation boundary: none of these may be loaded by the demo or the screens it mounts.
jest.mock('@/infrastructure/supabase', () => {
  throw new Error('the Playground demo must never load the Supabase gateways');
});
jest.mock('@/infrastructure/revenuecat', () => {
  throw new Error('the Playground demo must never load RevenueCat');
});
jest.mock('@/persistence/expo-database', () => {
  throw new Error('the Playground demo must never open the device database');
});
jest.mock('@/providers/CloudSyncRunner', () => {
  throw new Error('the Playground demo must never mount the cloud sync runner');
});

type Profession = 'HAIRDRESSING' | 'NAILS' | 'ESTHETICS';

// A Wednesday afternoon far from the real clock: the fixtures are relative to it.
const NOW = new Date(2027, 2, 10, 15, 30);

interface Probe {
  readonly appointments: readonly Appointment[];
  readonly deposits: readonly AppointmentDeposit[];
  readonly sales: readonly Sale[];
  readonly saleAdjustments: ReturnType<typeof useSaleSession>['saleAdjustments'];
  readonly products: readonly Product[];
  readonly completeSale: ReturnType<typeof useSaleSession>['completeSale'];
  readonly recordAppointmentDeposit: ReturnType<typeof useAppointmentSession>['recordAppointmentDeposit'];
}

const probe: { current?: Probe } = {};
const session: { current?: PlaygroundDemoSessionValue } = {};
const auth: { current?: AuthState } = {};

function DemoProbe() {
  const { appointments, deposits, recordAppointmentDeposit } = useAppointmentSession();
  const { sales, saleAdjustments, completeSale } = useSaleSession();
  const { products } = useProductCatalog();
  useEffect(() => {
    probe.current = {
      appointments: appointments.map((entry) => entry.appointment),
      deposits,
      sales,
      saleAdjustments,
      products,
      completeSale,
      recordAppointmentDeposit,
    };
  });
  return null;
}

function AutoStart({ activityType }: { readonly activityType: Profession }) {
  const value = usePlaygroundDemoSession();
  const { state } = useAuth();
  useEffect(() => {
    session.current = value;
    auth.current = state;
  });
  const { start, scenario } = value;
  useEffect(() => {
    if (scenario === null) start(activityType);
  }, [activityType, scenario, start]);
  return null;
}

function Tree({
  activityType,
  databases,
  children,
}: {
  readonly activityType: Profession;
  readonly databases: SourisDatabase[];
  readonly children: ReactNode;
}) {
  const [gateway] = useState(createFakeAuthGateway);
  const [openDatabase] = useState(() => () => {
    const database = openTestDatabase();
    databases.push(database);
    return database;
  });
  return (
    <AuthProvider gateway={gateway}>
      <PlaygroundDemoSessionProvider>
        <AutoStart activityType={activityType} />
        <PlaygroundDemoRuntime now={() => NOW} openDatabase={openDatabase}>
          {children}
          <DemoProbe />
        </PlaygroundDemoRuntime>
      </PlaygroundDemoSessionProvider>
    </AuthProvider>
  );
}

async function renderDemo(activityType: Profession, screen: ReactNode) {
  const databases: SourisDatabase[] = [];
  const view = await render(
    <Tree activityType={activityType} databases={databases}>
      {screen}
    </Tree>,
  );
  await waitFor(() => expect(probe.current).toBeDefined());
  return { view, databases, scenario: createPlaygroundDemoScenario(activityType, NOW) };
}

type View = Awaited<ReturnType<typeof renderDemo>>['view'];

const press = (view: View, testID: string) => act(async () => fireEvent.press(view.getByTestId(testID)));
const sources = () => ({ appointments: probe.current!.appointments, sales: probe.current!.sales, deposits: probe.current!.deposits });
const productId = (scenario: PlaygroundDemoScenario, key: string) => `${scenario.business.id}-product-${key}`;

/** A standalone cash sale through the session — what « Nouvelle vente » commits. */
function sellCash(scenario: PlaygroundDemoScenario, key: string, priceCents: number) {
  return probe.current!.completeSale({
    id: `demo-test-sale-${key}`,
    businessId: scenario.business.id,
    completedAt: new Date(NOW.getTime() - 60_000),
    payment: { cardAmountCents: 0, cashAmountCents: priceCents },
    lines: [{ id: `demo-test-line-${key}`, productId: productId(scenario, key), quantity: 1 }],
  });
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  jest.setSystemTime(NOW);
  probe.current = undefined;
  session.current = undefined;
  auth.current = undefined;
  mockPush.mockClear();
  mockBack.mockClear();
  mockFocusEffects.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Playground Step B2 — the business screens on the demo data', () => {
  it('Accueil reads the demo’s today with the real day summary and follows its mutations', async () => {
    const { view, scenario } = await renderDemo('HAIRDRESSING', <HomeScreen />);
    const expected = getAppointmentDaySummary(
      { appointments: scenario.seed.appointments, sales: scenario.seed.sales, deposits: [] },
      NOW,
    );
    expect(expected.appointmentCount).toBe(5);
    expect(view.getByTestId('home-stat-appointments').props.children).toBe(String(expected.appointmentCount));
    expect(view.getByTestId('home-stat-potential').props.children).toBe(formatCompactEuroCents(expected.potentialRevenueCents));
    // « encaissé » is THE Caisse total of today (standalone Sales included), not the Appointments' money.
    const caisseBefore = getCashRegisterDaySummary({ ...sources(), saleAdjustments: probe.current!.saleAdjustments }, NOW).totalCents;
    expect(view.getByTestId('home-stat-collected').props.children).toBe(formatCompactEuroCents(caisseBefore));

    // A deposit and a « Revente » on today's 11:00 appointment, through the real sessions.
    const appointmentId = `${scenario.business.id}-appointment-t3`;
    await act(async () => {
      probe.current!.recordAppointmentDeposit({
        id: 'demo-test-deposit',
        appointmentId,
        amountCents: 2000,
        paymentMethod: 'CARD',
      });
    });
    await act(async () => {
      const result = probe.current!.completeSale({
        id: 'demo-test-revente',
        businessId: scenario.business.id,
        clientId: probe.current!.appointments.find((entry) => entry.id === appointmentId)!.clientId,
        appointmentId,
        completedAt: NOW,
        lines: [{ id: 'demo-test-revente-line', productId: productId(scenario, 'serum'), quantity: 1 }],
      });
      expect(result.ok).toBe(true);
    });
    const after = getAppointmentDaySummary(sources(), NOW);
    expect(after.collectedCents).toBe(expected.collectedCents + 2000);
    expect(after.potentialRevenueCents).toBe(expected.potentialRevenueCents + 2100);
    // The deposit received today counts once; the Revente is money of its Appointment, not counted twice.
    expect(view.getByTestId('home-stat-collected').props.children).toBe(formatCompactEuroCents(caisseBefore + 2000));
    expect(view.getByTestId('home-stat-potential').props.children).toBe(formatCompactEuroCents(after.potentialRevenueCents));

    // The shortcuts push the product's paths, which resolve inside the demo group.
    await press(view, 'home-new-sale');
    expect(mockPush).toHaveBeenLastCalledWith('/sales/new');
    await press(view, 'home-collection-summary');
    expect(mockPush).toHaveBeenLastCalledWith('/cash-register');
  });

  it('Produits lists the profession’s own products', async () => {
    const { view, scenario } = await renderDemo('NAILS', <ProductCatalogScreen />);
    for (const product of scenario.seed.products.filter((entry) => entry.active)) {
      expect(view.getAllByText(product.name).length).toBeGreaterThan(0);
    }
    expect(view.queryByText('Shampooing doux')).toBeNull();
    expect(probe.current!.products.map((product) => product.id).sort()).toEqual(
      scenario.seed.products.map((product) => product.id).sort(),
    );
  });

  it('« Nouvelle vente »: the real form sells a demo product, decrements its stock and records the payment', async () => {
    const { view, scenario, databases } = await renderDemo('ESTHETICS', <SaleCreationScreen />);
    const serum = productId(scenario, 'serum');
    const stockBefore = probe.current!.products.find((product) => product.id === serum)!.stockQuantity;
    const salesBefore = probe.current!.sales.length;

    await press(view, 'sale-client-row');
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'Jade');
    });
    await act(async () => fireEvent.press(view.getByText('Jade Amande')));
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un produit'), 'Sérum');
    });
    await press(view, `sale-product-${serum}`);
    await press(view, 'validate-sale');
    expect(view.getByTestId('sale-payment-sheet')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(view.getByTestId('checkout-amount-card'), '39');
    });
    await press(view, 'confirm-checkout');

    expect(probe.current!.sales).toHaveLength(salesBefore + 1);
    const sale = probe.current!.sales.at(-1)!;
    expect(sale.clientId).toBe(`${scenario.business.id}-client-jade`);
    expect(sale.appointmentId).toBeUndefined();
    expect(sale.payment).toMatchObject({ cardAmountCents: 3900, cashAmountCents: 0 });
    expect(probe.current!.products.find((product) => product.id === serum)!.stockQuantity).toBe(stockBefore - 1);
    // Written to the demo's own in-memory database — the only one opened.
    expect(databases).toHaveLength(1);
    expect(loadProducts(databases[0]!).find((product) => product.id === serum)!.stockQuantity).toBe(stockBefore - 1);
    expect(loadSales(databases[0]!).some((stored) => stored.id === sale.id)).toBe(true);
    // The Cash Register counts it today, by card.
    expect(getCashRegisterDaySummary(sources(), NOW).cardCents).toBe(
      getCashRegisterDaySummary(
        { appointments: scenario.seed.appointments, sales: scenario.seed.sales, deposits: [] },
        NOW,
      ).cardCents + 3900,
    );
    expect(mockBack).toHaveBeenCalled();
  });

  it('« Revente » from an appointment: the sale is linked, unpaid, and joins what the checkout settles', async () => {
    const scenario = createPlaygroundDemoScenario('HAIRDRESSING', NOW);
    const appointmentId = `${scenario.business.id}-appointment-t3`;
    const { view } = await renderDemo('HAIRDRESSING', <SaleCreationScreen initialAppointmentId={appointmentId} />);
    const appointment = () => probe.current!.appointments.find((entry) => entry.id === appointmentId)!;
    const dueBefore = getAppointmentCheckoutDueCents(appointment(), probe.current!.sales, probe.current!.deposits);
    const cashBefore = getCashRegisterDaySummary(sources(), NOW).totalCents;
    const spray = productId(scenario, 'spray');

    // The appointment's client is fixed: no picker to open.
    expect(view.getByTestId('sale-client-row').props.accessibilityRole).not.toBe('button');
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un produit'), 'Spray');
    });
    await press(view, `sale-product-${spray}`);
    await press(view, 'validate-sale');

    const sale = probe.current!.sales.at(-1)!;
    expect(sale.appointmentId).toBe(appointmentId);
    expect(sale.clientId).toBe(appointment().clientId);
    expect(sale.payment).toBeUndefined();
    expect(getAppointmentCheckoutDueCents(appointment(), probe.current!.sales, probe.current!.deposits)).toBe(dueBefore + 1600);
    // Nothing is counted before the appointment is checked out: no money twice.
    expect(getCashRegisterDaySummary(sources(), NOW).totalCents).toBe(cashBefore);
  });

  it('the Cash Register shows the demo day’s totals and card / cash split, and follows a new payment', async () => {
    const { view, scenario } = await renderDemo('NAILS', <CashRegisterScreen />);
    const expected = getCashRegisterDaySummary(
      { appointments: scenario.seed.appointments, sales: scenario.seed.sales, deposits: [] },
      NOW,
    );
    expect(expected.totalCents).toBe(900); // today's walk-in file, by card
    expect(view.getByTestId('cash-register-total').props.children).toBe(formatEuroCents(expected.totalCents));
    expect(view.getByTestId('cash-register-card').props.accessibilityLabel).toContain(formatEuroCents(expected.cardCents));
    expect(view.getByTestId('cash-register-cash').props.accessibilityLabel).toContain(formatEuroCents(expected.cashCents));

    await act(async () => {
      expect(sellCash(scenario, 'hand-cream', 1400).ok).toBe(true);
    });
    expect(view.getByTestId('cash-register-total').props.children).toBe(formatEuroCents(expected.totalCents + 1400));
    expect(view.getByTestId('cash-register-cash').props.accessibilityLabel).toContain(
      formatEuroCents(expected.cashCents + 1400),
    );
  });

  it('Tops & tendances ranks the demo with the real insights, and a client place opens the demo profile', async () => {
    const { view, scenario } = await renderDemo('HAIRDRESSING', <PlaygroundDemoHubScreen />);
    const insights = getBusinessInsights(
      { appointments: scenario.seed.appointments, sales: scenario.seed.sales, deposits: [] },
      getInsightsPeriod('MONTH', NOW),
    );
    expect(insights.topServices.length).toBeGreaterThan(0);
    expect(insights.topProducts.length).toBeGreaterThan(0);
    expect(insights.topSpendingClients.length).toBeGreaterThan(0);
    expect(insights.topLoyalClients.length).toBeGreaterThan(0);

    await press(view, 'playground-demo-insights');
    expect(view.getByTestId('business-insights-receipt')).toBeTruthy();
    expect(view.getByTestId('business-insights-period-label').props.children).toBe('Mars 2027');

    // The carousel's last category, « Clients les plus fidèles ».
    await act(async () =>
      fireEvent(view.getByTestId('business-insights-rankings'), 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { x: 10_000, y: 0 } },
      }),
    );
    const winner = scenario.seed.clients.find((client) => client.id === insights.topLoyalClients[0]!.clientId);
    const place = view.getByTestId('business-insights-podium-loyalClients-place-1');
    expect(place.props.accessibilityLabel).toContain(formatInsightsClientName(winner));
    await act(async () => fireEvent.press(place));
    await act(async () => {
      jest.advanceTimersByTime(receiptPrint.dismiss);
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/clients/[clientId]', params: { clientId: winner!.id } });
    // Back on the hub, the ticket prints again where it was.
    await act(async () => {
      for (const effect of mockFocusEffects) effect();
    });
    expect(view.getByTestId('business-insights-receipt')).toBeTruthy();
  });

  it('the hub counts products and sales and opens the demo’s Cash Register', async () => {
    const { view, scenario } = await renderDemo('ESTHETICS', <PlaygroundDemoHubScreen />);
    const summary = view.getByTestId('playground-demo-business').props.accessibilityLabel as string;
    expect(summary).toContain(`${scenario.seed.products.length} produits`);
    expect(summary).toContain(`${scenario.seed.sales.length} ventes`);
    await press(view, 'playground-demo-cash-register');
    expect(mockPush).toHaveBeenCalledWith('/cash-register');
    expect(view.queryByText(/ne font pas partie de cette démonstration/)).toBeNull();
  });

  it('reset restores the original products, stock and sales, in a new database; auth is never touched', async () => {
    const { scenario, databases } = await renderDemo('NAILS', <Text>demo</Text>);
    const oil = productId(scenario, 'cuticle-oil');
    const original = probe.current!.products.find((product) => product.id === oil)!.stockQuantity;
    await act(async () => {
      expect(sellCash(scenario, 'cuticle-oil', 1200).ok).toBe(true);
    });
    expect(probe.current!.products.find((product) => product.id === oil)!.stockQuantity).toBe(original - 1);

    await act(async () => {
      session.current!.reset();
    });
    await waitFor(() => expect(databases).toHaveLength(2));
    await waitFor(() => expect(probe.current!.sales).toHaveLength(scenario.seed.sales.length));
    expect(probe.current!.products.find((product) => product.id === oil)!.stockQuantity).toBe(original);
    expect(loadSales(databases[1]!)).toHaveLength(scenario.seed.sales.length);
    expect(auth.current).toEqual({ status: 'unauthenticated' });
  });
});

describe('Playground Step B2 — rankings belong to each profession', () => {
  it('switching profession changes the business data and the rankings, never sharing a record', () => {
    const results = (['HAIRDRESSING', 'NAILS', 'ESTHETICS'] as const).map((activityType) => {
      const { seed, business } = createPlaygroundDemoScenario(activityType, NOW);
      return {
        business,
        insights: getBusinessInsights(
          { appointments: seed.appointments, sales: seed.sales, deposits: [] },
          getInsightsPeriod('YEAR', NOW),
        ),
      };
    });
    for (const { business, insights } of results) {
      for (const row of [...insights.topSpendingClients, ...insights.topLoyalClients]) {
        expect(row.clientId.startsWith(`${business.id}-client-`)).toBe(true);
      }
      for (const row of insights.topProducts) expect(row.productId.startsWith(`${business.id}-product-`)).toBe(true);
      for (const row of insights.topServices) expect(row.serviceId.startsWith(`${business.id}-service-`)).toBe(true);
      expect(insights.topLoyalClients[0]!.completedAppointmentCount).toBeGreaterThanOrEqual(3);
      expect(insights.soldProductUnitCount).toBeGreaterThan(0);
    }
    const winners = results.map(({ insights }) => insights.topSpendingClients[0]!.clientId);
    expect(new Set(winners).size).toBe(3);
  });
});
