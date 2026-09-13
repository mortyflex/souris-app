import { createContext, useContext, useRef, useState, type PropsWithChildren } from 'react';

import {
  applyStockDecrements,
  applyStockRestorations,
  isAcceptableProductName,
  isValidProductPrice,
  isValidStockQuantity,
  type Product,
  type StockDecrement,
  type StockRestoration,
} from '@/domain/products';
import {
  deleteProduct as removeProduct,
  findProduct,
  insertProduct,
  setProductActive as persistProductActive,
  setProductStock as persistProductStock,
  updateProduct as persistProduct,
} from '@/persistence/stores/products';
import { usePersistence } from '@/providers/PersistenceProvider';

import {
  discardProductImageIfOwned,
  prepareProductImageCommit,
} from '../images/product-image-storage';
import type { ProductCatalogSessionValue } from './types';

const ProductCatalogContext = createContext<ProductCatalogSessionValue | null>(null);

function copyProduct(product: Product): Product {
  return { ...product };
}

function withImageUri(product: Product, imageUri: string | undefined): Product {
  const { imageUri: _ignored, ...rest } = product;
  return imageUri === undefined ? rest : { ...rest, imageUri };
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
 * The single Product source shared by the Produits tab and Sale
 * creation/completion. Hydrated once from the persisted snapshot; every
 * mutation is written to SQLite first and reflected in state only after
 * success. Saving a Product with a draft image promotes that image into
 * durable app storage before the row is written (see product-image-storage).
 */
export function ProductCatalogProvider({ children }: PropsWithChildren) {
  const { database, files, snapshot } = usePersistence();
  const [products, setProducts] = useState<readonly Product[]>(() =>
    snapshot.products.map(copyProduct),
  );
  // Mutations read the latest committed catalog (not a render closure) so an
  // awaited image copy never overwrites a stock change committed meanwhile.
  const committed = useRef(products);
  const commit = (next: readonly Product[]) => {
    committed.current = next;
    setProducts(next);
  };

  const getProductById = (productId: string | undefined) => {
    if (!productId) return undefined;
    return products.find((product) => product.id === productId);
  };

  const addProduct = async (product: Product) => {
    assertValidProduct(product);
    if (committed.current.some((candidate) => candidate.id === product.id)) {
      throw new Error(`A Product with id "${product.id}" already exists`);
    }

    const image = await prepareProductImageCommit(files, {
      productId: product.id,
      nextImageUri: product.imageUri,
    });
    const next = withImageUri(copyProduct(product), image.imageUri);
    try {
      // A second call for the same id may have landed during the image copy.
      if (findProduct(database, next.id)) {
        image.rollback();
        return;
      }
      insertProduct(database, next);
    } catch (error) {
      image.rollback();
      throw error;
    }
    commit([...committed.current, next]);
    image.finalize();
  };

  const updateProduct = async (product: Product) => {
    assertValidProduct(product);
    const existing = committed.current.find((candidate) => candidate.id === product.id);
    if (!existing) return;

    const image = await prepareProductImageCommit(files, {
      productId: existing.id,
      previousImageUri: existing.imageUri,
      nextImageUri: product.imageUri,
    });
    const next = withImageUri(
      { ...copyProduct(product), id: existing.id, businessId: existing.businessId },
      image.imageUri,
    );
    try {
      persistProduct(database, next);
    } catch (error) {
      image.rollback();
      throw error;
    }
    commit(committed.current.map((candidate) => (candidate.id === next.id ? next : candidate)));
    image.finalize();
  };

  const setProductActive = (productId: string, active: boolean) => {
    persistProductActive(database, productId, active);
    commit(
      committed.current.map((product) =>
        product.id === productId ? { ...product, active } : product,
      ),
    );
  };

  const setProductStock = (productId: string, stockQuantity: number) => {
    if (!isValidStockQuantity(stockQuantity)) {
      throw new Error('Invalid Product stock quantity');
    }
    persistProductStock(database, productId, stockQuantity);
    commit(
      committed.current.map((product) =>
        product.id === productId ? { ...product, stockQuantity } : product,
      ),
    );
  };

  const applyCommittedStockDecrements = (decrements: readonly StockDecrement[]) => {
    commit(applyStockDecrements(committed.current, decrements));
  };

  const applyCommittedStockRestorations = (restorations: readonly StockRestoration[]) => {
    commit(applyStockRestorations(committed.current, restorations));
  };

  const deleteProduct = (productId: string) => {
    const existing = committed.current.find((product) => product.id === productId);
    if (!existing) return;
    removeProduct(database, productId);
    commit(committed.current.filter((product) => product.id !== productId));
    discardProductImageIfOwned(files, existing.imageUri);
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
        applyCommittedStockDecrements,
        applyCommittedStockRestorations,
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
