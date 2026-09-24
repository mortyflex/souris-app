// Souris — a Product photo changed on ANOTHER device, while this one stays open
//
// The chain under test, end to end on device B:
//
//   device A: new photoPath written + pushed
//   device B: sync run → pull applies the PRODUCT row (photo_path in SQLite)
//            → the runner's rule: didSyncRunChangeLocalData → reloadSnapshot()
//            → ProductCatalogProvider re-hydrates → useProductImageUri(photoPath)
//            → the mounted catalogue / Sale rows render the new photo
//
// Stock takes exactly the same path (same PRODUCT row, same pull, same reload).

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import type { Product } from '@/domain/products';
import { SaleProductRow } from '@/features/sales/creation/components/SaleProductRow';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { getMediaCacheUri } from '@/persistence/media/business-media';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import { findProduct, updateProduct } from '@/persistence/stores/products';
import { approveInitialRestore, approveInitialUpload } from '@/persistence/sync/bootstrap';
import {
  createSyncPushWorker,
  didSyncRunChangeLocalData,
  isSyncRunDue,
} from '@/persistence/sync/push-worker';
import { createFakeBusinessMediaRemote } from '@/persistence/testing/fake-business-media-remote';
import { createFakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import {
  createTestSeed,
  productMask,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
} from '@/persistence/testing/fixtures';
import { createMemoryLocalFiles, type MemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { BusinessMediaProvider } from '@/providers/BusinessMediaProvider';
import { usePersistence } from '@/providers/PersistenceProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { ProductCatalogScreen } from '../../catalog/ProductCatalogScreen';
import { ProductCatalogProvider, useProductCatalog } from '../../session/ProductCatalogProvider';
import { PRODUCT_PHOTO_CACHE_DIRECTORY } from '../product-photo-storage';
import { useProductImageUri } from '../use-product-image-uri';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});
jest.mock('@/shared/ui/BarcodeScannerModal', () => ({ BarcodeScannerModal: () => null }));

const NOW = new Date('2026-09-26T09:00:00.000Z');
const PATH_A = `${REMOTE_BUSINESS_ID}/products/${productMask.id}/photo-a.jpg`;
const PATH_C = `${REMOTE_BUSINESS_ID}/products/${productMask.id}/photo-c.jpg`;
const LEGACY_B = 'file:///app/Documents/products/product-mask-1600000000000-1.jpg';

const cacheUri = (files: MemoryLocalFiles, path: string) =>
  getMediaCacheUri(files, PRODUCT_PHOTO_CACHE_DIRECTORY, path);

// ---------------------------------------------------------------------------
// Scenarios A + B — the resolver of an ALREADY MOUNTED consumer
// ---------------------------------------------------------------------------

/** One mounted consumer whose Product value changes in place (no remount). */
function MountedConsumer({ initial, next }: { readonly initial: Product; readonly next: Product }) {
  const [product, setProduct] = useState(initial);
  const shown = useProductImageUri(product);
  return (
    <>
      <Text testID="shown">{shown ?? 'placeholder'}</Text>
      <Pressable testID="sync" onPress={() => setProduct(next)} />
    </>
  );
}

function renderConsumer(files: MemoryLocalFiles, initial: Product, next: Product) {
  const remote = createFakeBusinessMediaRemote(files);
  remote.objects.set(PATH_A, 'photo A');
  remote.objects.set(PATH_C, 'photo C');
  return {
    remote,
    view: render(
      <TestPersistenceProvider files={files}>
        <BusinessMediaProvider remote={remote}>
          <MountedConsumer initial={initial} next={next} />
        </BusinessMediaProvider>
      </TestPersistenceProvider>,
    ),
  };
}

describe('useProductImageUri — keyed by photoPath, never by Product id', () => {
  it('Scenario A: same Product id, photoPath A → C: A is never returned again, C is resolved and shown', async () => {
    const files = createMemoryLocalFiles();
    const withA: Product = { ...productMask, imageUri: undefined, photoPath: PATH_A };
    const { view: rendering, remote } = renderConsumer(files, withA, { ...withA, photoPath: PATH_C });
    const view = await rendering;
    await waitFor(() => expect(view.getByTestId('shown')).toHaveTextContent(cacheUri(files, PATH_A)));

    await act(async () => fireEvent.press(view.getByTestId('sync')));
    // At once: A has lost its authority (C is downloading).
    expect(view.getByTestId('shown')).not.toHaveTextContent(cacheUri(files, PATH_A));
    await waitFor(() => expect(view.getByTestId('shown')).toHaveTextContent(cacheUri(files, PATH_C)));
    expect(files.readFile(cacheUri(files, PATH_C))).toBe('photo C');
    expect(remote.downloadCount).toBe(2);
  });

  it('Scenario B: legacy local image B → shared photo C arrives: B loses precedence at once, C is shown', async () => {
    const files = createMemoryLocalFiles();
    files.addFile(LEGACY_B, 'photo B');
    const legacy: Product = { ...productMask, imageUri: LEGACY_B };
    const { view: rendering } = renderConsumer(files, legacy, { ...legacy, photoPath: PATH_C });
    const view = await rendering;
    expect(view.getByTestId('shown')).toHaveTextContent(LEGACY_B);

    await act(async () => fireEvent.press(view.getByTestId('sync')));
    expect(view.getByTestId('shown')).not.toHaveTextContent(LEGACY_B);
    await waitFor(() => expect(view.getByTestId('shown')).toHaveTextContent(cacheUri(files, PATH_C)));
  });
});

// ---------------------------------------------------------------------------
// Scenarios C + D — the real sync path into mounted screens
// ---------------------------------------------------------------------------

/** Device A owns the data; device B was restored from it. Both bound to the same Business. */
async function openTwoDevices() {
  const sync = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
  const a = openTestDatabase();
  bootstrapPersistence(a, createTestSeed);
  bindLocalDatabaseToBusiness(a, remoteBusinessProfile);
  approveInitialUpload(a, REMOTE_BUSINESS_ID, NOW);
  await createSyncPushWorker({ database: a, gateway: sync, now: () => NOW }).run(REMOTE_BUSINESS_ID);

  const b = openTestDatabase();
  bootstrapPersistence(b, () => createTestSeed({ clients: [], services: [], products: [], appointments: [] }));
  bindLocalDatabaseToBusiness(b, remoteBusinessProfile);
  const runB = () => createSyncPushWorker({ database: b, gateway: sync, now: () => NOW }).run(REMOTE_BUSINESS_ID);
  await runB();
  approveInitialRestore(b, REMOTE_BUSINESS_ID, NOW);
  expect(await runB()).toMatchObject({ status: 'RESTORED' });
  return { sync, a, b, runA: () => createSyncPushWorker({ database: a, gateway: sync, now: () => NOW }).run(REMOTE_BUSINESS_ID), runB };
}

/** What CloudSyncRunner does after every run — the ONLY cross-device refresh of in-memory state. */
function SyncRunnerRule({ runB }: { readonly runB: () => ReturnType<ReturnType<typeof createSyncPushWorker>['run']> }) {
  const { reloadSnapshot } = usePersistence();
  return (
    <Pressable
      testID="run-sync-on-b"
      onPress={async () => {
        const result = await runB();
        if (didSyncRunChangeLocalData(result)) reloadSnapshot();
      }}
    />
  );
}

function SaleRowOfMask() {
  const { getProductById } = useProductCatalog();
  const mask = getProductById(productMask.id);
  return mask ? <SaleProductRow draftQuantity={0} onPress={() => {}} product={mask} /> : null;
}

function renderDeviceB(b: SourisDatabase, files: MemoryLocalFiles, runB: () => ReturnType<ReturnType<typeof createSyncPushWorker>['run']>) {
  const media = createFakeBusinessMediaRemote(files);
  return {
    media,
    view: render(
      <TestPersistenceProvider business={remoteBusinessProfile} database={b} files={files}>
        <BusinessMediaProvider remote={media}>
          <ProductCatalogProvider>
            <ProductCatalogScreen />
            <SaleRowOfMask />
          </ProductCatalogProvider>
          <SyncRunnerRule runB={runB} />
        </BusinessMediaProvider>
      </TestPersistenceProvider>,
    ),
  };
}

async function givePhotoOnA(a: SourisDatabase, runA: () => Promise<unknown>, photoPath: string, stock?: number) {
  const current = findProduct(a, productMask.id)!;
  const { imageUri: _legacy, ...rest } = current;
  updateProduct(a, { ...rest, photoPath, ...(stock !== undefined ? { stockQuantity: stock } : {}) });
  await runA();
}

describe('a photo changed on another device reaches the mounted screens of this one', () => {
  it('Scenario C + D: the synced photoPath reaches the mounted catalogue AND Sale row — with the stock, through the same pull', async () => {
    const { a, b, runA, runB } = await openTwoDevices();
    const files = createMemoryLocalFiles();
    const { view: rendering, media } = renderDeviceB(b, files, runB);
    media.objects.set(PATH_C, 'photo C');
    media.objects.set(PATH_A, 'photo A');
    await givePhotoOnA(a, runA, PATH_A);
    const view = await rendering;
    await act(async () => fireEvent.press(view.getByTestId('run-sync-on-b')));

    const catalogue = () => view.queryByTestId(`catalog-product-image-${productMask.id}-source`)?.props.source?.uri;
    const saleRow = () => view.queryByTestId(`sale-product-image-${productMask.id}-source`)?.props.source?.uri;
    await waitFor(() => expect(catalogue()).toBe(cacheUri(files, PATH_A)));
    expect(saleRow()).toBe(cacheUri(files, PATH_A));

    // Device A replaces A with C and changes the stock; device B stays open.
    await givePhotoOnA(a, runA, PATH_C, 3);
    expect(b.getFirstSync('SELECT photo_path FROM products WHERE id = ?', [productMask.id])).toEqual({ photo_path: PATH_A });

    await act(async () => fireEvent.press(view.getByTestId('run-sync-on-b')));
    expect(b.getFirstSync('SELECT photo_path, stock_quantity FROM products WHERE id = ?', [productMask.id])).toEqual({
      photo_path: PATH_C,
      stock_quantity: 3,
    });
    await waitFor(() => expect(catalogue()).toBe(cacheUri(files, PATH_C)));
    expect(saleRow()).toBe(cacheUri(files, PATH_C));
    expect(view.getAllByText('Stock 3').length).toBeGreaterThanOrEqual(1);
  });

  it('a device with a legacy local image B switches to the shared photo C in place', async () => {
    const { a, b, runA, runB } = await openTwoDevices();
    const files = createMemoryLocalFiles();
    files.addFile(LEGACY_B, 'photo B');
    b.runSync('UPDATE products SET image_uri = ? WHERE id = ?', [LEGACY_B, productMask.id]);
    const { view: rendering, media } = renderDeviceB(b, files, runB);
    media.objects.set(PATH_C, 'photo C');
    const view = await rendering;
    const catalogue = () => view.queryByTestId(`catalog-product-image-${productMask.id}-source`)?.props.source?.uri;
    expect(catalogue()).toBe(LEGACY_B);

    await givePhotoOnA(a, runA, PATH_C);
    await act(async () => fireEvent.press(view.getByTestId('run-sync-on-b')));
    await waitFor(() => expect(catalogue()).toBe(cacheUri(files, PATH_C)));
  });

  // The actual trigger. The foreground tick only runs when THIS device has
  // work of its own (CLOUD_SYNC.md §17.2): an idle device makes no request, so
  // a change made elsewhere — photo AND stock alike — waits for the next run:
  // launch, return to the foreground, or a local change of this device.
  it('documents the trigger: an idle device is not due for a run; a local change of its own makes it due', async () => {
    const { a, b, runA } = await openTwoDevices();
    await givePhotoOnA(a, runA, PATH_C, 2);

    expect(isSyncRunDue(b, REMOTE_BUSINESS_ID, NOW)).toBe(false);
    const serum = findProduct(b, 'product-serum')!;
    updateProduct(b, { ...serum, stockQuantity: serum.stockQuantity + 1 });
    expect(isSyncRunDue(b, REMOTE_BUSINESS_ID, NOW)).toBe(true);
  });
});

