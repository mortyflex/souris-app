import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import type { Product } from '@/domain/products';

import { createInitialProductCatalog } from '../../data/initial-products';
import { ProductCatalogProvider, useProductCatalog } from '../ProductCatalogProvider';
import { createMemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

const addedProduct: Product = {
  id: 'product-created',
  businessId: 'fixture-business',
  name: 'Shampooing Test',
  brand: 'Brand Test',
  category: 'Soin',
  barcode: '0123456789',
  imageUri: 'file:///products/product-a.jpg',
  price: 25,
  stockQuantity: 4,
  active: true,
};

const DURABLE_IMAGE = /^image:file:\/\/\/app\/Documents\/products\/product-created-\d+-\d+\.(jpg|png)$/;

/** Draft images exist as temporary files before the Product is saved. */
function createDraftFiles() {
  const files = createMemoryLocalFiles();
  files.addFile('file:///products/product-a.jpg');
  files.addFile('file:///products/product-b.png');
  return files;
}

function Probe() {
  const {
    products,
    activeProducts,
    getProductById,
    addProduct,
    updateProduct,
    setProductActive,
    setProductStock,
    applyCommittedStockDecrements,
    deleteProduct,
  } = useProductCatalog();
  const created = getProductById(addedProduct.id);
  const [lastError, setLastError] = useState('none');

  return (
    <>
      <Text>{`count:${products.length}`}</Text>
      <Text>{`active:${activeProducts.length}`}</Text>
      <Text>{created ? `${created.name}:${created.price}:${created.stockQuantity}:${created.active}` : 'missing'}</Text>
      <Text>{created ? `identity:${created.id}:${created.businessId}` : ''}</Text>
      <Text>{created ? `image:${created.imageUri ?? 'none'}` : ''}</Text>
      <Pressable testID="add" onPress={() => addProduct(addedProduct)} />
      <Pressable
        testID="add-twice"
        onPress={() => {
          addProduct(addedProduct);
          addProduct(addedProduct);
        }}
      />
      <Text>{`error:${lastError}`}</Text>
      <Pressable
        testID="add-invalid"
        onPress={() =>
          addProduct({ ...addedProduct, id: 'invalid-product', price: NaN }).catch(
            (error: Error) => setLastError(error.message),
          )
        }
      />
      <Pressable
        testID="update"
        onPress={() =>
          created &&
          updateProduct({
            ...created,
            businessId: 'ignored-business',
            name: 'Shampooing Premium',
            price: 29,
            stockQuantity: 7,
          })
        }
      />
      <Pressable
        testID="set-stock"
        onPress={() => setProductStock(addedProduct.id, 12)}
      />
      <Pressable
        testID="set-invalid-stock"
        onPress={() => setProductStock(addedProduct.id, -1)}
      />
      <Pressable
        testID="replace-image"
        onPress={() =>
          created &&
          updateProduct({
            ...created,
            imageUri: 'file:///products/product-b.png',
          })
        }
      />
      <Pressable
        testID="remove-image"
        onPress={() => {
          if (!created) return;
          updateProduct({ ...created, imageUri: undefined });
        }}
      />
      <Pressable
        testID="deactivate"
        onPress={() => setProductActive(addedProduct.id, false)}
      />
      <Pressable
        testID="reactivate"
        onPress={() => setProductActive(addedProduct.id, true)}
      />
      <Pressable
        testID="decrement-stock"
        onPress={() => applyCommittedStockDecrements([{ productId: addedProduct.id, quantity: 3 }])}
      />
      <Pressable
        testID="decrement-too-much"
        onPress={() =>
          applyCommittedStockDecrements([
            { productId: addedProduct.id, quantity: 1 },
            { productId: addedProduct.id, quantity: 4 },
          ])
        }
      />
      <Pressable testID="delete-added" onPress={() => deleteProduct(addedProduct.id)} />
      <Pressable testID="delete-unknown" onPress={() => deleteProduct('unknown-id')} />
    </>
  );
}

describe('ProductCatalogProvider', () => {
  it('seeds the real canonical import and exposes lookup', async () => {
    const view = await render(
      <TestPersistenceProvider files={createDraftFiles()}>
        <ProductCatalogProvider>
          <Probe />
        </ProductCatalogProvider>
      </TestPersistenceProvider>,
    );

    expect(view.getByText(`count:${createInitialProductCatalog().length}`)).toBeTruthy();
    expect(view.getByText(`active:${createInitialProductCatalog().length}`)).toBeTruthy();
    expect(view.getByText('missing')).toBeTruthy();
  });

  it('adds, updates, manages stock and activation without mutating the seed', async () => {
    const initial = createInitialProductCatalog();
    const initialSnapshot = JSON.stringify(initial);
    const view = await render(
      <TestPersistenceProvider files={createDraftFiles()}>
        <ProductCatalogProvider>
          <Probe />
        </ProductCatalogProvider>
      </TestPersistenceProvider>,
    );

    await act(async () => fireEvent.press(view.getByTestId('add')));
    expect(view.getByText('Shampooing Test:25:4:true')).toBeTruthy();
    expect(view.getByText(DURABLE_IMAGE)).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('set-stock')));
    expect(view.getByText('Shampooing Test:25:12:true')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('update')));
    expect(view.getByText('Shampooing Premium:29:7:true')).toBeTruthy();
    expect(view.getByText('identity:product-created:fixture-business')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('deactivate')));
    expect(view.getByText('Shampooing Premium:29:7:false')).toBeTruthy();
    expect(view.getByText(`active:${initial.length}`)).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('reactivate')));
    expect(view.getByText(`active:${initial.length + 1}`)).toBeTruthy();

    expect(JSON.stringify(initial)).toBe(initialSnapshot);
  });

  it('creates, replaces, and removes one image while preserving Product identity and fields', async () => {
    const view = await render(
      <TestPersistenceProvider files={createDraftFiles()}>
        <ProductCatalogProvider>
          <Probe />
        </ProductCatalogProvider>
      </TestPersistenceProvider>,
    );

    await act(async () => fireEvent.press(view.getByTestId('add')));
    const firstImage = view.getByText(DURABLE_IMAGE).props.children as string;
    expect(firstImage.endsWith('.jpg')).toBe(true);

    await act(async () => fireEvent.press(view.getByTestId('replace-image')));
    const secondImage = view.getByText(DURABLE_IMAGE).props.children as string;
    expect(secondImage.endsWith('.png')).toBe(true);
    expect(secondImage).not.toBe(firstImage);
    expect(view.getByText('identity:product-created:fixture-business')).toBeTruthy();
    expect(view.getByText('Shampooing Test:25:4:true')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('remove-image')));
    expect(view.getByText('image:none')).toBeTruthy();
    expect(view.getByText('identity:product-created:fixture-business')).toBeTruthy();
    expect(view.getByText('Shampooing Test:25:4:true')).toBeTruthy();
  });

  it('keeps duplicate ids and invalid canonical values out of the catalog', async () => {
    const initialCount = createInitialProductCatalog().length;
    const view = await render(
      <TestPersistenceProvider files={createDraftFiles()}>
        <ProductCatalogProvider>
          <Probe />
        </ProductCatalogProvider>
      </TestPersistenceProvider>,
    );

    await act(async () => fireEvent.press(view.getByTestId('add-twice')));
    expect(view.getByText(`count:${initialCount + 1}`)).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('add-invalid')));
    expect(view.getByText('error:Invalid Product "invalid-product"')).toBeTruthy();
    await expect(fireEvent.press(view.getByTestId('set-invalid-stock'))).rejects.toThrow(
      'Invalid Product stock quantity',
    );
    expect(view.getByText(`count:${initialCount + 1}`)).toBeTruthy();
  });

  it('decrements stock as a whole batch and never below zero', async () => {
    const view = await render(
      <TestPersistenceProvider files={createDraftFiles()}>
        <ProductCatalogProvider>
          <Probe />
        </ProductCatalogProvider>
      </TestPersistenceProvider>,
    );

    await act(async () => fireEvent.press(view.getByTestId('add')));
    await act(async () => fireEvent.press(view.getByTestId('decrement-stock')));
    expect(view.getByText('Shampooing Test:25:1:true')).toBeTruthy();

    await expect(fireEvent.press(view.getByTestId('decrement-too-much'))).rejects.toThrow(
      'would become negative',
    );
    expect(view.getByText('Shampooing Test:25:1:true')).toBeTruthy();
  });

  it('deletes the exact Product immutably with consistent unknown-id behavior', async () => {
    const initial = createInitialProductCatalog();
    const initialSnapshot = JSON.stringify(initial);
    const view = await render(
      <TestPersistenceProvider files={createDraftFiles()}>
        <ProductCatalogProvider>
          <Probe />
        </ProductCatalogProvider>
      </TestPersistenceProvider>,
    );

    await act(async () => fireEvent.press(view.getByTestId('add')));
    await act(async () => fireEvent.press(view.getByTestId('delete-added')));
    expect(view.getByText(`count:${initial.length}`)).toBeTruthy();
    expect(view.getByText('missing')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('delete-unknown')));
    expect(view.getByText(`count:${initial.length}`)).toBeTruthy();

    expect(JSON.stringify(initial)).toBe(initialSnapshot);
  });
});
