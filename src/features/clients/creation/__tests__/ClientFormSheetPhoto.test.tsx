// BeautIzzy — Client photo from « Ajouter un client »: the portrait frame of the
// Profile opens the shared photo flow; the draft is previewed, replaced or
// removed before the Client is added; the Client row is written FIRST, then
// the photo is uploaded and referenced; a photo that cannot be stored never
// loses the Client; no temporary file and no object is ever left behind.

import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';

import type { Client } from '@/domain/clients';
import type { CameraAccess, PhotoPickResult } from '@/shared/lib/photo-acquisition';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import type { BusinessMediaRemote } from '@/persistence/media/business-media';
import {
  createFakeBusinessMediaRemote,
  type FakeBusinessMediaRemote,
} from '@/persistence/testing/fake-business-media-remote';
import { createMemoryLocalFiles, type MemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { BusinessMediaProvider } from '@/providers/BusinessMediaProvider';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

import { getClientPhotoCacheUri } from '../../photo/client-photo-storage';
import { ClientSessionProvider } from '../../session/ClientSessionProvider';
import { ClientFormSheet } from '../ClientFormSheet';

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

jest.mock('@/features/clients/photo/client-photo-processing', () => ({
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

jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

type View = Awaited<ReturnType<typeof render>>;

interface StoredClient {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string | null;
  readonly photo_path: string | null;
}

function seededDatabase(): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, () => createDevelopmentSeed(new Date()));
  return db;
}

function storedClients(db: SourisDatabase, firstName: string): StoredClient[] {
  return db.getAllSync<StoredClient>(
    'SELECT id, first_name, last_name, photo_path FROM clients WHERE first_name = ?',
    [firstName],
  );
}

function renderCreateSheet(
  db: SourisDatabase,
  remote: BusinessMediaRemote | undefined,
  handlers: { readonly onClose?: () => void; readonly onSubmitted?: (client: Client) => void } = {},
) {
  return render(
    <TestPersistenceProvider database={db} files={mockFiles}>
      <BusinessMediaProvider remote={remote}>
        <ClientSessionProvider>
          <ClientFormSheet
            mode="create"
            onClose={handlers.onClose ?? (() => {})}
            onSubmitted={handlers.onSubmitted ?? (() => {})}
            visible
          />
        </ClientSessionProvider>
      </BusinessMediaProvider>
    </TestPersistenceProvider>,
  );
}

async function press(view: View, testID: string) {
  await act(async () => fireEvent.press(view.getByTestId(testID)));
}

async function typeName(view: View, firstName: string, lastName = '') {
  await act(async () => fireEvent.changeText(view.getByLabelText('Prénom'), firstName));
  await act(async () => fireEvent.changeText(view.getByLabelText('Nom'), lastName));
}

async function openPhotoMenu(view: View) {
  await press(view, 'client-form-photo-button');
  expect(view.getByTestId('client-form-photo-sheet')).toBeTruthy();
}

async function takePhoto(view: View) {
  await openPhotoMenu(view);
  await press(view, 'client-form-photo-source-camera');
  await settleSheetTransition();
  await press(view, 'mock-camera-capture');
}

async function chooseFromPhotos(view: View) {
  await openPhotoMenu(view);
  await act(async () => fireEvent.press(view.getByLabelText('Choisir dans la photothèque')));
  await settleSheetTransition();
}

function displayedPhotoUri(view: View): string | undefined {
  return view.queryByTestId('client-avatar-photo')?.props.source?.uri;
}

describe('Client photo from « Ajouter un client »', () => {
  let db: SourisDatabase;
  let remote: FakeBusinessMediaRemote;

  beforeEach(() => {
    mockFiles = createMemoryLocalFiles();
    remote = createFakeBusinessMediaRemote(mockFiles);
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

  it('opens on the Profile portrait frame at 112 pt: initials follow the typed name, no permission is asked', async () => {
    const view = await renderCreateSheet(db, remote);

    const button = view.getByTestId('client-form-photo-button');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Ajouter une photo du client');
    expect(button.props.accessibilityHint).toBe('Optionnel');
    expect(view.getByTestId('client-avatar')).toHaveStyle({ borderRadius: 28, height: 112, width: 112 });
    expect(view.getByTestId('client-avatar').props.accessible).toBe(false);
    expect(view.queryByTestId('client-avatar-photo')).toBeNull();
    const badge = view.getByTestId('client-form-photo-badge');
    expect(within(badge).getByTestId('symbol-camera.fill')).toBeTruthy();
    // The badge grows at half the frame's rate: 38 pt, 7 pt outside the corner.
    expect(badge).toHaveStyle({ bottom: -7, height: 38, right: -7, width: 38 });

    await typeName(view, 'Nour', 'Benali');
    expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('NB');
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();
    expect(mockPickPhotoFromLibrary).not.toHaveBeenCalled();
  });

  it('the edit form shows no photo field: the Profile owns the photo', async () => {
    const view = await render(
      <TestPersistenceProvider database={db} files={mockFiles}>
        <BusinessMediaProvider remote={remote}>
          <ClientSessionProvider>
            <ClientFormSheet
              client={{ id: 'client-agenda-lea', firstName: 'Léa', lastName: 'Martin' }}
              mode="edit"
              onClose={() => {}}
              onSubmitted={() => {}}
              visible
            />
          </ClientSessionProvider>
        </BusinessMediaProvider>
      </TestPersistenceProvider>,
    );

    expect(view.queryByTestId('client-form-photo-button')).toBeNull();
    expect(view.queryByTestId('client-avatar')).toBeNull();
  });

  it('creates a Client without a photo exactly as before: one row, nothing uploaded, no file', async () => {
    const submitted = jest.fn();
    const view = await renderCreateSheet(db, remote, { onSubmitted: submitted });

    await typeName(view, 'Nour');
    await press(view, 'submit-client');

    expect(submitted).toHaveBeenCalledTimes(1);
    expect(submitted.mock.calls[0][0]).toEqual(expect.objectContaining({ firstName: 'Nour' }));
    expect('photoPath' in submitted.mock.calls[0][0]).toBe(false);
    expect(storedClients(db, 'Nour')).toEqual([expect.objectContaining({ photo_path: null })]);
    expect(remote.objects.size).toBe(0);
    expect(mockFiles.listFiles()).toEqual([]);
    expect(mockPrepareClientPhoto).not.toHaveBeenCalled();
    expect(successHaptic).toHaveBeenCalledTimes(1);
  });

  it('a camera capture is normalized and previewed at once, then the Client is added and its photo stored', async () => {
    const submitted = jest.fn();
    const view = await renderCreateSheet(db, remote, { onSubmitted: submitted });
    await typeName(view, 'Nour', 'Benali');

    await takePhoto(view);

    // Previewed, not stored: nothing exists before « Ajouter le client ».
    const draftUri = 'file:///app/Caches/ImageManipulator/prepared-1.jpg';
    await waitFor(() => expect(displayedPhotoUri(view)).toBe(draftUri));
    expect(mockEnsureCameraAccess).toHaveBeenCalledTimes(1);
    expect(mockPrepareClientPhoto).toHaveBeenCalledWith(CAPTURE_URI);
    expect(view.getByTestId('client-form-photo-button').props.accessibilityLabel).toBe('Photo du client');
    expect(storedClients(db, 'Nour')).toEqual([]);
    expect(remote.objects.size).toBe(0);
    expect(mockFiles.listFiles()).toEqual([draftUri]);

    await press(view, 'submit-client');
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));

    const [stored] = storedClients(db, 'Nour');
    expect(stored.photo_path).toMatch(
      new RegExp(`^${testBusiness.id}/clients/${stored.id}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(remote.objects.get(stored.photo_path!)).toBe(`portrait from ${CAPTURE_URI}`);
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ id: stored.id, firstName: 'Nour', lastName: 'Benali', photoPath: stored.photo_path }),
    );
    // The draft file is consumed; only the cached copy of the stored photo remains.
    expect(mockFiles.listFiles()).toEqual([getClientPhotoCacheUri(mockFiles, stored.photo_path!)]);
    expect(successHaptic).toHaveBeenCalledTimes(1);
    // Marked for sync with the CLIENT aggregate like any Client change.
    expect(
      db.getAllSync("SELECT aggregate_id FROM sync_outbox WHERE aggregate_type = 'CLIENT' AND aggregate_id = ?", [stored.id]),
    ).toHaveLength(db.getFirstSync('SELECT id FROM business_profile') ? 1 : 0);
  });

  it('a photo chosen in Photos goes through the same path, and replacing it discards the first draft', async () => {
    const submitted = jest.fn();
    const view = await renderCreateSheet(db, remote, { onSubmitted: submitted });
    await typeName(view, 'Nour');

    await chooseFromPhotos(view);
    await waitFor(() => expect(displayedPhotoUri(view)).toBe('file:///app/Caches/ImageManipulator/prepared-1.jpg'));
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();
    expect(mockPrepareClientPhoto).toHaveBeenCalledWith(LIBRARY_URI);

    await openPhotoMenu(view);
    expect(view.getByLabelText('Prendre une nouvelle photo')).toBeTruthy();
    await press(view, 'client-form-photo-source-camera');
    await settleSheetTransition();
    await press(view, 'mock-camera-capture');
    await waitFor(() => expect(displayedPhotoUri(view)).toBe('file:///app/Caches/ImageManipulator/prepared-2.jpg'));
    expect(mockFiles.listFiles()).toEqual(['file:///app/Caches/ImageManipulator/prepared-2.jpg']);

    await press(view, 'submit-client');
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));

    const [stored] = storedClients(db, 'Nour');
    expect([...remote.objects.keys()]).toEqual([stored.photo_path]);
    expect(remote.objects.get(stored.photo_path!)).toBe(`portrait from ${CAPTURE_URI}`);
  });

  it('removing the draft restores the initials, deletes the file, and the Client is added without a photo', async () => {
    const submitted = jest.fn();
    const view = await renderCreateSheet(db, remote, { onSubmitted: submitted });
    await typeName(view, 'Nour');
    await takePhoto(view);
    await waitFor(() => expect(displayedPhotoUri(view)).toBeDefined());

    await openPhotoMenu(view);
    await act(async () => fireEvent.press(view.getByLabelText('Supprimer la photo')));
    await settleSheetTransition();

    expect(view.queryByTestId('client-avatar-photo')).toBeNull();
    expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('N');
    expect(view.getByTestId('client-form-photo-button').props.accessibilityLabel).toBe('Ajouter une photo du client');
    expect(mockFiles.listFiles()).toEqual([]);

    await press(view, 'submit-client');
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(storedClients(db, 'Nour')).toEqual([expect.objectContaining({ photo_path: null })]);
    expect(remote.objects.size).toBe(0);
  });

  it('cancelling the picker, or refusing the camera, changes nothing', async () => {
    mockPickResult = { status: 'cancelled' };
    mockCameraAccess = 'denied';
    const view = await renderCreateSheet(db, remote);
    await typeName(view, 'Nour');

    await chooseFromPhotos(view);
    await openPhotoMenu(view);
    await press(view, 'client-form-photo-source-camera');
    await settleSheetTransition();

    expect(view.queryByTestId('mock-camera-capture')).toBeNull();
    expect(mockPrepareClientPhoto).not.toHaveBeenCalled();
    expect(view.queryByTestId('client-avatar-photo')).toBeNull();
    expect(mockFiles.listFiles()).toEqual([]);
    expect(view.queryByText('Impossible d’ajouter la photo.')).toBeNull();
    // The form is untouched and still submittable.
    expect(view.getByTestId('submit-client').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('a photo that cannot be prepared leaves the draft as it was, with one message, and the form stays usable', async () => {
    mockProcessingFails = true;
    mockFiles.addFile(LIBRARY_URI, 'raw pick');
    const submitted = jest.fn();
    const view = await renderCreateSheet(db, remote, { onSubmitted: submitted });
    await typeName(view, 'Nour');

    await chooseFromPhotos(view);

    await waitFor(() => expect(view.getByText('Impossible d’ajouter la photo.')).toBeTruthy());
    expect(view.queryByTestId('client-avatar-photo')).toBeNull();
    // The raw picker file is a temporary artifact: discarded, never kept.
    expect(mockFiles.listFiles()).toEqual([]);
    await act(async () => fireEvent.press(view.getByText('Compris')));
    expect(view.queryByText('Impossible d’ajouter la photo.')).toBeNull();

    await press(view, 'submit-client');
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(storedClients(db, 'Nour')).toEqual([expect.objectContaining({ photo_path: null })]);
  });

  it('a picker failure is reported the same way, and never as a save failure', async () => {
    mockPickResult = { status: 'error' };
    const view = await renderCreateSheet(db, remote);
    await typeName(view, 'Nour');

    await chooseFromPhotos(view);

    await waitFor(() => expect(view.getByText('Impossible d’ajouter la photo.')).toBeTruthy());
    expect(view.queryByText('Impossible d’enregistrer la photo.')).toBeNull();
    expect(mockPrepareClientPhoto).not.toHaveBeenCalled();
  });

  it('cancelling the sheet with a draft deletes the file and adds nothing', async () => {
    const onClose = jest.fn();
    const submitted = jest.fn();
    const view = await renderCreateSheet(db, remote, { onClose, onSubmitted: submitted });
    await typeName(view, 'Nour');
    await takePhoto(view);
    await waitFor(() => expect(mockFiles.listFiles()).toHaveLength(1));

    await act(async () => fireEvent.press(view.getByLabelText('Annuler la création')));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(submitted).not.toHaveBeenCalled();
    expect(mockFiles.listFiles()).toEqual([]);
    expect(storedClients(db, 'Nour')).toEqual([]);
    expect(remote.objects.size).toBe(0);
  });

  it('a failed upload never loses the Client: added without a photo, said once, then submitted', async () => {
    remote.failUploads = true;
    const submitted = jest.fn();
    const view = await renderCreateSheet(db, remote, { onSubmitted: submitted });
    await typeName(view, 'Nour', 'Benali');
    await takePhoto(view);
    await waitFor(() => expect(displayedPhotoUri(view)).toBeDefined());

    await press(view, 'submit-client');

    await waitFor(() => expect(view.getByText('Impossible d’enregistrer la photo.')).toBeTruthy());
    expect(view.getByText('Le client a bien été ajouté. Vous pourrez ajouter sa photo depuis sa fiche.')).toBeTruthy();
    // The Client exists, complete, without a photo; the form has not been submitted yet.
    expect(storedClients(db, 'Nour')).toEqual([
      expect.objectContaining({ first_name: 'Nour', last_name: 'Benali', photo_path: null }),
    ]);
    expect(submitted).not.toHaveBeenCalled();
    // No orphan: no object, no cache copy, no draft file.
    expect(remote.objects.size).toBe(0);
    expect(mockFiles.listFiles()).toEqual([]);
    // No raw storage error reaches the professional.
    expect(view.queryByText(/upload failed/)).toBeNull();

    await act(async () => fireEvent.press(view.getByText('Compris')));

    expect(view.queryByText('Impossible d’enregistrer la photo.')).toBeNull();
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(submitted.mock.calls[0][0]).toEqual(expect.objectContaining({ firstName: 'Nour' }));
    expect('photoPath' in submitted.mock.calls[0][0]).toBe(false);
    expect(successHaptic).toHaveBeenCalledTimes(1);
  });

  it('without cloud storage (offline creation) the Client is added and the photo is never kept local-only', async () => {
    const submitted = jest.fn();
    const view = await renderCreateSheet(db, undefined, { onSubmitted: submitted });
    await typeName(view, 'Nour');
    await takePhoto(view);
    await waitFor(() => expect(displayedPhotoUri(view)).toBeDefined());

    await press(view, 'submit-client');

    await waitFor(() => expect(view.getByText('Impossible d’enregistrer la photo.')).toBeTruthy());
    expect(storedClients(db, 'Nour')).toEqual([expect.objectContaining({ photo_path: null })]);
    expect(mockFiles.listFiles()).toEqual([]);

    await act(async () => fireEvent.press(view.getByText('Compris')));
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it('locks the sheet while the photo is stored: no second Client, no cancel, one submission', async () => {
    let releaseUpload = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const slowRemote: BusinessMediaRemote = {
      ...remote,
      upload: (objectPath, localFileUri) => gate.then(() => remote.upload(objectPath, localFileUri)),
    };
    const onClose = jest.fn();
    const submitted = jest.fn();
    const view = await renderCreateSheet(db, slowRemote, { onClose, onSubmitted: submitted });
    await typeName(view, 'Nour');
    await takePhoto(view);
    await waitFor(() => expect(displayedPhotoUri(view)).toBeDefined());

    await press(view, 'submit-client');

    expect(view.getByText('Ajout du client…')).toBeTruthy();
    expect(view.getByTestId('submit-client').props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(view.getByTestId('client-form-photo-busy')).toBeTruthy();
    expect(storedClients(db, 'Nour')).toHaveLength(1);
    await press(view, 'submit-client');
    await act(async () => fireEvent.press(view.getByLabelText('Annuler la création')));
    expect(onClose).not.toHaveBeenCalled();
    expect(storedClients(db, 'Nour')).toHaveLength(1);
    expect(submitted).not.toHaveBeenCalled();

    await act(async () => {
      releaseUpload();
      await gate;
    });

    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(view.queryByText('Ajout du client…')).toBeNull();
    const [stored] = storedClients(db, 'Nour');
    expect(stored.photo_path).not.toBeNull();
    expect([...remote.objects.keys()]).toEqual([stored.photo_path]);
  });
});
