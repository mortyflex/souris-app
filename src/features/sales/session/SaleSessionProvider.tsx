import { createContext, useContext, useRef, useState, type PropsWithChildren } from 'react';

import type { AppointmentProductIdentity } from '@/domain/appointments';
import {
  isSaleRefundOutflow,
  prepareSaleAdjustment,
  prepareSaleCompletion,
  removeAppointmentProduct,
  type Sale,
  type SaleAdjustment,
  type SaleAdjustmentDraft,
  type SaleAdjustmentStockChange,
  type SaleDraft,
} from '@/domain/sales';
import { currentStaffMemberId } from '@/features/appointments/current-staff-member';
import { useBusinessWriteGuard } from '@/features/access/write-guard';
import { useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { isStoredAppointmentSettled } from '@/persistence/stores/appointment-deposits';
import {
  recordSaleAdjustment as persistSaleAdjustment,
  recordStoredSaleRefundOutflow,
  reverseStoredSaleAdjustment,
  settleStoredSaleAdjustment,
  voidStoredSaleAdjustment,
} from '@/persistence/stores/sale-adjustments';
import {
  completeSale as persistSaleCompletion,
  deleteAppointmentProduct as persistAppointmentProductDeletion,
} from '@/persistence/stores/sales';
import { readSaleAdjustmentSyncStates } from '@/persistence/sync/sale-adjustment-sync';
import { usePersistence, useSnapshotRefresh } from '@/providers/PersistenceProvider';

import type { SaleAdjustmentReversalRequest, SaleSessionValue } from './types';

const SaleSessionContext = createContext<SaleSessionValue | null>(null);

/**
 * The Sale session boundary.
 *
 * Hydrated once from the persisted snapshot. Completion is ONE operation:
 *
 *   validate whole draft → build snapshot
 *   → ONE SQLite transaction: stock revalidation + decrements + Sale + items
 *   → reflect the committed decrements in the Product catalog
 *   → add the Sale to state
 *
 * Removing a Product sold during an Appointment (swipe-to-delete in
 * Appointment Details) is the inverse, with the same discipline:
 *
 *   domain removal (matching lines, summed quantity, emptied Sales)
 *   → ONE SQLite transaction: stored re-verification + stock restoration
 *     + matching item deletion + empty parent Sale deletion
 *   → reflect the committed restoration in the Product catalog
 *   → replace the Sale collection in state
 *
 * A validation failure returns the issues and touches nothing. A database
 * failure rolls the transaction back and throws before any state changes.
 *
 * Corrections and refunds (docs/domain/SALES.md §15) never touch a Sale: each
 * is a Sale adjustment, prepared against the session state, then re-verified
 * and committed by the store in ONE transaction (record + restocked units +
 * outbox), then reflected — the record in state, the stock in the catalog.
 *
 * Every operation passes the business write guard FIRST
 * (features/access/write-guard.ts): refused, they throw before the draft is
 * even validated — never a Sale without its stock decrements, or the reverse.
 */
export function SaleSessionProvider({ children }: PropsWithChildren) {
  const { database, snapshot } = usePersistence();
  const requireWriteAccess = useBusinessWriteGuard();
  const { products, applyCommittedStockDecrements, applyCommittedStockRestorations } =
    useProductCatalog();
  const [sales, setSales] = useState<readonly Sale[]>(snapshot.sales);
  // Mutations read the latest committed collection (not a render closure).
  const committed = useRef(sales);
  const commit = (next: readonly Sale[]) => {
    committed.current = next;
    setSales(next);
  };
  const [saleAdjustments, setSaleAdjustments] = useState<readonly SaleAdjustment[]>(snapshot.saleAdjustments);
  const committedAdjustments = useRef(saleAdjustments);
  const commitAdjustments = (next: readonly SaleAdjustment[]) => {
    committedAdjustments.current = next;
    setSaleAdjustments(next);
  };
  const replaceAdjustment = (adjustment: SaleAdjustment) =>
    commitAdjustments(
      committedAdjustments.current.some((candidate) => candidate.id === adjustment.id)
        ? committedAdjustments.current.map((candidate) => (candidate.id === adjustment.id ? adjustment : candidate))
        : [...committedAdjustments.current, adjustment],
    );
  // Remote changes applied by the sync runner, adopted in place.
  useSnapshotRefresh((fresh) => {
    commit(fresh.sales);
    commitAdjustments(fresh.saleAdjustments);
  });

  // Units taken back from a Product the catalog no longer holds were skipped by the store.
  const takeBackCommittedStock = (decrements: readonly SaleAdjustmentStockChange[]) => {
    const known = decrements.filter((change) => products.some((product) => product.id === change.productId));
    if (known.length > 0) applyCommittedStockDecrements(known);
  };

  const isAppointmentSettled = (appointmentId: string) => isStoredAppointmentSettled(database, appointmentId);

  const recordSaleAdjustment = (saleId: string, draft: Omit<SaleAdjustmentDraft, 'businessId' | 'staffMemberId'>) => {
    requireWriteAccess('sales.recordSaleAdjustment');
    const sale = committed.current.find((candidate) => candidate.id === saleId);
    if (!sale) throw new Error(`recordSaleAdjustment: Sale "${saleId}" does not exist`);
    const full: SaleAdjustmentDraft = { ...draft, businessId: sale.businessId, staffMemberId: currentStaffMemberId };
    const now = new Date();
    const result = prepareSaleAdjustment(
      {
        sale,
        adjustments: committedAdjustments.current,
        appointmentSettled: sale.appointmentId === undefined || isAppointmentSettled(sale.appointmentId),
        productExists: (productId) => products.some((product) => product.id === productId),
        now,
      },
      full,
    );
    if (!result.ok) return result;
    if (committedAdjustments.current.some((candidate) => candidate.id === full.id)) {
      throw new Error(`A Sale adjustment with id "${full.id}" already exists`);
    }
    persistSaleAdjustment(database, full, result.adjustment, result.restorations, now);
    if (result.restorations.length > 0) applyCommittedStockRestorations(result.restorations);
    replaceAdjustment(result.adjustment);
    return result;
  };

  const settleSaleAdjustment = (adjustmentId: string, refundedAt: Date) => {
    requireWriteAccess('sales.settleSaleAdjustment');
    replaceAdjustment(settleStoredSaleAdjustment(database, adjustmentId, refundedAt, new Date()));
  };

  const voidSaleAdjustment = (adjustmentId: string) => {
    requireWriteAccess('sales.voidSaleAdjustment');
    const outcome = voidStoredSaleAdjustment(database, adjustmentId, new Date());
    takeBackCommittedStock(outcome.stockDecrements);
    replaceAdjustment(outcome.adjustment);
  };

  // « L'argent a bien été rendu » after a server refusal: the refused record is voided and
  // the real money movement is carried by ONE exceptional outflow (same transaction).
  const recordSaleRefundOutflow = (adjustmentId: string) => {
    requireWriteAccess('sales.recordSaleRefundOutflow');
    const outcome = recordStoredSaleRefundOutflow(database, adjustmentId, new Date());
    takeBackCommittedStock(outcome.stockDecrements);
    replaceAdjustment(outcome.voided);
    replaceAdjustment(outcome.outflow);
  };

  const reverseSaleAdjustment = (adjustmentId: string, input: SaleAdjustmentReversalRequest) => {
    requireWriteAccess('sales.reverseSaleAdjustment');
    // An additional refund is money the professional confirmed really left: never « saisi par erreur ».
    const target = committedAdjustments.current.find((adjustment) => adjustment.id === adjustmentId);
    if (input.reason === 'RECORDED_IN_ERROR' && target !== undefined && isSaleRefundOutflow(target)) {
      throw new Error('An additional refund cannot be reversed as recorded in error.');
    }
    const base = { id: input.id, staffMemberId: currentStaffMemberId, note: input.note, now: new Date() };
    const outcome = reverseStoredSaleAdjustment(
      database,
      adjustmentId,
      input.reason === 'RECORDED_IN_ERROR'
        ? { ...base, reason: 'RECORDED_IN_ERROR' }
        : {
            ...base,
            reason: 'REFUND_RETURNED',
            returnedAt: input.returnedAt,
            cardCents: input.cardCents,
            cashCents: input.cashCents,
          },
    );
    takeBackCommittedStock(outcome.stockDecrements);
    replaceAdjustment(outcome.adjustment);
  };

  // Read on demand (cheap, indexed): the sync runner updates the bookkeeping behind the session.
  const getSaleAdjustmentSyncStates = () => readSaleAdjustmentSyncStates(database);

  const getSaleById = (saleId: string | undefined) => {
    if (!saleId) return undefined;
    return sales.find((sale) => sale.id === saleId);
  };

  const completeSale = (draft: SaleDraft) => {
    requireWriteAccess('sales.completeSale');
    const result = prepareSaleCompletion(draft, products);
    if (!result.ok) return result;
    if (committed.current.some((sale) => sale.id === result.sale.id)) {
      throw new Error(`A Sale with id "${result.sale.id}" already exists`);
    }

    persistSaleCompletion(database, result.sale, result.stockDecrements);
    applyCommittedStockDecrements(result.stockDecrements);
    commit([...committed.current, result.sale]);
    return result;
  };

  const deleteAppointmentProduct = (
    appointmentId: string,
    identity: AppointmentProductIdentity,
  ) => {
    requireWriteAccess('sales.deleteAppointmentProduct');
    const result = removeAppointmentProduct(committed.current, appointmentId, identity);
    if (!result.ok) {
      throw new Error(
        `deleteAppointmentProduct: Product "${identity.productId}" of Appointment "${appointmentId}" cannot be removed (${result.issue.kind})`,
      );
    }

    // The stored rows are the authority: the committed restoration is what
    // the catalog reflects, the domain collection is what the session shows.
    const outcome = persistAppointmentProductDeletion(database, appointmentId, identity);
    applyCommittedStockRestorations([outcome.restoration]);
    commit(result.removal.sales);
  };

  return (
    <SaleSessionContext.Provider
      value={{
        sales,
        getSaleById,
        completeSale,
        deleteAppointmentProduct,
        saleAdjustments,
        isAppointmentSettled,
        recordSaleAdjustment,
        settleSaleAdjustment,
        voidSaleAdjustment,
        recordSaleRefundOutflow,
        reverseSaleAdjustment,
        getSaleAdjustmentSyncStates,
      }}
    >
      {children}
    </SaleSessionContext.Provider>
  );
}

/** For surfaces that may render with or without a Sale session (Appointment editing). */
export function useOptionalSaleSession(): SaleSessionValue | null {
  return useContext(SaleSessionContext);
}

export function useSaleSession(): SaleSessionValue {
  const value = useContext(SaleSessionContext);
  if (!value) {
    throw new Error('useSaleSession must be used inside SaleSessionProvider');
  }
  return value;
}
