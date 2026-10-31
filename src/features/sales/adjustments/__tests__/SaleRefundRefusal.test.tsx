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
import { usePersistence } from '@/providers/PersistenceProvider';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';

import { SaleDetailScreen } from '../../history/SaleDetailScreen';
import { SaleAdjustmentScreen } from '../SaleAdjustmentScreen';
import { SaleRefundCorrectionScreen } from '../SaleRefundCorrectionScreen';
import {
  SALE_ADJUSTMENT_OTHER_DEVICE_NOTE,
  SALE_ADJUSTMENT_REFUSED_COPY,
  SALE_REFUND_MONEY_NOT_RETURNED_ACTION,
  SALE_REFUND_MONEY_RETURNED_ACTION,
  SALE_REFUND_REFUSAL_QUESTION,
  SALE_REFUND_SUMMARY_OVER_NOTE,
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
  const { completeSale, recordSaleAdjustment, recordSaleRefundOutflow, reverseSaleAdjustment, saleAdjustments } = useSaleSession();
  const { reloadSnapshot } = usePersistence();
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
        testID="seed-full-refund"
        onPress={() =>
          recordSaleAdjustment('sale-s3', {
            id: 'refund-full',
            reason: 'SALE_CANCELLED',
            lines: [],
            refundCardCents: 1800,
            refundCashCents: 0,
            settlement: 'SETTLED',
            refundedAt: new Date(2026, 9, 31, 15, 0),
          })
        }
      />
      <Pressable
        testID="seed-reverse-outflow-in-error"
        onPress={() => {
          try {
            reverseSaleAdjustment('refund-b-outflow', { id: 'rev-x', reason: 'RECORDED_IN_ERROR' });
          } catch {
            // Refused: the probe below shows nothing was written.
          }
        }}
      />
      {/* A's 12 € card refund, recorded on this device once B's refusal no longer counts. */}
      <Pressable
        testID="seed-refund-a"
        onPress={() =>
          recordSaleAdjustment('sale-s3', {
            id: 'refund-a',
            reason: 'CUSTOMER_REFUND',
            lines: [],
            refundCardCents: 1200,
            refundCashCents: 0,
            settlement: 'SETTLED',
            refundedAt: new Date(2026, 9, 31, 15, 0),
          })
        }
      />
      {/* A's 12 € refund as the pull writes it (the server accepted it first), before B's refusal is answered. */}
      <Pressable
        testID="seed-remote-refund-a"
        onPress={() => {
          const at = new Date(2026, 9, 31, 15, 0).toISOString();
          database.runSync(
            `INSERT INTO sale_adjustments (id, business_id, sale_id, kind, reverses_adjustment_id, reason, note, staff_member_id,
               refund_card_cents, refund_cash_cents, initial_status, status, refunded_at, settled_at, voided_at, recorded_at)
             VALUES ('refund-a', ?, 'sale-s3', 'REFUND', NULL, 'CUSTOMER_REFUND', NULL, 'staff-a', 1200, 0, 'SETTLED', 'SETTLED', ?, ?, NULL, ?)`,
            [testBusiness.id, at, at, at],
          );
          reloadSnapshot();
        }}
      />
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
  it('asks, in its own card, whether the money really left — the summary flags the line, never « synchronisé »', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, ['seed-refund', 'seed-refusal']);
    const resolution = within(view.getByTestId('sale-adjustment-refund-b-resolution'));
    expect(resolution.getByText(SALE_ADJUSTMENT_REFUSED_COPY)).toBeTruthy();
    expect(resolution.getByText(SALE_REFUND_REFUSAL_QUESTION)).toBeTruthy();
    expect(resolution.getByText(SALE_REFUND_MONEY_RETURNED_ACTION)).toBeTruthy();
    expect(resolution.getByText(SALE_REFUND_MONEY_NOT_RETURNED_ACTION)).toBeTruthy();
    // Still money that left on this device (financial status), flagged apart.
    expect(view.getByTestId('sale-adjustment-refund-b-status')).toHaveTextContent('Remboursement');
    expect(view.getByTestId('sale-adjustment-refund-b-refused')).toHaveTextContent('Refusé par le serveur : à vérifier');
    expect(view.queryByTestId('sale-adjustment-refund-b-void')).toBeNull();
    expect(view.queryByTestId('sale-adjustment-refund-b-correct')).toBeNull();
  });

  it('« Oui, l’argent a été rendu »: ONE additional refund in the summary; the refusal moves to the journal', async () => {
    const { view, database } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, ['seed-refund', 'seed-refusal']);
    await press(view, 'sale-adjustment-refund-b-money-returned');
    const dialog = view.getByTestId('sale-adjustments-dialog');
    expect(within(dialog).getByText('Enregistrer l’argent rendu ?')).toBeTruthy();
    expect(within(dialog).getByText(/remboursement supplémentaire de 10,00\s€ \(Carte 10,00\s€\), le 31 octobre 2026/)).toBeTruthy();
    await press(view, 'sale-adjustments-dialog-confirm');

    expect(records(view)).toEqual(['refund-b:VOIDED', 'refund-b-outflow:SETTLED']);
    // The summary shows the real money only: one line, never the voided entry.
    expect(view.getByTestId('sale-adjustment-refund-b-outflow-status')).toHaveTextContent('Remboursement supplémentaire');
    expect(view.queryByTestId('sale-adjustment-refund-b')).toBeNull();
    expect(view.getByTestId('sale-refund-summary-total')).toHaveTextContent(/10,00\s€/);
    expect(view.getByTestId('sale-detail-refunded')).toHaveTextContent('Remboursé : 10,00 €');
    // Not sent yet: said shortly; the question is gone.
    expect(view.getByTestId('sale-adjustment-refund-b-outflow-sync')).toHaveTextContent('Pas encore synchronisé');
    expect(view.queryByTestId('sale-adjustment-refund-b-resolution')).toBeNull();
    // The journal keeps the refusal, its outcome and its link.
    await press(view, 'sale-adjustments-history-toggle');
    expect(view.getByTestId('sale-adjustment-history-refund-b-status')).toHaveTextContent('SAISIE ANNULÉE');
    expect(view.getByTestId('sale-adjustment-history-refund-b-refusal-outcome')).toHaveTextContent(
      /argent rendu : enregistré comme remboursement supplémentaire le 31 octobre 2026/,
    );
    expect(
      database.getAllSync<{ aggregate_id: string }>(
        "SELECT aggregate_id FROM sync_outbox WHERE aggregate_type = 'SALE_ADJUSTMENT' ORDER BY id",
      ).map((row) => row.aggregate_id),
    ).toEqual(['refund-b', 'refund-b-outflow']);
  });

  it('« Non, l’argent n’a pas été rendu »: nothing left in the summary; the voided entry is only in the journal', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, ['seed-refund', 'seed-refusal']);
    await press(view, 'sale-adjustment-refund-b-money-not-returned');
    expect(within(view.getByTestId('sale-adjustments-dialog')).getByText('Aucun argent rendu ?')).toBeTruthy();
    await press(view, 'sale-adjustments-dialog-confirm');
    expect(records(view)).toEqual(['refund-b:VOIDED']);
    expect(view.queryByTestId('sale-refund-summary')).toBeNull();
    expect(view.queryByTestId('sale-detail-refunded')).toBeNull();
    expect(view.queryByTestId('sale-adjustments-history-list')).toBeNull();
    await press(view, 'sale-adjustments-history-toggle');
    expect(view.getByTestId('sale-adjustment-history-refund-b-status')).toHaveTextContent('SAISIE ANNULÉE');
    expect(view.getByTestId('sale-adjustment-history-refund-b-refusal-outcome')).toHaveTextContent(/argent non rendu/);
  });

  it('a refund not sent yet says so on its line', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, ['seed-refund']);
    expect(view.getByTestId('sale-adjustment-refund-b-sync')).toHaveTextContent('Pas encore synchronisé');
    expect(view.queryByTestId('sale-adjustment-refund-b-resolution')).toBeNull();
  });

  it('an additional refund the server cannot accept yet is never offered to be erased or corrected, and says why', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, [
      'seed-refund',
      'seed-refusal',
      'seed-money-returned',
      'seed-outflow-refusal',
    ]);
    expect(view.getByTestId('sale-adjustment-refund-b-outflow-refused')).toHaveTextContent('En attente du serveur');
    expect(view.queryByTestId('sale-adjustment-refund-b-outflow-resolution')).toBeNull();
    expect(view.queryByTestId('sale-adjustment-refund-b-outflow-void')).toBeNull();
    expect(view.queryByTestId('sale-adjustment-refund-b-outflow-correct')).toBeNull();
  });
});

describe('the example: an 18 € Sale, 12 € refunded, then 10 € really returned after a refusal', () => {
  it('reads as two real refunds, 22 € in total, 4 € too much — the voided entry is never counted', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, [
      'seed-refund',
      'seed-refusal',
      'seed-money-returned',
      'seed-refund-a',
    ]);
    const summary = within(view.getByTestId('sale-refund-summary'));
    expect(view.getByTestId('sale-refund-summary-original')).toHaveTextContent(/^Vente initiale18,00\s€$/);
    // In the order the money left: A at 15:00, then B's money at 15:03.
    expect(summary.getAllByTestId(/^sale-adjustment-refund-[ab](-outflow)?-status$/).map((node) => node.props.children)).toEqual([
      'Remboursement',
      'Remboursement supplémentaire',
    ]);
    expect(view.getByTestId('sale-adjustment-refund-a-amount')).toHaveTextContent(/^−12,00\s€$/);
    expect(view.getByTestId('sale-adjustment-refund-b-outflow-amount')).toHaveTextContent(/^−10,00\s€$/);
    expect(view.queryByTestId('sale-adjustment-refund-b')).toBeNull();
    expect(view.getByTestId('sale-refund-summary-total')).toHaveTextContent(/^Total remboursé22,00\s€$/);
    expect(view.getByTestId('sale-refund-summary-net')).toHaveTextContent(/^Solde de la vente−4,00\s€$/);
    const over = view.getByTestId('sale-refund-summary-over');
    expect(over).toHaveTextContent(/4,00\s€ remboursés en trop/);
    expect(over.props.accessibilityLabel).toMatch(new RegExp(`Attention, 4,00\\s€ remboursés en trop\\. ${SALE_REFUND_SUMMARY_OVER_NOTE}`));
    expect(view.getByTestId('sale-detail-refunded')).toHaveTextContent('Remboursé : 22,00 €');
    // « Reçu à la vente » stays the original payment.
    expect(view.getByTestId('sale-detail-payment-total').props.accessibilityLabel).toMatch(/^Reçu à la vente, 18,00\s€$/);
    // Each line speaks as one element: label, amount, day and method.
    expect(view.getByLabelText(/^Remboursement supplémentaire, −10,00\s€, 31 octobre 2026 · Carte 10,00\s€, Pas encore synchronisé$/)).toBeTruthy();
    expect(view.getByLabelText(/^Total remboursé, 22,00\s€$/)).toBeTruthy();
    // The journal lists all three records, the voided one struck through and « non compté ».
    await press(view, 'sale-adjustments-history-toggle');
    expect(view.getByTestId('sale-adjustments-history-toggle').props.accessibilityState).toEqual({ expanded: true });
    expect(
      within(view.getByTestId('sale-adjustments-history-list'))
        .getAllByTestId(/^sale-adjustment-history-[^-]+-[ab](-outflow)?$/)
        .map((node) => node.props.testID),
    ).toHaveLength(3);
  });

  it('the additional refund is corrected only by « Le client a rendu cet argent… », never cancelled', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, [
      'seed-refund',
      'seed-refusal',
      'seed-money-returned',
      'seed-refund-a',
    ]);
    expect(view.getByTestId('sale-adjustment-refund-b-outflow-correct')).toHaveTextContent('Le client a rendu cet argent…');
    expect(view.getByTestId('sale-adjustment-refund-a-correct')).toHaveTextContent('Corriger ce remboursement…');
  });

  it('before B answers, the refusal card leads; the line counts on this device but « en trop » waits for the answer', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, ['seed-refund', 'seed-refusal', 'seed-remote-refund-a']);
    expect(view.getByTestId('sale-adjustment-refund-b-resolution')).toBeTruthy();
    expect(view.getByTestId('sale-adjustment-refund-a-status')).toHaveTextContent('Remboursement');
    expect(view.getByTestId('sale-adjustment-refund-b-refused')).toHaveTextContent('Refusé par le serveur : à vérifier');
    expect(view.getByTestId('sale-refund-summary-total')).toHaveTextContent(/22,00\s€/);
    expect(view.queryByTestId('sale-refund-summary-over')).toBeNull();
  });
});

describe('a full refund', () => {
  it('reads « Entièrement remboursé » once, with a zero balance and no warning', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, ['seed-full-refund']);
    expect(view.getByTestId('sale-detail-refunded')).toHaveTextContent('Entièrement remboursé');
    expect(view.getByTestId('sale-refund-summary-full')).toHaveTextContent('Entièrement remboursé');
    expect(view.getByTestId('sale-refund-summary-net')).toHaveTextContent(/^Solde de la vente0,00\s€$/);
    expect(view.queryByTestId('sale-refund-summary-over')).toBeNull();
    // « Toute la vente… » is not said twice.
    expect(view.queryByTestId('sale-adjustments-done')).toBeNull();
  });
});

describe('a Sale without any refund', () => {
  it('keeps the clean detail: no refund section at all', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, []);
    expect(view.queryByTestId('sale-adjustments')).toBeNull();
    expect(view.queryByTestId('sale-detail-refunded')).toBeNull();
    expect(view.getByTestId('sale-detail-payment-total').props.accessibilityLabel).toMatch(/^Reçu à la vente, 18,00\s€$/);
  });
});

describe('correcting an additional refund', () => {
  it('never offers « saisi par erreur » — only the client giving it back, or nothing', async () => {
    const { view } = await renderSeeded(<SaleRefundCorrectionScreen adjustmentId="refund-b-outflow" />, [
      'seed-refund',
      'seed-refusal',
      'seed-money-returned',
    ]);
    expect(view.getByTestId('refund-correction-context')).toHaveTextContent(/^Remboursement supplémentaire de 10,00\s€/);
    expect(view.queryByTestId('refund-correction-meaning-RECORDED_IN_ERROR')).toBeNull();
    expect(view.getByTestId('refund-correction-meaning-REFUND_RETURNED')).toBeTruthy();
    expect(view.getByTestId('refund-correction-meaning-REALLY_PAID')).toBeTruthy();
  });

  it('the session itself refuses to reverse it as recorded in error', async () => {
    const { view } = await renderSeeded(<SaleDetailScreen saleId="sale-s3" />, [
      'seed-refund',
      'seed-refusal',
      'seed-money-returned',
      'seed-reverse-outflow-in-error',
    ]);
    expect(records(view)).toEqual(['refund-b:VOIDED', 'refund-b-outflow:SETTLED']);
  });
});

describe('the Caisse', () => {
  it('flags a refused refund as to be checked', async () => {
    const { view } = await renderSeeded(<CashRegisterScreen />, ['seed-refund', 'seed-refusal']);
    expect(view.getByTestId('cash-register-entry-sync-refund-b')).toHaveTextContent('Refusé par le serveur : à vérifier');
  });
});

describe('the Caisse after « l’argent a bien été rendu »', () => {
  it('counts the real outflow by its method and names it « Remboursement supplémentaire » — the voided refusal moves nothing', async () => {
    const { view } = await renderSeeded(<CashRegisterScreen />, ['seed-refund', 'seed-refusal', 'seed-money-returned']);
    // 18 € received by card − 10 € really returned by card.
    expect(view.getByTestId('cash-register-total')).toHaveTextContent(/^8,00\s€$/);
    expect(within(view.getByTestId('cash-register-methods')).getAllByText(/^8,00\s€$/)).toHaveLength(1);
    expect(within(view.getByTestId('cash-register-entry-refund-b-outflow')).getByText(/Remboursement supplémentaire/)).toBeTruthy();
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
