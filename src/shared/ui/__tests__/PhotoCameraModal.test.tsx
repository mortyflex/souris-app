import { act, fireEvent, render } from '@testing-library/react-native';

import { haptics } from '@/shared/lib/haptics';

import { PhotoCameraModal } from '../PhotoCameraModal';

const mockUseCameraPermissions = jest.fn();
const mockRequestPermission = jest.fn();
const mockTakePicture = jest.fn(() => Promise.resolve({ uri: 'file:///camera/product.jpg' }));

jest.mock('expo-camera', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

  const CameraView = React.forwardRef<unknown, object>(function CameraView(props, ref) {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
    return React.createElement(View, { ...props, testID: 'camera-view' });
  });

  return {
    CameraView,
    Camera: { requestCameraPermissionsAsync: mockRequestPermission },
    useCameraPermissions: mockUseCameraPermissions,
  };
});

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('@/shared/lib/haptics', () => ({
  haptics: { selection: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const copy = {
  hint: 'Placez le produit au centre',
  testID: 'product-camera',
  title: 'Photo du produit',
};

describe('PhotoCameraModal', () => {
  beforeEach(() => {
    mockRequestPermission.mockClear();
    mockUseCameraPermissions.mockClear();
    mockTakePicture.mockClear();
    mockTakePicture.mockResolvedValue({ uri: 'file:///camera/product.jpg' });
    jest.mocked(haptics.selection).mockClear();
  });

  it('presents a full camera preview with one shutter and no scrim', async () => {
    const onCaptured = jest.fn();
    const view = await render(
      <PhotoCameraModal {...copy} onCaptured={onCaptured} onClose={jest.fn()} visible />,
    );

    expect(view.getByTestId('camera-view')).toBeTruthy();
    expect(view.getByTestId('product-camera-preview').props.style).toMatchObject({ flex: 1 });
    expect(view.getByText('Placez le produit au centre')).toBeTruthy();
    expect(view.queryByTestId('bottom-sheet-scrim')).toBeNull();
    expect(view.queryByText('Placez le code-barres dans le cadre')).toBeNull();

    await act(async () => fireEvent.press(view.getByLabelText('Prendre la photo')));
    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    expect(mockTakePicture).toHaveBeenCalledWith(expect.objectContaining({ quality: 0.85 }));
    expect(onCaptured).toHaveBeenCalledWith('file:///camera/product.jpg');
    expect(haptics.selection).toHaveBeenCalledTimes(1);
  });

  it('closes from the header and renders nothing while hidden', async () => {
    const onClose = jest.fn();
    const view = await render(
      <PhotoCameraModal {...copy} onCaptured={jest.fn()} onClose={onClose} visible />,
    );

    await act(async () => fireEvent.press(view.getByLabelText('Fermer la caméra')));
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      view.rerender(<PhotoCameraModal {...copy} onCaptured={jest.fn()} onClose={onClose} visible={false} />);
    });
    expect(view.queryByTestId('camera-view')).toBeNull();
  });

  it('keeps a failed capture recoverable', async () => {
    mockTakePicture.mockRejectedValueOnce(new Error('camera busy'));
    const onCaptured = jest.fn();
    const view = await render(
      <PhotoCameraModal {...copy} onCaptured={onCaptured} onClose={jest.fn()} visible />,
    );

    await act(async () => fireEvent.press(view.getByLabelText('Prendre la photo')));
    expect(onCaptured).not.toHaveBeenCalled();
    expect(view.getByLabelText('Prendre la photo').props.accessibilityState).toEqual({
      busy: false,
      disabled: false,
    });
  });

  it('never asks for the camera permission itself: the flow resolved it before presenting', async () => {
    const view = await render(
      <PhotoCameraModal {...copy} onCaptured={jest.fn()} onClose={jest.fn()} visible />,
    );

    expect(view.getByTestId('camera-view')).toBeTruthy();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockUseCameraPermissions).not.toHaveBeenCalled();
    expect(view.queryByText('Préparation de la caméra…')).toBeNull();
  });

  it('closes instead of showing a dead preview when the camera cannot start', async () => {
    const onClose = jest.fn();
    const view = await render(
      <PhotoCameraModal {...copy} onCaptured={jest.fn()} onClose={onClose} visible />,
    );

    await act(async () => view.getByTestId('camera-view').props.onMountError({ message: 'x' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('carries the caller wording and testIDs', async () => {
    const view = await render(
      <PhotoCameraModal
        hint="Cadrez le visage au centre"
        onCaptured={jest.fn()}
        onClose={jest.fn()}
        testID="client-camera"
        title="Photo du client"
        visible
      />,
    );

    expect(view.getByText('Photo du client')).toBeTruthy();
    expect(view.getByText('Cadrez le visage au centre')).toBeTruthy();
    expect(view.getByTestId('client-camera-shutter')).toBeTruthy();
  });
});
