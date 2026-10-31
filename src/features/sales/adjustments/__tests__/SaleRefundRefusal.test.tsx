// P0 financial integrity: a refund the server REFUSED (two devices refunding the
// same Sale offline) is resolved by what really happened — never by a silent
// erasure — and every refund says its synchronization apart from its money.

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

import type { Product } from '@/domain/products';
import type { SaleDraft } from '@/domain/sales';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CashRegisterScreen } from '@/features/cash-register/CashRegisterScreen';
import { createInitialClients } from '@/features/clients/data/initial-clients';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider, useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider, useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import type { SourisDatabase } from '@/persistence/database';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';

import { SaleDetailScreen } from '../../history/SaleDetailScreen';
import { SaleAdjustmentScreen } from '../SaleAdjustmentScreen';
import {
  SALE_ADJUSTMENT_OTHER_DEVICE_NOTE,
  SALE_ADJUSTMENT_REFUSED_COPY,
  SALE_ADJUSTMENT_SYNC_PENDING_COPY,
  SALE_REFUND_MONEY_NOT_RETURNED_ACTION,
  SALE_REFUND_MONEY_RETURNED_ACTION,
  SALE_REFUND_OUTFLOW_REFUSED_COPY,
  SALE_REFUND_REFUSAL_QUESTION,
} from '../presentation';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-reanimated', () => jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  jest.requireActual('@/shared/ui/testing/mock-reanimated-swipeable'),
);
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const [, client] = createInitialClients();
const now = new Date(2026, 9, 31, 15, 6);
const product: Product = { id: 'p-shampoo', businessId: testBusiness.id, name: 'Shampooing', price: 18, stockQuantity: 5, active: true };

const sale: SaleDraft = {
  id: 'sale-s3',
  businessId: testBusiness.id,
  clientId: client.id,
  completedAt: new Date(2026, 9, 31, 14, 58),
  lines: [{ id: 'sale-s3-1', productId: 'p-shampoo', quantity: 1 }],
  payment: { cardAmountCents: 1800, cashAmountCents: 0 },
};

/** The Sale, B's 10 € card refund — then the server's refusal of it, written as the push worker does. */
function Seed({ database }: { readonly database: SourisDatabase }) {
  const { addProduct } = useProductCatalog();
  const { completeSale, recordSaleAdjustment, recordSaleRefundOutflow, saleAdjustments } = useSaleSession();
  return (
    <>
      <Pressable
        testID="seed-product"
        onPress={() => {
          bindLocalDatabaseToBusiness(database, testBusiness);
          addProduct(product);
        }}
      />
      <Pressable testID="seed-sale" onPress={() => completeSale(sale)} />
      <Pressable
        testID="seed-refund"
        onPress={() =>
          recordSaleAdjustment('sale-s3', {
            id: 'refund-b',
            reason: 'CUSTOMER_REFUND',
            lines: [],
            refundCardCents: 1000,
            refundCashCents: 0,
            settlement: 'SETTLED',
            refundedAt: new Date(2026, 9, 31, 15, 3),
          })
        }
      />
      <Pressable
        testID="seed-refusal"
        onPress={() =>
          database.runSync(
            "UPDATE sync_outbox SET attempt_count = 1, last_error = 'ADJUSTMENT_CONFLICT' WHERE aggregate_type = 'SALE_ADJUSTMENT' AND aggregate_id = 'refund-b'",
          )
        }
      />
      <Pressable testID="seed-money-returned" onPress={() => recordSaleRefundOutflow('refund-b')} />
      <Pressable
        testID="seed-outflow-refusal"
        onPress={() =>
          database.runSync(
            "UPDATE sync_outbox SET attempt_count = 1, last_error = 'ADJUSTMENT_CONFLICT' WHERE aggregate_id = 'refund-b-outflow'",
          )
        }
      />
      <Text testID="probe-adjustments">
        {JSON.stringify(saleAdjustments.map((adjustment) => `${adjustment.id}:${adjustment.status}`))}
      </Text>
    </>
  );
}

function MountAfterSeed({ children }: { readonly children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <Pressable testID="mount-screen" onPress={() => setMounted(true)} />
      {mounted && children}
    </>
  );
}

async function renderSeeded(screen: ReactNode, steps: readonly string[]) {
  const database = openTestDatabase();
  const view = await render(
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <AppointmentSessionProvider>
              <MountAfterSeed>{screen}</MountAfterSeed>
              <Seed database={database} />
            </AppointmentSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
  for (const step of ['seed-product', 'seed-sale', ...steps, 'mount-screen']) {
    await press(view, step);
  }
  return { view, database };
}

async function press(view: Awaited<ReturnType<typeof render>>, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
}

const records = (view: Awaited<ReturnType<typeof render>>) =>
  JSON.parse(view.getByTestId('probe-adjustments').props.children as string) as string[];

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
});
beforeEach(() => {
  jest.setSystemTime(now);
});
afterAll(() => {
  jest.useRealTimers();
});

describe('a refund the server refused', () => {
  it('says it is refused — never synchronized — and asks whether the money really left, with no plain erasure', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, ['seed-refund', 'seed-refusal']);
    expect(view.getByTestId('sale-adjustment-refund-b-refused')).toHaveTextContent(SALE_ADJUSTMENT_REFUSED_COPY);
    const resolution = within(view.getByTestId('sale-adjustment-refund-b-resolution'));
    expect(resolution.getByText(SALE_REFUND_REFUSAL_QUESTION)).toBeTruthy();
    expect(resolution.getByText(SALE_REFUND_MONEY_RETURNED_ACTION)).toBeTruthy();
    expect(resolution.getByText(SALE_REFUND_MONEY_NOT_RETURNED_ACTION)).toBeTruthy();
    // The refund is still money that left (financial status), apart from its sync status.
    expect(view.getByTestId('sale-adjustment-refund-b-status')).toHaveTextContent('REMBOURSÉ');
    expect(view.queryByTestId('sale-adjustment-refund-b-void')).toBeNull();
    expect(view.queryByTestId('sale-adjustment-refund-b-correct')).toBeNull();
  });

  it('« Oui, l’argent a été rendu »: the refusal is voided and kept, ONE exceptional outflow records the real money', async () => {
    const { view, database } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, ['seed-refund', 'seed-refusal']);
    await press(view, 'sale-adjustment-refund-b-money-returned');
    const dialog = view.getByTestId('sale-adjustments-dialog');
    expect(within(dialog).getByText('Enregistrer l’argent rendu ?')).toBeTruthy();
    expect(within(dialog).getByText(/sortie exceptionnelle de 10,00\s€ \(Carte 10,00\s€\), le 31 octobre 2026/)).toBeTruthy();
    await press(view, 'sale-adjustments-dialog-confirm');

    expect(records(view)).toEqual(['refund-b:VOIDED', 'refund-b-outflow:SETTLED']);
    expect(view.getByTestId('sale-adjustment-refund-b-outflow-status')).toHaveTextContent('SORTIE EXCEPTIONNELLE');
    expect(view.getByTestId('sale-adjustment-refund-b-outflow-outflow')).toHaveTextContent(/Liée à la saisie refusée du 31 octobre 2026/);
    expect(view.getByTestId('sale-adjustment-refund-b-refusal-outcome')).toHaveTextContent(/argent rendu/);
    // Not sent yet: said plainly; the question is gone.
    expect(view.getByTestId('sale-adjustment-refund-b-outflow-sync')).toHaveTextContent(SALE_ADJUSTMENT_SYNC_PENDING_COPY);
    expect(view.queryByTestId('sale-adjustment-refund-b-resolution')).toBeNull();
    expect(view.getByTestId('sale-detail-outflow')).toHaveTextContent('Sortie exceptionnelle : 10,00 €');
    // Outside the ceiling: the 18 € Sale has refunded nothing within it.
    expect(view.queryByTestId('sale-detail-refunded')).toBeNull();
    expect(
      database.getAllSync<{ aggregate_id: string }>(
        "SELECT aggregate_id FROM sync_outbox WHERE aggregate_type = 'SALE_ADJUSTMENT' ORDER BY id",
      ).map((row) => row.aggregate_id),
    ).toEqual(['refund-b', 'refund-b-outflow']);
  });

  it('« Non, l’argent n’a pas été rendu »: the refusal is voided, kept and says so; nothing is counted', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, ['seed-refund', 'seed-refusal']);
    await press(view, 'sale-adjustment-refund-b-money-not-returned');
    expect(within(view.getByTestId('sale-adjustments-dialog')).getByText('Aucun argent rendu ?')).toBeTruthy();
    await press(view, 'sale-adjustments-dialog-confirm');
    expect(records(view)).toEqual(['refund-b:VOIDED']);
    expect(view.getByTestId('sale-adjustment-refund-b-status')).toHaveTextContent('SAISIE ANNULÉE');
    expect(view.getByTestId('sale-adjustment-refund-b-refusal-outcome')).toHaveTextContent(/argent non rendu/);
    expect(view.queryByTestId('sale-detail-outflow')).toBeNull();
  });

  it('a refund not sent yet says so', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, ['seed-refund']);
    expect(view.getByTestId('sale-adjustment-refund-b-sync')).toHaveTextContent(SALE_ADJUSTMENT_SYNC_PENDING_COPY);
    expect(view.queryByTestId('sale-adjustment-refund-b-resolution')).toBeNull();
  });

  it('an outflow the server cannot accept yet is never offered to be erased, and says why', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, [
      'seed-refund',
      'seed-refusal',
      'seed-money-returned',
      'seed-outflow-refusal',
    ]);
    expect(view.getByTestId('sale-adjustment-refund-b-outflow-refused')).toHaveTextContent(SALE_REFUND_OUTFLOW_REFUSED_COPY);
    expect(view.queryByTestId('sale-adjustment-refund-b-outflow-resolution')).toBeNull();
    expect(view.queryByTestId('sale-adjustment-refund-b-outflow-void')).toBeNull();
  });
});

describe('the Caisse', () => {
  it('names the real outflow « Sortie exceptionnelle », counted in its method, and flags what is not synchronized', async () => {
    const { view } = await renderSeeded(<CashRegisterScreen />, ['seed-refund', 'seed-refusal']);
    expect(view.getByTestId('cash-register-entry-sync-refund-b')).toHaveTextContent('Refusé par le serveur : à vérifier');
  });
});

describe('the Caisse after « l’argent a bien été rendu »', () => {
  it('counts the real outflow by its method and names it « Sortie exceptionnelle » — the voided refusal moves nothing', async () => {
    const { view } = await renderSeeded(<CashRegisterScreen />, ['seed-refund', 'seed-refusal', 'seed-money-returned']);
    // 18 € received by card − 10 € really returned by card.
    expect(view.getByTestId('cash-register-total')).toHaveTextContent(/^8,00\s€$/);
    expect(within(view.getByTestId('cash-register-methods')).getAllByText(/^8,00\s€$/)).toHaveLength(1);
    expect(within(view.getByTestId('cash-register-entry-refund-b-outflow')).getByText(/Sortie exceptionnelle/)).toBeTruthy();
    expect(view.queryByTestId('cash-register-entry-refund-b')).toBeNull();
    expect(view.getByTestId('cash-register-entry-sync-refund-b-outflow')).toHaveTextContent('Pas encore synchronisé');
  });
});

describe('the refund review', () => {
  it('warns that another unsynchronized device may refund the same Sale, and that nothing is erased without asking', async () => {
    const { view } = await renderSeeded(<SaleAdjustmentScreen intent="refund" saleId="sale-s3" />, []);
    await press(view, 'sale-adjustment-increment-sale-s3-1');
    await press(view, 'sale-adjustment-review');
    expect(view.getByTestId('sale-adjustment-other-device')).toHaveTextContent(SALE_ADJUSTMENT_OTHER_DEVICE_NOTE);
  });
});
