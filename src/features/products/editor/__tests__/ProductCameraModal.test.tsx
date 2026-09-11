import { act, fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { haptics } from '@/shared/lib/haptics';

import { ProductCameraModal } from '../components/ProductCameraModal';

interface MockPermission {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}

let mockPermission: MockPermission | null = { granted: true, canAskAgain: true };
const mockRequestPermission = jest.fn(() => Promise.resolve(mockPermission));
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
    useCameraPermissions: () => [mockPermission, mockRequestPermission, jest.fn()],
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

describe('ProductCameraModal', () => {
  beforeEach(() => {
    mockPermission = { granted: true, canAskAgain: true };
    mockRequestPermission.mockClear();
    mockTakePicture.mockClear();
    mockTakePicture.mockResolvedValue({ uri: 'file:///camera/product.jpg' });
    jest.mocked(haptics.selection).mockClear();
  });

  it('presents a full camera preview with one shutter and no scrim', async () => {
    const onCaptured = jest.fn();
    const view = await render(
      <ProductCameraModal onCaptured={onCaptured} onClose={jest.fn()} visible />,
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
      <ProductCameraModal onCaptured={jest.fn()} onClose={onClose} visible />,
    );

    await act(async () => fireEvent.press(view.getByLabelText('Fermer la caméra')));
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      view.rerender(<ProductCameraModal onCaptured={jest.fn()} onClose={onClose} visible={false} />);
    });
    expect(view.queryByTestId('camera-view')).toBeNull();
  });

  it('keeps a failed capture recoverable', async () => {
    mockTakePicture.mockRejectedValueOnce(new Error('camera busy'));
    const onCaptured = jest.fn();
    const view = await render(
      <ProductCameraModal onCaptured={onCaptured} onClose={jest.fn()} visible />,
    );

    await act(async () => fireEvent.press(view.getByLabelText('Prendre la photo')));
    expect(onCaptured).not.toHaveBeenCalled();
    expect(view.getByLabelText('Prendre la photo').props.accessibilityState).toEqual({
      busy: false,
      disabled: false,
    });
  });

  it('requests camera permission only when presented', async () => {
    mockPermission = null;
    const view = await render(
      <ProductCameraModal onCaptured={jest.fn()} onClose={jest.fn()} visible={false} />,
    );
    expect(mockRequestPermission).not.toHaveBeenCalled();

    await act(async () => {
      view.rerender(<ProductCameraModal onCaptured={jest.fn()} onClose={jest.fn()} visible />);
    });
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(view.getByText('Préparation de la caméra…')).toBeTruthy();
  });

  it('opens settings after permanent denial', async () => {
    mockPermission = { granted: false, canAskAgain: false };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const view = await render(
      <ProductCameraModal onCaptured={jest.fn()} onClose={jest.fn()} visible />,
    );

    expect(view.queryByTestId('camera-view')).toBeNull();
    await act(async () => fireEvent.press(view.getByText('Ouvrir les réglages')));
    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });
});
