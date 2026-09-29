// Souris — the shared photo source flow: camera permission timing, camera,
// library, removal (Product photos and Client photos both run through it).

import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';

import type { CameraAccess, PhotoPickResult } from '@/shared/lib/photo-acquisition';

import { PhotoSourceFlow } from '../PhotoSourceFlow';
import { settleSheetTransition } from '../testing/sheet-transitions';

const mockEnsureCameraAccess = jest.fn<Promise<CameraAccess>, []>();
const mockPickPhotoFromLibrary = jest.fn<Promise<PhotoPickResult>, []>();
const mockOpenAppSettings = jest.fn();

jest.mock('@/shared/lib/photo-acquisition', () => ({
  ensureCameraAccess: () => mockEnsureCameraAccess(),
  pickPhotoFromLibrary: () => mockPickPhotoFromLibrary(),
  openAppSettings: () => mockOpenAppSettings(),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

// The camera itself is covered by PhotoCameraModal tests; here it only emits a capture.
jest.mock('../PhotoCameraModal', () => {
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

// Mirrors the iOS Modal contract (onDismiss once `visible` has dropped).
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const onSelected = jest.fn();
const onRemove = jest.fn();
const onPickError = jest.fn();

function Host({ hasImage = false }: { readonly hasImage?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <PhotoSourceFlow
        cameraHint="Cadrez le visage au centre"
        cameraTestID="client-camera"
        cameraTitle="Photo du client"
        hasImage={hasImage}
        libraryLabel="Choisir dans Photos"
        onClose={() => setVisible(false)}
        onPickError={onPickError}
        onRemove={onRemove}
        onSelected={onSelected}
        testID="client-photo"
        title="Audrey Tarmis"
        visible={visible}
      />
      {/* The caller's photo tap. */}
      <PressableOpen onPress={() => setVisible(true)} />
    </>
  );
}

function PressableOpen({ onPress }: { readonly onPress: () => void }) {
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  return <Pressable accessibilityLabel="Ouvrir la photo" onPress={onPress} />;
}

async function openSheet(view: Awaited<ReturnType<typeof render>>) {
  await act(async () => fireEvent.press(view.getByLabelText('Ouvrir la photo')));
  expect(view.getByTestId('client-photo-sheet')).toBeTruthy();
}

describe('PhotoSourceFlow', () => {
  beforeEach(() => {
    mockEnsureCameraAccess.mockReset();
    mockPickPhotoFromLibrary.mockReset();
    mockOpenAppSettings.mockReset();
    onSelected.mockReset();
    onRemove.mockReset();
    onPickError.mockReset();
  });

  it('asks for nothing on mount, nor when the photo menu opens', async () => {
    const view = await render(<Host />);
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();

    await openSheet(view);
    expect(view.getByLabelText('Prendre une photo')).toBeTruthy();
    expect(view.getByLabelText('Choisir dans Photos')).toBeTruthy();
    expect(view.queryByLabelText('Supprimer la photo')).toBeNull();
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();
    expect(mockPickPhotoFromLibrary).not.toHaveBeenCalled();
  });

  it('resolves the permission on the « Prendre une photo » tap, BEFORE presenting the camera', async () => {
    const access = deferred<CameraAccess>();
    mockEnsureCameraAccess.mockReturnValue(access.promise);
    const view = await render(<Host />);
    await openSheet(view);

    await act(async () => fireEvent.press(view.getByLabelText('Prendre une photo')));
    // The prompt is up (the check is in flight): no camera, the sheet still there.
    expect(mockEnsureCameraAccess).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('mock-camera-capture')).toBeNull();
    expect(view.getByTestId('client-photo-sheet')).toBeTruthy();

    // A second tap while the prompt is up is ignored.
    await act(async () => fireEvent.press(view.getByLabelText('Prendre une photo')));
    expect(mockEnsureCameraAccess).toHaveBeenCalledTimes(1);

    await act(async () => access.resolve('granted'));
    await settleSheetTransition();
    expect(view.queryByTestId('client-photo-sheet')).toBeNull();
    expect(view.getByTestId('mock-camera-capture')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('mock-camera-capture')));
    expect(onSelected).toHaveBeenCalledWith('file:///app/Caches/Camera/capture.jpg');
    expect(view.queryByTestId('mock-camera-capture')).toBeNull();
  });

  it('opens the camera directly when the permission is already granted', async () => {
    mockEnsureCameraAccess.mockResolvedValue('granted');
    const view = await render(<Host />);
    await openSheet(view);

    await act(async () => fireEvent.press(view.getByLabelText('Prendre une photo')));
    await settleSheetTransition();
    expect(view.getByTestId('mock-camera-capture')).toBeTruthy();
    expect(view.queryByTestId('camera-access-dialog')).toBeNull();
  });

  it('changes nothing when the professional refuses the system prompt', async () => {
    mockEnsureCameraAccess.mockResolvedValue('denied');
    const view = await render(<Host />);
    await openSheet(view);

    await act(async () => fireEvent.press(view.getByLabelText('Prendre une photo')));
    await settleSheetTransition();
    expect(view.queryByTestId('client-photo-sheet')).toBeNull();
    expect(view.queryByTestId('mock-camera-capture')).toBeNull();
    expect(view.queryByTestId('camera-access-dialog')).toBeNull();
    expect(onSelected).not.toHaveBeenCalled();

    // Retrying asks again through the same shared check.
    await openSheet(view);
    await act(async () => fireEvent.press(view.getByLabelText('Prendre une photo')));
    expect(mockEnsureCameraAccess).toHaveBeenCalledTimes(2);
  });

  it('offers the Settings app when the permission can no longer be asked', async () => {
    mockEnsureCameraAccess.mockResolvedValue('blocked');
    const view = await render(<Host />);
    await openSheet(view);

    await act(async () => fireEvent.press(view.getByLabelText('Prendre une photo')));
    await settleSheetTransition();
    expect(view.queryByTestId('mock-camera-capture')).toBeNull();
    expect(view.getByText('Accès à l’appareil photo')).toBeTruthy();
    expect(
      view.getByText(
        'Autorisez Souris à utiliser l’appareil photo dans les réglages pour pouvoir prendre une photo.',
      ),
    ).toBeTruthy();

    await act(async () => fireEvent.press(view.getByText('Ouvrir les réglages')));
    expect(mockOpenAppSettings).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Accès à l’appareil photo')).toBeNull();
    expect(onSelected).not.toHaveBeenCalled();
  });

  it('cancelling the Settings explanation changes nothing', async () => {
    mockEnsureCameraAccess.mockResolvedValue('blocked');
    const view = await render(<Host />);
    await openSheet(view);

    await act(async () => fireEvent.press(view.getByLabelText('Prendre une photo')));
    await settleSheetTransition();
    await act(async () => fireEvent.press(view.getByText('Annuler')));
    expect(view.queryByText('Accès à l’appareil photo')).toBeNull();
    expect(mockOpenAppSettings).not.toHaveBeenCalled();
    expect(onSelected).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('returns a library photo, never asking for the camera', async () => {
    mockPickPhotoFromLibrary.mockResolvedValue({
      status: 'selected',
      uri: 'file:///app/Caches/ImagePicker/pick.jpg',
    });
    const view = await render(<Host />);
    await openSheet(view);

    await act(async () => fireEvent.press(view.getByLabelText('Choisir dans Photos')));
    expect(onSelected).toHaveBeenCalledWith('file:///app/Caches/ImagePicker/pick.jpg');
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();
    await settleSheetTransition();
    expect(view.queryByTestId('client-photo-sheet')).toBeNull();
  });

  it('changes nothing when the picker is cancelled, and reports picker failures', async () => {
    mockPickPhotoFromLibrary.mockResolvedValue({ status: 'cancelled' });
    const view = await render(<Host />);
    await openSheet(view);

    await act(async () => fireEvent.press(view.getByLabelText('Choisir dans Photos')));
    expect(onSelected).not.toHaveBeenCalled();
    expect(onPickError).not.toHaveBeenCalled();
    await settleSheetTransition();

    mockPickPhotoFromLibrary.mockResolvedValue({ status: 'error' });
    await openSheet(view);
    await act(async () => fireEvent.press(view.getByLabelText('Choisir dans Photos')));
    expect(onSelected).not.toHaveBeenCalled();
    expect(onPickError).toHaveBeenCalledTimes(1);
  });

  it('offers replacement and removal when a photo exists', async () => {
    const view = await render(<Host hasImage />);
    await openSheet(view);

    expect(view.getByLabelText('Prendre une nouvelle photo')).toBeTruthy();
    await act(async () => fireEvent.press(view.getByLabelText('Supprimer la photo')));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();
  });
});
