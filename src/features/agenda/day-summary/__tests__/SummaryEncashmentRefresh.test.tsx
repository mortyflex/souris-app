// « Résumé du jour » and « Résumé de la semaine » follow the money while they
// are open: a product sale recorded on THIS device (offline first, pushed
// later) and a sale + refund made on ANOTHER device (pulled by the runner's
// automatic tick) reach their « Encaissements » block at once — each amount
// once, never again after the round trip, and always equal to the Caisse
// total of the same days.

import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { Pressable } from 'react-native';

import {
  getCashRegisterDayInterval,
  getCashRegisterDaysInterval,
  getCashRegisterIntervalSummary,
} from '@/domain/cash-register';
import { AppointmentSessionProvider, useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider, useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { getWeekDays } from '@/features/agenda/calendar/week';
import { REMOTE_BUSINESS_ID, clientLea, createTestSeed, productMask, serviceCut } from '@/persistence/testing/fixtures';
import { createRemoteSale, refundOnDevice, SALE_ID, sellOnDevice } from '@/providers/testing/cloud-sync-fixtures';
import { renderTwoDevices } from '@/providers/testing/cloud-sync-harness';
import { formatEuroCents } from '@/shared/lib/money';

import { DaySummaryTicket } from '../DaySummaryTicket';
import { WeekSummaryTicket } from '../WeekSummaryTicket';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/shared/ui/testing/screen-mocks').expoRouterMock(),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-symbols', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoSymbolsMock());
jest.mock('expo-image', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoImageMock());
jest.mock('react-native-reanimated', () => jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'));
jest.mock('react-native-safe-area-context', () => jest.requireActual('@/shared/ui/testing/screen-mocks').safeAreaMock());

const LOCAL_SALE_ID = 'e1a2b3d4-1111-4222-8333-444455556699';
const seed = () => createTestSeed({ clients: [clientLea], services: [serviceCut], products: [productMask], appointments: [] });

/** One mask sold on THIS device, paid by card — the « Nouvelle vente » completion. */
function SellHere({ at }: { readonly at: Date }) {
  const { completeSale } = useSaleSession();
  return (
    <Pressable
      testID="sell-here"
      onPress={() => {
        const result = completeSale({
          id: LOCAL_SALE_ID,
          businessId: REMOTE_BUSINESS_ID,
          completedAt: at,
          lines: [{ id: `${LOCAL_SALE_ID}-line`, productId: productMask.id, quantity: 1 }],
          payment: { cardAmountCents: 5000, cashAmountCents: 0 },
        });
        if (!result.ok) throw new Error(JSON.stringify(result.issues));
      }}
    />
  );
}

/** The Caisse total of the open day and week, from the SAME sessions: what « Total encaissé » must equal. */
function CaisseProbe({ day }: { readonly day: Date }) {
  const { appointments, deposits } = useAppointmentSession();
  const { sales, saleAdjustments } = useSaleSession();
  const sources = { appointments: appointments.map((entry) => entry.appointment), sales, deposits, saleAdjustments };
  const weekDays = getWeekDays(day);
  return (
    <>
      <Pressable
        accessibilityLabel={formatEuroCents(getCashRegisterIntervalSummary(sources, getCashRegisterDayInterval(day)).totalCents)}
        testID="caisse-day"
      />
      <Pressable
        accessibilityLabel={formatEuroCents(
          getCashRegisterIntervalSummary(sources, getCashRegisterDaysInterval(weekDays[0], weekDays[6])).totalCents,
        )}
        testID="caisse-week"
      />
    </>
  );
}

async function renderSummaries(day: Date) {
  return renderTwoDevices(seed, () => (
    <ClientSessionProvider>
      <AppointmentSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <CalendarBlockSessionProvider>
              <DaySummaryTicket day={day} onClose={jest.fn()} visible />
              <WeekSummaryTicket day={day} onClose={jest.fn()} visible />
              <SellHere at={day} />
              <CaisseProbe day={day} />
            </CalendarBlockSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </AppointmentSessionProvider>
    </ClientSessionProvider>
  ));
}

type Scenario = Awaited<ReturnType<typeof renderSummaries>>;
const label = ({ view }: Scenario, testID: string) => view.getByTestId(testID).props.accessibilityLabel as string;
const text = ({ view }: Scenario, testID: string) =>
  view.queryByTestId(testID)?.props.children as string | undefined;

describe('« Encaissements » of the open summaries — offline first, then synchronised', () => {
  afterEach(() => jest.restoreAllMocks());

  it('a sale recorded here shows at once, and counts once after its push and pull', async () => {
    const day = new Date();
    const scenario = await renderSummaries(day);
    await waitFor(() => expect(scenario.remote.pulls.length).toBeGreaterThan(0));
    expect(label(scenario, 'day-summary-encashment-total')).toBe(`Total encaissé, ${formatEuroCents(0)}`);

    // Recorded locally, still in the outbox: the papers follow without any sync.
    await act(async () => {
      fireEvent.press(scenario.view.getByTestId('sell-here'));
    });
    expect(label(scenario, 'day-summary-encashment-productSales')).toBe(
      `Ventes de produits, 1 article, ${formatEuroCents(5000)}`,
    );
    expect(text(scenario, 'day-summary-encashment-productSales-count')).toBe(' (1 article)');
    expect(label(scenario, 'day-summary-encashment-total')).toBe(`Total encaissé, ${formatEuroCents(5000)}`);
    expect(label(scenario, 'week-summary-encashment-total')).toBe(`Total encaissé, ${formatEuroCents(5000)}`);
    // The Appointment figures keep their meaning: no Appointment, nothing « déjà encaissé » on them.
    expect(scenario.view.getByTestId('day-summary-metric-collected').props.accessibilityLabel).toBe(
      `Déjà encaissé, ${formatEuroCents(0)}`,
    );

    // Pushed, then pulled back: still ONE sale.
    await scenario.tick();
    await waitFor(() =>
      expect(scenario.remote.list(REMOTE_BUSINESS_ID).some((row) => row.key === `SALE/${LOCAL_SALE_ID}`)).toBe(true),
    );
    await scenario.tick();
    expect(label(scenario, 'day-summary-encashment-total')).toBe(`Total encaissé, ${formatEuroCents(5000)}`);
    expect(label(scenario, 'day-summary-encashment-total')).toBe(`Total encaissé, ${label(scenario, 'caisse-day')}`);
  });

  it('a sale and a partial refund made on another device reach the open papers through the automatic tick', async () => {
    const sale = createRemoteSale(20);
    const day = sale.completedAt;
    const scenario = await renderSummaries(day);
    await waitFor(() => expect(scenario.remote.pulls.length).toBeGreaterThan(0));

    // Device A sells offline (two masks, 100 €), then synchronises.
    sellOnDevice(scenario.other.database, sale);
    expect(await scenario.other.run()).toMatchObject({ status: 'PUSHED', pushed: 2 });
    await scenario.tick();
    await waitFor(() =>
      expect(label(scenario, 'day-summary-encashment-total')).toBe(`Total encaissé, ${formatEuroCents(10000)}`),
    );
    expect(text(scenario, 'day-summary-encashment-productSales-count')).toBe(' (2 articles)');
    expect(label(scenario, 'week-summary-encashment-productSales')).toBe(
      `Ventes de produits, 2 articles, ${formatEuroCents(10000)}`,
    );
    expect(scenario.view.queryByTestId('day-summary-encashment-refunds')).toBeNull();

    // Then refunds 15 € of it: its own line, the totals net — never counted twice.
    refundOnDevice(scenario.other.database, SALE_ID, 1500);
    expect(await scenario.other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    await scenario.tick();
    await waitFor(() =>
      expect(label(scenario, 'day-summary-encashment-total')).toBe(`Total encaissé, ${formatEuroCents(8500)}`),
    );
    expect(label(scenario, 'day-summary-encashment-refunds')).toBe(`Remboursements, ${formatEuroCents(-1500)}`);
    // The refund is money: still 2 articles sold, still 100 € of product sales.
    expect(label(scenario, 'day-summary-encashment-productSales')).toBe(
      `Ventes de produits, 2 articles, ${formatEuroCents(10000)}`,
    );
    expect(label(scenario, 'week-summary-encashment-total')).toBe(`Total encaissé, ${formatEuroCents(8500)}`);
    // THE Caisse total of the same day and week.
    expect(label(scenario, 'day-summary-encashment-total')).toBe(`Total encaissé, ${label(scenario, 'caisse-day')}`);
    expect(label(scenario, 'week-summary-encashment-total')).toBe(`Total encaissé, ${label(scenario, 'caisse-week')}`);
  });
});
