import { createContext, useContext, useRef, useState, type PropsWithChildren } from 'react';

import type { AppointmentProductIdentity } from '@/domain/appointments';
import {
  prepareSaleCompletion,
  removeAppointmentProduct,
  type Sale,
  type SaleDraft,
} from '@/domain/sales';
import { useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import {
  completeSale as persistSaleCompletion,
  deleteAppointmentProduct as persistAppointmentProductDeletion,
} from '@/persistence/stores/sales';
import { usePersistence } from '@/providers/PersistenceProvider';

import type { SaleSessionValue } from './types';

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
 */
export function SaleSessionProvider({ children }: PropsWithChildren) {
  const { database, snapshot } = usePersistence();
  const { products, applyCommittedStockDecrements, applyCommittedStockRestorations } =
    useProductCatalog();
  const [sales, setSales] = useState<readonly Sale[]>(snapshot.sales);
  // Mutations read the latest committed collection (not a render closure).
  const committed = useRef(sales);
  const commit = (next: readonly Sale[]) => {
    committed.current = next;
    setSales(next);
  };

  const getSaleById = (saleId: string | undefined) => {
    if (!saleId) return undefined;
    return sales.find((sale) => sale.id === saleId);
  };

  const completeSale = (draft: SaleDraft) => {
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
      value={{ sales, getSaleById, completeSale, deleteAppointmentProduct }}
    >
      {children}
    </SaleSessionContext.Provider>
  );
}

export function useSaleSession(): SaleSessionValue {
  const value = useContext(SaleSessionContext);
  if (!value) {
    throw new Error('useSaleSession must be used inside SaleSessionProvider');
  }
  return value;
}
