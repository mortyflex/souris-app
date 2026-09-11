import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import {
  applyStockDecrements,
  isAcceptableProductName,
  isValidProductPrice,
  isValidStockQuantity,
  type Product,
  type StockDecrement,
} from '@/domain/products';

import { createInitialProductCatalog } from '../data/initial-products';
import type { ProductCatalogSessionValue } from './types';

const ProductCatalogContext = createContext<ProductCatalogSessionValue | null>(null);

function copyProduct(product: Product): Product {
  return { ...product };
}

function assertValidProduct(product: Product) {
  if (
    product.id.trim().length === 0 ||
    product.businessId.trim().length === 0 ||
    !isAcceptableProductName(product.name) ||
    !isValidProductPrice(product.price) ||
    !isValidStockQuantity(product.stockQuantity)
  ) {
    throw new Error(`Invalid Product "${product.id}"`);
  }
}

/**
 * The single in-memory Product source shared by the Produits tab and Sale
 * creation/completion. Session only — no persistence yet.
 */
export function ProductCatalogProvider({ children }: PropsWithChildren) {
  const [products, setProducts] = useState<readonly Product[]>(() =>
    createInitialProductCatalog().map(copyProduct),
  );

  const getProductById = (productId: string | undefined) => {
    if (!productId) return undefined;
    return products.find((product) => product.id === productId);
  };

  const addProduct = (product: Product) => {
    assertValidProduct(product);
    if (products.some((candidate) => candidate.id === product.id)) {
      throw new Error(`A Product with id "${product.id}" already exists`);
    }
    setProducts((current) =>
      current.some((candidate) => candidate.id === product.id)
        ? current
        : [...current, copyProduct(product)],
    );
  };

  const updateProduct = (product: Product) => {
    assertValidProduct(product);
    setProducts((current) =>
      current.map((existing) =>
        existing.id === product.id
          ? { ...copyProduct(product), id: existing.id, businessId: existing.businessId }
          : existing,
      ),
    );
  };

  const setProductActive = (productId: string, active: boolean) => {
    setProducts((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, active } : product,
      ),
    );
  };

  const setProductStock = (productId: string, stockQuantity: number) => {
    if (!isValidStockQuantity(stockQuantity)) {
      throw new Error('Invalid Product stock quantity');
    }
    setProducts((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, stockQuantity } : product,
      ),
    );
  };

  const decrementProductStock = (decrements: readonly StockDecrement[]) => {
    // Validate against the current canonical state BEFORE scheduling any
    // update, so an impossible batch changes nothing (never negative stock).
    if (applyStockDecrements(products, decrements) === products) return;
    setProducts((current) => applyStockDecrements(current, decrements));
  };

  const deleteProduct = (productId: string) => {
    setProducts((current) => current.filter((product) => product.id !== productId));
  };

  return (
    <ProductCatalogContext.Provider
      value={{
        products,
        activeProducts: products.filter((product) => product.active),
        getProductById,
        addProduct,
        updateProduct,
        setProductActive,
        setProductStock,
        decrementProductStock,
        deleteProduct,
      }}
    >
      {children}
    </ProductCatalogContext.Provider>
  );
}

export function useProductCatalog(): ProductCatalogSessionValue {
  const value = useContext(ProductCatalogContext);
  if (!value) {
    throw new Error('useProductCatalog must be used inside ProductCatalogProvider');
  }
  return value;
}
