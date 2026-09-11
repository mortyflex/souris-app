import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import { prepareSaleCompletion, type Sale, type SaleDraft } from '@/domain/sales';
import { useProductCatalog } from '@/features/products/session/ProductCatalogProvider';

import type { SaleSessionValue } from './types';

const SaleSessionContext = createContext<SaleSessionValue | null>(null);

/**
 * The in-memory Sale session boundary.
 *
 * There is NO legacy Sale source: every session starts with an empty
 * collection. This provider composes the Product catalog so that Sale
 * completion and the stock decrement happen at one boundary:
 *
 *   validate whole draft → build snapshot → decrement stock → add Sale
 *
 * The two state updates are issued synchronously in the same call, after
 * validation, so React commits them together. A validation failure returns
 * the issues and touches nothing.
 */
export function SaleSessionProvider({ children }: PropsWithChildren) {
  const { products, decrementProductStock } = useProductCatalog();
  const [sales, setSales] = useState<readonly Sale[]>([]);

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

    decrementProductStock(result.stockDecrements);
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
