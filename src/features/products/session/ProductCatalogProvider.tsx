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
import {
  discardStoredMedia,
  discardTemporaryMedia,
  saveBusinessMedia,
} from '@/persistence/media/business-media';
import { useBusinessMediaRemote } from '@/providers/BusinessMediaProvider';
import { usePersistence, useSnapshotRefresh } from '@/providers/PersistenceProvider';
import { createUuidV4 } from '@/shared/lib/uuid';

import { discardProductImageIfOwned } from '../images/product-image-storage';
import { prepareProductPhoto } from '../images/product-photo-processing';
import {
  createProductPhotoPath,
  PRODUCT_PHOTO_CACHE_DIRECTORY,
  ProductPhotoSaveError,
} from '../images/product-photo-storage';
import type { ProductCatalogSessionValue, ProductPhotoChange } from './types';

const ProductCatalogContext = createContext<ProductCatalogSessionValue | null>(null);

function copyProduct(product: Product): Product {
  return { ...product };
}

/**
 * The Product with exactly these photo fields: the authoritative shared
 * `photoPath` and the legacy device-local `imageUri`. The Product form never
 * carries either; the catalog decides them.
 */
function withPhoto(
  product: Product,
  photoPath: string | undefined,
  imageUri: string | undefined,
): Product {
  const { photoPath: _photoPath, imageUri: _imageUri, ...rest } = product;
  return {
    ...rest,
    ...(photoPath !== undefined ? { photoPath } : {}),
    ...(imageUri !== undefined ? { imageUri } : {}),
  };
}

/** A duplicate id discovered while the photo was uploading: nothing is written. */
class DuplicateProductError extends Error {}

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
 * success.
 *
 * Product photo (docs/domain/PRODUCTS.md, CLOUD_SYNC.md §23): a NEW photo,
 * explicitly taken or chosen, becomes the ONE shared photo on Save —
 *
 *   normalize → upload a new object → write the Product with its `photoPath`
 *   (ONE row write, synced as PRODUCT) → remove the replaced object and the
 *   obsolete legacy local image, best effort
 *
 * A photo that cannot be prepared or uploaded refuses the whole Save with
 * `ProductPhotoSaveError`: nothing is written, the previous photo stays. A
 * failed row write removes the new object. Legacy local images are never
 * uploaded; without a photo change the Product keeps both photo fields as
 * they are.
 */
export function ProductCatalogProvider({ children }: PropsWithChildren) {
  const { database, files, snapshot } = usePersistence();
  const remote = useBusinessMediaRemote();
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
  // Remote changes applied by the sync runner (stock, price, photoPath … —
  // all fields of the same Product), adopted in place.
  useSnapshotRefresh((fresh) => commit(fresh.products.map(copyProduct)));

  const getProductById = (productId: string | undefined) => {
    if (!productId) return undefined;
    return products.find((product) => product.id === productId);
  };

  /**
   * Prepares and uploads the new photo, then runs `write` with its path. A
   * failed preparation or upload → ProductPhotoSaveError (nothing written);
   * a failed `write` is rethrown as is, after the new object is removed.
   */
  const storeNewPhoto = async (
    product: Product,
    sourceUri: string,
    previousPhotoPath: string | undefined,
    write: (photoPath: string) => void,
  ) => {
    let writeError: unknown;
    try {
      const prepared = await prepareProductPhoto(sourceUri);
      if (prepared.uri !== sourceUri) discardTemporaryMedia(files, sourceUri);
      await saveBusinessMedia(
        { files, remote },
        {
          objectPath: createProductPhotoPath(
            product.businessId,
            product.id,
            createUuidV4(),
            prepared.format,
          ),
          cacheDirectory: PRODUCT_PHOTO_CACHE_DIRECTORY,
          sourceUri: prepared.uri,
          previousObjectPath: previousPhotoPath,
          commit: (photoPath) => {
            try {
              write(photoPath);
            } catch (error) {
              writeError = error;
              throw error;
            }
          },
        },
      );
    } catch {
      if (writeError !== undefined) throw writeError;
      discardTemporaryMedia(files, sourceUri);
      throw new ProductPhotoSaveError();
    }
  };

  const addProduct = async (product: Product, photo?: ProductPhotoChange) => {
    assertValidProduct(product);
    if (committed.current.some((candidate) => candidate.id === product.id)) {
      throw new Error(`A Product with id "${product.id}" already exists`);
    }
    const draft = withPhoto(copyProduct(product), undefined, undefined);

    const insert = (next: Product) => {
      // A second call for the same id may have landed during the photo upload.
      if (findProduct(database, next.id)) throw new DuplicateProductError();
      insertProduct(database, next);
      commit([...committed.current, next]);
    };

    if (photo?.kind !== 'replace') {
      // The row is written after an await, like a save with a photo: a double
      // tap resolves to ONE insert through the database check in `insert`.
      await Promise.resolve();
      try {
        insert(draft);
      } catch (error) {
        if (error instanceof DuplicateProductError) return;
        throw error;
      }
      return;
    }

    try {
      await storeNewPhoto(draft, photo.uri, undefined, (photoPath) =>
        insert(withPhoto(draft, photoPath, undefined)),
      );
    } catch (error) {
      if (error instanceof DuplicateProductError) return;
      throw error;
    }
  };

  const updateProduct = async (product: Product, photo?: ProductPhotoChange) => {
    assertValidProduct(product);
    const existing = committed.current.find((candidate) => candidate.id === product.id);
    if (!existing) return;
    const base: Product = { ...copyProduct(product), id: existing.id, businessId: existing.businessId };

    const write = (next: Product) => {
      persistProduct(database, next);
      commit(committed.current.map((candidate) => (candidate.id === next.id ? next : candidate)));
    };

    if (photo === undefined) {
      write(withPhoto(base, existing.photoPath, existing.imageUri));
      return;
    }

    if (photo.kind === 'remove') {
      write(withPhoto(base, undefined, undefined));
      if (existing.photoPath !== undefined) {
        discardStoredMedia({ files, remote }, PRODUCT_PHOTO_CACHE_DIRECTORY, existing.photoPath);
      }
      discardProductImageIfOwned(files, existing.imageUri);
      return;
    }

    // The previous shared object is removed by saveBusinessMedia once the new
    // path is written; the legacy local image is obsolete from then on.
    await storeNewPhoto(existing, photo.uri, existing.photoPath, (photoPath) =>
      write(withPhoto(base, photoPath, undefined)),
    );
    discardProductImageIfOwned(files, existing.imageUri);
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
    if (existing.photoPath !== undefined) {
      discardStoredMedia({ files, remote }, PRODUCT_PHOTO_CACHE_DIRECTORY, existing.photoPath);
    }
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
