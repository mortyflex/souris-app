// BeautIzzy — Client photo from the Client Profile: the portrait avatar opens the
// shared photo flow; a photo is normalized, uploaded, then referenced on the
// Client; replacement never loses the previous photo; removal restores the
// initials; another device resolves the same photo from its stable path.

import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Pressable } from 'react-native';

import type { CameraAccess, PhotoPickResult } from '@/shared/lib/photo-acquisition';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { createMemoryLocalFiles, type MemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { BusinessMediaProvider } from '@/providers/BusinessMediaProvider';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { usePersistence } from '@/providers/PersistenceProvider';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

import { ClientProfileScreen } from '../../profile/ClientProfileScreen';
import { ClientSessionProvider } from '../../session/ClientSessionProvider';
import { getClientPhotoCacheUri } from '../client-photo-storage';
import {
  createFakeBusinessMediaRemote as createFakeClientPhotoRemote,
  type FakeBusinessMediaRemote as FakeClientPhotoRemote,
} from '@/persistence/testing/fake-business-media-remote';

const CLIENT_ID = 'client-agenda-lea';
const CAPTURE_URI = 'file:///app/Caches/Camera/capture.jpg';
const LIBRARY_URI = 'file:///app/Caches/ImagePicker/pick.jpg';

let mockCameraAccess: CameraAccess = 'granted';
let mockPickResult: PhotoPickResult = { status: 'selected', uri: LIBRARY_URI };
const mockEnsureCameraAccess = jest.fn(() => Promise.resolve(mockCameraAccess));
const mockPickPhotoFromLibrary = jest.fn(() => Promise.resolve(mockPickResult));
let mockFiles: MemoryLocalFiles;
let mockPreparedCount = 0;
let mockProcessingFails = false;
const mockPrepareClientPhoto = jest.fn(async (uri: string) => {
  if (mockProcessingFails) throw new Error('cannot decode');
  mockPreparedCount += 1;
  const prepared = `file:///app/Caches/ImageManipulator/prepared-${mockPreparedCount}.jpg`;
  mockFiles.addFile(prepared, `portrait from ${uri}`);
  return prepared;
});
const successHaptic = jest.spyOn(haptics, 'success').mockImplementation();

jest.mock('@/shared/lib/photo-acquisition', () => ({
  ensureCameraAccess: () => mockEnsureCameraAccess(),
  pickPhotoFromLibrary: () => mockPickPhotoFromLibrary(),
  openAppSettings: jest.fn(),
}));

jest.mock('../client-photo-processing', () => ({
  prepareClientPhoto: (uri: string) => mockPrepareClientPhoto(uri),
}));

// The camera is covered by PhotoCameraModal tests; here it only emits a capture.
jest.mock('@/shared/ui/PhotoCameraModal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    PhotoCameraModal: ({
      visible,
      onCaptured,
    }: {
      readonly visible: boolean;
      readonly onCaptured: (uri: string) => void;
    }) =>
      visible
        ? React.createElement(Pressable, {
            onPress: () => onCaptured('file:///app/Caches/Camera/capture.jpg'),
            testID: 'mock-camera-capture',
          })
        : null,
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

  interface MockModalProps {
    readonly visible?: boolean;
    readonly onDismiss?: () => void;
    readonly children?: React.ReactNode;
  }

  class MockModal extends React.Component<MockModalProps> {
    componentDidUpdate(previous: MockModalProps) {
      if (previous.visible && !this.props.visible) this.props.onDismiss?.();
    }

    render() {
      return this.props.visible ? React.createElement(View, null, this.props.children) : null;
    }
  }

  return { __esModule: true, default: MockModal };
});

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SymbolView: ({ name }: { readonly name: string | { readonly ios?: string } }) =>
      React.createElement(View, { testID: `symbol-${typeof name === 'string' ? name : name.ios}` }),
  };
});

jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { DateTimePicker: () => React.createElement(View, null) };
});

jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});

jest.mock('@/shared/ui/BarcodeScannerModal', () => ({ BarcodeScannerModal: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

type View = Awaited<ReturnType<typeof render>>;

function seededDatabase(): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, () => createDevelopmentSeed(new Date()));
  return db;
}

function storedPhotoPath(db: SourisDatabase): string | null {
  return (
    db.getFirstSync<{ photo_path: string | null }>('SELECT photo_path FROM clients WHERE id = ?', [
      CLIENT_ID,
    ])?.photo_path ?? null
  );
}

const REMOTE_PHOTO = `${testBusiness.id}/clients/${CLIENT_ID}/from-other-device.jpg`;

/**
 * What the cloud sync runner does after a pull that applied another device's
 * Client photo: the row is already in SQLite, then `reloadSnapshot()` IN
 * PLACE (the runner → reloadSnapshot link: CloudSyncRunner.test.tsx).
 */
function RemoteClientPhotoProbe() {
  const { database, reloadSnapshot } = usePersistence();
  return (
    <Pressable
      testID="apply-remote-photo"
      onPress={() => {
        database.runSync('UPDATE clients SET photo_path = ? WHERE id = ?', [REMOTE_PHOTO, CLIENT_ID]);
        reloadSnapshot();
      }}
    />
  );
}

function renderProfile(db: SourisDatabase, files: MemoryLocalFiles, remote: FakeClientPhotoRemote | undefined) {
  return render(
    <TestPersistenceProvider database={db} files={files}>
      <BusinessMediaProvider remote={remote}>
        <ClientSessionProvider>
          <ProductCatalogProvider>
            <SaleSessionProvider>
              <AppointmentSessionProvider>
                <ClientProfileScreen clientId={CLIENT_ID} />
                <RemoteClientPhotoProbe />
              </AppointmentSessionProvider>
            </SaleSessionProvider>
          </ProductCatalogProvider>
        </ClientSessionProvider>
      </BusinessMediaProvider>
    </TestPersistenceProvider>,
  );
}

async function openPhotoMenu(view: View) {
  await act(async () => fireEvent.press(view.getByTestId('client-photo-button')));
  expect(view.getByTestId('client-photo-sheet')).toBeTruthy();
}

async function takePhoto(view: View) {
  await openPhotoMenu(view);
  await act(async () => fireEvent.press(view.getByTestId('client-photo-source-camera')));
  await settleSheetTransition();
  await act(async () => fireEvent.press(view.getByTestId('mock-camera-capture')));
}

async function chooseFromPhotos(view: View) {
  await openPhotoMenu(view);
  await act(async () => fireEvent.press(view.getByLabelText('Choisir dans Photos')));
  await settleSheetTransition();
}

function displayedPhotoUri(view: View): string | undefined {
  return view.queryByTestId('client-avatar-photo')?.props.source?.uri;
}

describe('Client photo from the Client Profile', () => {
  let db: SourisDatabase;
  let remote: FakeClientPhotoRemote;

  beforeEach(() => {
    mockFiles = createMemoryLocalFiles();
    remote = createFakeClientPhotoRemote(mockFiles);
    db = seededDatabase();
    mockCameraAccess = 'granted';
    mockPickResult = { status: 'selected', uri: LIBRARY_URI };
    mockProcessingFails = false;
    mockPreparedCount = 0;
    mockEnsureCameraAccess.mockClear();
    mockPickPhotoFromLibrary.mockClear();
    mockPrepareClientPhoto.mockClear();
    successHaptic.mockClear();
  });

  it('shows the initials in the same 80 pt portrait, with a subtle camera badge and no permission request', async () => {
    const view = await renderProfile(db, mockFiles, remote);

    const button = view.getByTestId('client-photo-button');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Ajouter une photo pour Léa Martin');
    expect(view.getByTestId('client-avatar')).toHaveStyle({ borderRadius: 20, height: 80, width: 80 });
    expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('LM');
    expect(view.queryByTestId('client-avatar-photo')).toBeNull();
    // The initials are not a second, separate accessibility element.
    expect(view.getByTestId('client-avatar').props.accessible).toBe(false);
    const badge = view.getByTestId('client-photo-badge');
    expect(within(badge).getByTestId('symbol-camera.fill')).toBeTruthy();
    expect(badge).toHaveStyle({ height: 32, width: 32 });
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();
  });

  it('opens the photo actions from the avatar, still asking for no permission', async () => {
    const view = await renderProfile(db, mockFiles, remote);
    await openPhotoMenu(view);

    const sheet = within(view.getByTestId('client-photo-sheet'));
    expect(sheet.getByLabelText('Prendre une photo')).toBeTruthy();
    expect(sheet.getByLabelText('Choisir dans Photos')).toBeTruthy();
    expect(sheet.getByText('Annuler')).toBeTruthy();
    expect(sheet.queryByLabelText('Supprimer la photo')).toBeNull();
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();
    expect(mockPickPhotoFromLibrary).not.toHaveBeenCalled();
  });

  it('a camera capture is normalized, uploaded, referenced on the Client and shown at once', async () => {
    const view = await renderProfile(db, mockFiles, remote);

    await takePhoto(view);
    await waitFor(() => expect(storedPhotoPath(db)).not.toBeNull());

    const path = storedPhotoPath(db)!;
    expect(path).toMatch(new RegExp(`^${testBusiness.id}/clients/${CLIENT_ID}/[0-9a-f-]{36}\\.jpg$`));
    expect(mockEnsureCameraAccess).toHaveBeenCalledTimes(1);
    expect(mockPrepareClientPhoto).toHaveBeenCalledWith(CAPTURE_URI);
    expect(remote.objects.get(path)).toBe(`portrait from ${CAPTURE_URI}`);
    await waitFor(() => expect(displayedPhotoUri(view)).toBe(getClientPhotoCacheUri(mockFiles, path)));
    expect(view.getByTestId('client-photo-button').props.accessibilityLabel).toBe('Photo de Léa Martin');
    // Never a temporary file as the reference, never leftovers.
    expect(mockFiles.listFiles()).toEqual([getClientPhotoCacheUri(mockFiles, path)]);
    expect(successHaptic).toHaveBeenCalledTimes(1);
    // Marked for sync with the CLIENT aggregate like any Client change.
    expect(
      db.getAllSync("SELECT aggregate_id FROM sync_outbox WHERE aggregate_type = 'CLIENT' AND aggregate_id = ?", [CLIENT_ID]),
    ).toHaveLength(db.getFirstSync('SELECT id FROM business_profile') ? 1 : 0);
  });

  it('a photo chosen in Photos goes through the same path', async () => {
    const view = await renderProfile(db, mockFiles, remote);

    await chooseFromPhotos(view);
    await waitFor(() => expect(storedPhotoPath(db)).not.toBeNull());

    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();
    expect(mockPrepareClientPhoto).toHaveBeenCalledWith(LIBRARY_URI);
    await waitFor(() =>
      expect(displayedPhotoUri(view)).toBe(getClientPhotoCacheUri(mockFiles, storedPhotoPath(db)!)),
    );
  });

  it('cancelling the picker, or refusing the camera, changes nothing', async () => {
    mockPickResult = { status: 'cancelled' };
    mockCameraAccess = 'denied';
    const view = await renderProfile(db, mockFiles, remote);

    await chooseFromPhotos(view);
    await openPhotoMenu(view);
    await act(async () => fireEvent.press(view.getByTestId('client-photo-source-camera')));
    await settleSheetTransition();

    expect(view.queryByTestId('mock-camera-capture')).toBeNull();
    expect(mockPrepareClientPhoto).not.toHaveBeenCalled();
    expect(storedPhotoPath(db)).toBeNull();
    expect(remote.objects.size).toBe(0);
    expect(view.getByTestId('client-avatar-initials')).toBeTruthy();
    expect(view.queryByText('Impossible d’enregistrer la photo.')).toBeNull();
  });

  it('a failed replacement keeps the previous photo, with one concise message', async () => {
    const view = await renderProfile(db, mockFiles, remote);
    await takePhoto(view);
    await waitFor(() => expect(storedPhotoPath(db)).not.toBeNull());
    const previous = storedPhotoPath(db)!;
    const previousUri = getClientPhotoCacheUri(mockFiles, previous);
    await waitFor(() => expect(displayedPhotoUri(view)).toBe(previousUri));

    remote.failUploads = true;
    await openPhotoMenu(view);
    expect(view.getByLabelText('Prendre une nouvelle photo')).toBeTruthy();
    await act(async () => fireEvent.press(view.getByLabelText('Choisir dans Photos')));
    await settleSheetTransition();

    await waitFor(() => expect(view.getByText('Impossible d’enregistrer la photo.')).toBeTruthy());
    expect(storedPhotoPath(db)).toBe(previous);
    expect([...remote.objects.keys()]).toEqual([previous]);
    expect(displayedPhotoUri(view)).toBe(previousUri);
    // No raw storage error reaches the professional.
    expect(view.queryByText(/upload failed/)).toBeNull();

    await act(async () => fireEvent.press(view.getByText('Compris')));
    expect(view.queryByText('Impossible d’enregistrer la photo.')).toBeNull();
  });

  it('a successful replacement references the new photo and removes the old object', async () => {
    const view = await renderProfile(db, mockFiles, remote);
    await takePhoto(view);
    await waitFor(() => expect(storedPhotoPath(db)).not.toBeNull());
    const previous = storedPhotoPath(db)!;

    await chooseFromPhotos(view);
    await waitFor(() => expect(storedPhotoPath(db)).not.toBe(previous));
    const next = storedPhotoPath(db)!;

    await waitFor(() => expect([...remote.objects.keys()]).toEqual([next]));
    expect(displayedPhotoUri(view)).toBe(getClientPhotoCacheUri(mockFiles, next));
  });

  it('removing the photo restores the initials, locally and remotely, without touching the Client', async () => {
    const view = await renderProfile(db, mockFiles, remote);
    await takePhoto(view);
    await waitFor(() => expect(storedPhotoPath(db)).not.toBeNull());
    const before = db.getFirstSync('SELECT first_name, last_name, phone, email, birthday, notes, archived_at FROM clients WHERE id = ?', [CLIENT_ID]);

    await openPhotoMenu(view);
    await act(async () => fireEvent.press(view.getByLabelText('Supprimer la photo')));
    await settleSheetTransition();

    expect(storedPhotoPath(db)).toBeNull();
    expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('LM');
    expect(view.queryByTestId('client-avatar-photo')).toBeNull();
    await waitFor(() => expect(remote.objects.size).toBe(0));
    expect(mockFiles.listFiles()).toEqual([]);
    expect(
      db.getFirstSync('SELECT first_name, last_name, phone, email, birthday, notes, archived_at FROM clients WHERE id = ?', [CLIENT_ID]),
    ).toEqual(before);
    expect(view.getByText('Léa Martin')).toBeTruthy();
  });

  it('keeps the Client unchanged when the photo cannot be processed', async () => {
    mockProcessingFails = true;
    const view = await renderProfile(db, mockFiles, remote);

    await takePhoto(view);
    await waitFor(() => expect(view.getByText('Impossible d’enregistrer la photo.')).toBeTruthy());
    expect(storedPhotoPath(db)).toBeNull();
    expect(remote.objects.size).toBe(0);
    expect(view.getByTestId('client-avatar-initials')).toBeTruthy();
  });

  it('never saves a local-only photo when cloud storage is unavailable', async () => {
    const view = await renderProfile(db, mockFiles, undefined);

    await takePhoto(view);
    await waitFor(() => expect(view.getByText('Impossible d’enregistrer la photo.')).toBeTruthy());
    expect(storedPhotoPath(db)).toBeNull();
    expect(mockFiles.listFiles()).toEqual([]);
  });

  it('another device resolves the same stored photo from its path', async () => {
    // Device A took the photo; this device only received the synced Client row.
    const deviceA = createMemoryLocalFiles();
    const path = `${testBusiness.id}/clients/${CLIENT_ID}/photo-from-a.jpg`;
    remote.objects.set(path, 'portrait taken on A');
    db.runSync('UPDATE clients SET photo_path = ? WHERE id = ?', [path, CLIENT_ID]);
    void deviceA;

    const view = await renderProfile(db, mockFiles, remote.forDevice(mockFiles) as FakeClientPhotoRemote);

    const cacheUri = getClientPhotoCacheUri(mockFiles, path);
    await waitFor(() => expect(displayedPhotoUri(view)).toBe(cacheUri));
    expect(mockFiles.readFile(cacheUri)).toBe('portrait taken on A');
    expect(view.getByTestId('client-photo-button').props.accessibilityLabel).toBe('Photo de Léa Martin');
  });

  it('falls back to the initials when a stored photo cannot be fetched', async () => {
    const path = `${testBusiness.id}/clients/${CLIENT_ID}/missing.jpg`;
    db.runSync('UPDATE clients SET photo_path = ? WHERE id = ?', [path, CLIENT_ID]);

    const view = await renderProfile(db, mockFiles, remote);
    await act(async () => {
      await Promise.resolve();
    });

    expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('LM');
    expect(view.queryByTestId('client-avatar-photo')).toBeNull();
    // The Client still HAS a photo: the menu offers to replace or remove it.
    expect(view.getByTestId('client-photo-button').props.accessibilityLabel).toBe('Photo de Léa Martin');
  });

  it('a photo set on another device reaches the mounted profile in place — an open sheet stays open', async () => {
    remote.objects.set(REMOTE_PHOTO, 'photo from the other device');
    const view = await renderProfile(db, mockFiles, remote);
    expect(view.getByTestId('client-avatar-initials')).toBeTruthy();
    await act(async () => fireEvent.press(view.getByTestId('open-client-actions')));
    await settleSheetTransition();
    expect(view.getByTestId('client-actions-sheet')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('apply-remote-photo')));

    await waitFor(() => expect(displayedPhotoUri(view)).toBe(getClientPhotoCacheUri(mockFiles, REMOTE_PHOTO)));
    expect(mockFiles.readFile(getClientPhotoCacheUri(mockFiles, REMOTE_PHOTO))).toBe('photo from the other device');
    expect(view.getByTestId('client-actions-sheet')).toBeTruthy();
  });

  it('an archived Client keeps her photo and her archived state', async () => {
    const path = `${testBusiness.id}/clients/${CLIENT_ID}/archived.jpg`;
    remote.objects.set(path, 'portrait');
    db.runSync('UPDATE clients SET photo_path = ?, archived_at = ? WHERE id = ?', [
      path,
      '2026-09-01T10:00:00.000Z',
      CLIENT_ID,
    ]);

    const view = await renderProfile(db, mockFiles, remote);

    await waitFor(() => expect(displayedPhotoUri(view)).toBe(getClientPhotoCacheUri(mockFiles, path)));
    expect(view.getByTestId('client-archived-indicator')).toBeTruthy();
    expect(view.getByLabelText('Réactiver le client')).toBeTruthy();
  });
});
