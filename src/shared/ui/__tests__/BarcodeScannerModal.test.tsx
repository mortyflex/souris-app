import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { haptics } from '@/shared/lib/haptics';

import { BarcodeScannerModal } from '../BarcodeScannerModal';

interface MockPermission {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}

interface MockCameraProps {
  readonly barcodeScannerSettings?: { readonly barcodeTypes?: readonly string[] };
  readonly enableTorch?: boolean;
  readonly onBarcodeScanned?: (result: { readonly data: string }) => void;
}

let mockPermission: MockPermission | null = { granted: true, canAskAgain: true };
let mockCameraProps: MockCameraProps | null = null;
const mockRequestPermission = jest.fn(() => Promise.resolve(mockPermission));

jest.mock('expo-camera', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

  return {
    CameraView: (props: MockCameraProps) => {
      mockCameraProps = props;
      return React.createElement(View, { testID: 'camera-view' });
    },
    useCameraPermissions: () => [mockPermission, mockRequestPermission, jest.fn()],
  };
});

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const AnimatedView = (props: { readonly children?: React.ReactNode }) =>
    React.createElement(View, props);

  return {
    __esModule: true,
    default: Object.assign(AnimatedView, {
      View: AnimatedView,
      createAnimatedComponent: (component: unknown) => component,
    }),
    Easing: { inOut: (fn: unknown) => fn, sin: (value: number) => value },
    cancelAnimation: () => undefined,
    useSharedValue: (initial: unknown) => {
      let value = initial;
      return {
        get: () => value,
        set: (next: unknown) => {
          value = next;
        },
      };
    },
    useAnimatedStyle: (style: () => object) => style(),
    useReducedMotion: () => false,
    withRepeat: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});


jest.mock('expo-status-bar', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    StatusBar: ({ style }: { readonly style?: string }) =>
      React.createElement(View, { accessibilityLabel: style, testID: 'scanner-status-bar' }),
  };
});

jest.mock('@/shared/lib/haptics', () => ({
  haptics: { selection: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaProvider: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

describe('BarcodeScannerModal', () => {
  beforeEach(() => {
    mockPermission = { granted: true, canAskAgain: true };
    mockCameraProps = null;
    mockRequestPermission.mockClear();
    jest.mocked(haptics.selection).mockClear();
  });

  it('keeps the header and scan content inside the modal safe-area root', async () => {
    const view = await render(
      <BarcodeScannerModal onClose={jest.fn()} onScanned={jest.fn()} visible />,
    );

    expect(view.getByTestId('scanner-safe-area-provider')).toBeTruthy();
    const safeAreaRoot = view.getByTestId('scanner-safe-area-root');
    expect(safeAreaRoot.props.edges).toEqual(['top', 'bottom']);
    expect(view.getByTestId('scanner-status-bar').props.accessibilityLabel).toBe('light');
    expect(within(safeAreaRoot).getByTestId('scanner-header')).toBeTruthy();
    expect(within(safeAreaRoot).getByTestId('scanner-content')).toBeTruthy();
    expect(within(safeAreaRoot).getByLabelText('Fermer le scanner')).toBeTruthy();
    expect(view.getByText('Scanner un code-barres').props.numberOfLines).toBe(2);
    expect(within(safeAreaRoot).getByLabelText('Allumer la lampe')).toBeTruthy();

    // The camera and its framing overlay fill the screen behind the safe area
    // so the header floats on the scrim instead of shrinking the preview.
    expect(view.getByTestId('camera-view')).toBeTruthy();
    expect(within(safeAreaRoot).queryByTestId('camera-view')).toBeNull();
    const overlay = view.getByTestId('scanner-overlay');
    expect(overlay.props.pointerEvents).toBe('none');
    expect(within(overlay).getByTestId('scanner-window')).toBeTruthy();
    expect(within(overlay).getByText('Placez le code-barres dans le cadre')).toBeTruthy();

    await act(async () => {
      view.rerender(
        <BarcodeScannerModal onClose={jest.fn()} onScanned={jest.fn()} visible={false} />,
      );
    });
    expect(view.queryByTestId('scanner-status-bar')).toBeNull();
  });

  it('exposes and resets the torch state', async () => {
    const view = await render(
      <BarcodeScannerModal onClose={jest.fn()} onScanned={jest.fn()} visible />,
    );

    await act(async () => fireEvent.press(view.getByLabelText('Allumer la lampe')));
    expect(view.getByLabelText('Éteindre la lampe').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(mockCameraProps?.enableTorch).toBe(true);

    await act(async () => fireEvent.press(view.getByLabelText('Fermer le scanner')));
    expect(mockCameraProps?.enableTorch).toBe(false);
  });

  it('accepts one trimmed scan per opening and excludes QR', async () => {
    const onScanned = jest.fn();
    const view = await render(
      <BarcodeScannerModal onClose={jest.fn()} onScanned={onScanned} visible />,
    );

    expect(mockCameraProps?.barcodeScannerSettings?.barcodeTypes).toEqual([
      'ean13',
      'ean8',
      'upc_a',
      'upc_e',
      'code128',
      'itf14',
    ]);
    expect(mockCameraProps?.barcodeScannerSettings?.barcodeTypes).not.toContain('qr');

    await act(async () => {
      mockCameraProps?.onBarcodeScanned?.({ data: ' 00884486453280 ' });
      mockCameraProps?.onBarcodeScanned?.({ data: '00884486453280' });
      mockCameraProps?.onBarcodeScanned?.({ data: '00884486453280' });
    });

    expect(onScanned).toHaveBeenCalledTimes(1);
    expect(onScanned).toHaveBeenCalledWith('00884486453280');
    expect(haptics.selection).toHaveBeenCalledTimes(1);

    await act(async () => {
      view.rerender(
        <BarcodeScannerModal onClose={jest.fn()} onScanned={onScanned} visible={false} />,
      );
    });
    await act(async () => {
      view.rerender(
        <BarcodeScannerModal onClose={jest.fn()} onScanned={onScanned} visible />,
      );
    });
    await act(async () => {
      mockCameraProps?.onBarcodeScanned?.({ data: '30163508' });
    });

    expect(onScanned).toHaveBeenCalledTimes(2);
    expect(onScanned).toHaveBeenLastCalledWith('30163508');
  });

  it('requests permission only when first opened', async () => {
    mockPermission = null;
    const view = await render(
      <BarcodeScannerModal onClose={jest.fn()} onScanned={jest.fn()} visible={false} />,
    );

    expect(mockRequestPermission).not.toHaveBeenCalled();

    await act(async () => {
      view.rerender(
        <BarcodeScannerModal onClose={jest.fn()} onScanned={jest.fn()} visible />,
      );
    });

    expect(view.getByText('Préparation de la caméra…')).toBeTruthy();
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('offers retry while permission can still be requested', async () => {
    mockPermission = { granted: false, canAskAgain: true };
    const view = await render(
      <BarcodeScannerModal onClose={jest.fn()} onScanned={jest.fn()} visible />,
    );

    expect(view.getByText('Autoriser la caméra')).toBeTruthy();
    expect(view.queryByTestId('camera-view')).toBeNull();
    expect(view.queryByTestId('scanner-overlay')).toBeNull();
    expect(view.queryByLabelText('Allumer la lampe')).toBeNull();
    await act(async () => fireEvent.press(view.getByText('Réessayer')));
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('opens settings after permanent denial', async () => {
    mockPermission = { granted: false, canAskAgain: false };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const view = await render(
      <BarcodeScannerModal onClose={jest.fn()} onScanned={jest.fn()} visible />,
    );

    expect(view.getByText('La caméra est nécessaire pour scanner un code-barres.')).toBeTruthy();
    await act(async () => fireEvent.press(view.getByText('Ouvrir les réglages')));
    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });
});
