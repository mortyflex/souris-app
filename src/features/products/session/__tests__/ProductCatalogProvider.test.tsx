import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import type { Product } from '@/domain/products';

import { createInitialProductCatalog } from '../../data/initial-products';
import { ProductCatalogProvider, useProductCatalog } from '../ProductCatalogProvider';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import {
  createFakeBusinessMediaRemote,
  type FakeBusinessMediaRemote,
} from '@/persistence/testing/fake-business-media-remote';
import { createMemoryLocalFiles, type MemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { BusinessMediaProvider } from '@/providers/BusinessMediaProvider';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

let mockFiles: MemoryLocalFiles;
let mockProcessingFails = false;
let mockPreparedCount = 0;
const mockPrepareProductPhoto = jest.fn(async (uri: string) => {
  if (mockProcessingFails) throw new Error('cannot decode');
  const png = uri.endsWith('.png');
  mockPreparedCount += 1;
  const prepared = `file:///app/Caches/ImageManipulator/prepared-${mockPreparedCount}.${png ? 'png' : 'jpg'}`;
  mockFiles.addFile(prepared, `normalized ${uri}`);
  return { uri: prepared, format: png ? 'png' : 'jpg' };
});

jest.mock('../../images/product-photo-processing', () => ({
  prepareProductPhoto: (uri: string) => mockPrepareProductPhoto(uri),
}));

const addedProduct: Product = {
  id: 'product-created',
  businessId: 'fixture-business',
  name: 'Shampooing Test',
  brand: 'Brand Test',
  category: 'Soin',
  barcode: '0123456789',
  price: 25,
  stockQuantity: 4,
  active: true,
};

const CAMERA_CAPTURE = 'file:///app/Caches/Camera/product-a.jpg';
const VISION_CUTOUT = 'file:///app/Caches/ProductImages/product-b.png';
const SHARED_PHOTO = /^photo:fixture-business\/products\/product-created\/[0-9a-f-]{36}\.(jpg|png)$/;

/** Photos just taken or chosen exist as temporary files before the Product is saved. */
function createDraftFiles() {
  const files = createMemoryLocalFiles();
  files.addFile(CAMERA_CAPTURE, 'photo A');
  files.addFile(VISION_CUTOUT, 'photo B');
  mockFiles = files;
  return files;
}

function renderCatalog(
  files: MemoryLocalFiles,
  remote: FakeBusinessMediaRemote | undefined,
  database?: SourisDatabase,
) {
  return render(
    <TestPersistenceProvider database={database} files={files}>
      <BusinessMediaProvider remote={remote}>
        <ProductCatalogProvider>
          <Probe />
        </ProductCatalogProvider>
      </BusinessMediaProvider>
    </TestPersistenceProvider>,
  );
}

function photoOf(view: Awaited<ReturnType<typeof render>>): string {
  return (view.getByText(SHARED_PHOTO).props.children as string).slice('photo:'.length);
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
      <Text>{created ? `photo:${created.photoPath ?? 'none'}` : ''}</Text>
      <Text>{created ? `image:${created.imageUri ?? 'none'}` : ''}</Text>
      <Pressable testID="add" onPress={() => addProduct(addedProduct)} />
      <Pressable
        testID="add-with-photo"
        onPress={() =>
          addProduct(addedProduct, { kind: 'replace', uri: CAMERA_CAPTURE }).catch((error: Error) =>
            setLastError(error.name),
          )
        }
      />
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
          updateProduct({ ...created, name: 'Shampooing Photo' }, { kind: 'replace', uri: VISION_CUTOUT }).catch(
            (error: Error) => setLastError(error.name),
          )
        }
      />
      <Pressable
        testID="remove-image"
        onPress={() => {
          if (!created) return;
          void updateProduct(created, { kind: 'remove' });
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
  beforeEach(() => {
    mockPrepareProductPhoto.mockClear();
    mockProcessingFails = false;
  });

  it('seeds the real canonical import and exposes lookup', async () => {
    const view = await renderCatalog(createDraftFiles(), undefined);

    expect(view.getByText(`count:${createInitialProductCatalog().length}`)).toBeTruthy();
    expect(view.getByText(`active:${createInitialProductCatalog().length}`)).toBeTruthy();
    expect(view.getByText('missing')).toBeTruthy();
  });

  it('adds, updates, manages stock and activation without mutating the seed', async () => {
    const initial = createInitialProductCatalog();
    const initialSnapshot = JSON.stringify(initial);
    const view = await renderCatalog(createDraftFiles(), undefined);

    await act(async () => fireEvent.press(view.getByTestId('add')));
    expect(view.getByText('Shampooing Test:25:4:true')).toBeTruthy();
    // No photo change: a Product saved without a photo has none, and needs no cloud.
    expect(view.getByText('photo:none')).toBeTruthy();
    expect(view.getByText('image:none')).toBeTruthy();

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

  it('an explicit photo becomes the ONE shared photo; replacement and removal keep identity and fields', async () => {
    const files = createDraftFiles();
    const remote = createFakeBusinessMediaRemote(files);
    const view = await renderCatalog(files, remote);

    await act(async () => fireEvent.press(view.getByTestId('add-with-photo')));
    const first = photoOf(view);
    expect(first.endsWith('.jpg')).toBe(true);
    expect(remote.objects.get(first)).toBe(`normalized ${CAMERA_CAPTURE}`);
    expect(mockPrepareProductPhoto).toHaveBeenCalledWith(CAMERA_CAPTURE);
    // Never a device path as the Product image: no legacy local image is written.
    expect(view.getByText('image:none')).toBeTruthy();
    // The temporary capture and processing files are consumed.
    expect(files.exists(CAMERA_CAPTURE)).toBe(false);

    // A cut-out stays PNG; the replaced object is removed only once replaced.
    await act(async () => fireEvent.press(view.getByTestId('replace-image')));
    const second = photoOf(view);
    expect(second.endsWith('.png')).toBe(true);
    expect(second).not.toBe(first);
    expect([...remote.objects.keys()]).toEqual([second]);
    expect(view.getByText('identity:product-created:fixture-business')).toBeTruthy();
    expect(view.getByText('Shampooing Photo:25:4:true')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('remove-image')));
    expect(view.getByText('photo:none')).toBeTruthy();
    expect(remote.objects.size).toBe(0);
    expect(view.getByText('identity:product-created:fixture-business')).toBeTruthy();
    expect(view.getByText('Shampooing Photo:25:4:true')).toBeTruthy();
  });

  it('refuses the whole Save when the photo cannot be uploaded: nothing is written', async () => {
    const files = createDraftFiles();
    const remote = createFakeBusinessMediaRemote(files);
    remote.failUploads = true;
    const view = await renderCatalog(files, remote);

    await act(async () => fireEvent.press(view.getByTestId('add-with-photo')));
    expect(view.getByText('error:ProductPhotoSaveError')).toBeTruthy();
    expect(view.getByText('missing')).toBeTruthy();
    expect(remote.objects.size).toBe(0);
    // No cache copy, no temporary leftovers.
    expect(files.listFiles()).toEqual([VISION_CUTOUT]);
  });

  it('keeps the previous shared photo when a replacement fails to upload or to prepare', async () => {
    const files = createDraftFiles();
    const remote = createFakeBusinessMediaRemote(files);
    const view = await renderCatalog(files, remote);
    await act(async () => fireEvent.press(view.getByTestId('add-with-photo')));
    const first = photoOf(view);

    remote.failUploads = true;
    await act(async () => fireEvent.press(view.getByTestId('replace-image')));
    expect(view.getByText('error:ProductPhotoSaveError')).toBeTruthy();
    expect(photoOf(view)).toBe(first);
    expect([...remote.objects.keys()]).toEqual([first]);
    // The other edits of that Save were not written either.
    expect(view.getByText('Shampooing Test:25:4:true')).toBeTruthy();

    remote.failUploads = false;
    mockProcessingFails = true;
    files.addFile(VISION_CUTOUT, 'photo B');
    await act(async () => fireEvent.press(view.getByTestId('replace-image')));
    mockProcessingFails = false;
    expect(photoOf(view)).toBe(first);
    expect([...remote.objects.keys()]).toEqual([first]);
  });

  it('never saves a local-only photo when cloud storage is unavailable', async () => {
    const view = await renderCatalog(createDraftFiles(), undefined);

    await act(async () => fireEvent.press(view.getByTestId('add-with-photo')));
    expect(view.getByText('error:ProductPhotoSaveError')).toBeTruthy();
    expect(view.getByText('missing')).toBeTruthy();
  });

  it('removes the shared object when the Product is deleted', async () => {
    const files = createDraftFiles();
    const remote = createFakeBusinessMediaRemote(files);
    const view = await renderCatalog(files, remote);
    await act(async () => fireEvent.press(view.getByTestId('add-with-photo')));
    expect(remote.objects.size).toBe(1);

    await act(async () => fireEvent.press(view.getByTestId('delete-added')));
    expect(view.getByText('missing')).toBeTruthy();
    expect(remote.objects.size).toBe(0);
  });

  describe('legacy device-local images', () => {
    const LEGACY_IMAGE = 'file:///app/Documents/products/product-created-1700000000000-1.jpg';

    /** A device from a previous build: the Product carries a local image only this device has. */
    function legacyDevice() {
      const files = createDraftFiles();
      files.addFile(LEGACY_IMAGE, 'legacy photo');
      const database = openTestDatabase();
      bootstrapPersistence(database, () => createDevelopmentSeed(new Date()));
      database.runSync(
        'INSERT INTO products (id, business_id, name, brand, category, barcode, image_uri, price_cents, stock_quantity, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['product-created', 'fixture-business', 'Shampooing Test', 'Brand Test', 'Soin', '0123456789', LEGACY_IMAGE, 2500, 4, 1],
      );
      return { files, database, remote: createFakeBusinessMediaRemote(files) };
    }

    it('are kept, and never uploaded, by edits without a photo change', async () => {
      const { files, database, remote } = legacyDevice();
      const view = await renderCatalog(files, remote, database);
      expect(view.getByText(`image:${LEGACY_IMAGE}`)).toBeTruthy();

      await act(async () => fireEvent.press(view.getByTestId('update')));
      expect(view.getByText('Shampooing Premium:29:7:true')).toBeTruthy();
      expect(view.getByText(`image:${LEGACY_IMAGE}`)).toBeTruthy();
      expect(view.getByText('photo:none')).toBeTruthy();
      expect(remote.objects.size).toBe(0);
      expect(mockPrepareProductPhoto).not.toHaveBeenCalled();
    });

    it('become obsolete once an explicit photo is shared: the file is cleaned up best effort', async () => {
      const { files, database, remote } = legacyDevice();
      const view = await renderCatalog(files, remote, database);

      await act(async () => fireEvent.press(view.getByTestId('replace-image')));
      expect(photoOf(view)).toMatch(/\.png$/);
      expect(view.getByText('image:none')).toBeTruthy();
      expect(files.exists(LEGACY_IMAGE)).toBe(false);
      // Only the explicitly chosen photo was uploaded — never the legacy one.
      expect([...remote.objects.values()]).toEqual([`normalized ${VISION_CUTOUT}`]);
    });

    it('a failing legacy cleanup never affects the saved Product', async () => {
      const { files, database, remote } = legacyDevice();
      const deleteFile = files.delete;
      files.delete = (uri) => {
        if (uri === LEGACY_IMAGE) throw new Error('file system unavailable');
        deleteFile(uri);
      };
      const view = await renderCatalog(files, remote, database);

      await act(async () => fireEvent.press(view.getByTestId('replace-image')));
      expect(view.getByText('error:none')).toBeTruthy();
      expect(photoOf(view)).toMatch(/\.png$/);
      expect(database.getFirstSync<{ photo_path: string | null }>('SELECT photo_path FROM products WHERE id = ?', ['product-created'])?.photo_path).toBe(photoOf(view));
    });

    it('are removed together with the photo', async () => {
      const { files, database, remote } = legacyDevice();
      const view = await renderCatalog(files, remote, database);

      await act(async () => fireEvent.press(view.getByTestId('remove-image')));
      expect(view.getByText('image:none')).toBeTruthy();
      expect(files.exists(LEGACY_IMAGE)).toBe(false);
    });
  });

  it('keeps duplicate ids and invalid canonical values out of the catalog', async () => {
    const initialCount = createInitialProductCatalog().length;
    const view = await renderCatalog(createDraftFiles(), undefined);

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
    const view = await renderCatalog(createDraftFiles(), undefined);

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
    const view = await renderCatalog(createDraftFiles(), undefined);

    await act(async () => fireEvent.press(view.getByTestId('add')));
    await act(async () => fireEvent.press(view.getByTestId('delete-added')));
    expect(view.getByText(`count:${initial.length}`)).toBeTruthy();
    expect(view.getByText('missing')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('delete-unknown')));
    expect(view.getByText(`count:${initial.length}`)).toBeTruthy();

    expect(JSON.stringify(initial)).toBe(initialSnapshot);
  });
});
