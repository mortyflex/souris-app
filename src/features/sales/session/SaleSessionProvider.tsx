import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import { prepareSaleCompletion, type Sale, type SaleDraft } from '@/domain/sales';
import { useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { completeSale as persistSaleCompletion } from '@/persistence/stores/sales';
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
 * A validation failure returns the issues and touches nothing. A database
 * failure rolls the transaction back and throws before any state changes.
 */
export function SaleSessionProvider({ children }: PropsWithChildren) {
  const { database, snapshot } = usePersistence();
  const { products, applyCommittedStockDecrements } = useProductCatalog();
  const [sales, setSales] = useState<readonly Sale[]>(snapshot.sales);

  const getSaleById = (saleId: string | undefined) => {
    if (!saleId) return undefined;
    return sales.find((sale) => sale.id === saleId);
  };

  const completeSale = (draft: SaleDraft) => {
    const result = prepareSaleCompletion(draft, products);
    if (!result.ok) return result;
    if (sales.some((sale) => sale.id === result.sale.id)) {
      throw new Error(`A Sale with id "${result.sale.id}" already exists`);
    }

    persistSaleCompletion(database, result.sale, result.stockDecrements);
    applyCommittedStockDecrements(result.stockDecrements);
    setSales((current) => [...current, result.sale]);
    return result;
  };

  return (
    <SaleSessionContext.Provider value={{ sales, getSaleById, completeSale }}>
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
