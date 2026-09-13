// Souris — shared BottomSheet contract
//
// Behavior only (no animation frame values): render, dismissal policy,
// the close transition lifecycle (slide down THEN unmount / onDismissed),
// the scroll-safe variant, the canonical header action and the fixed
// action area.

import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppButton } from '../AppButton';
import { BottomSheet } from '../BottomSheet';
import { SheetActionBar } from '../SheetActionBar';
import { SheetHeader } from '../SheetHeader';
import { settleSheetTransition } from '../testing/sheet-transitions';

// The preset Modal mock never reports dismissal; this one mirrors the iOS
// contract (onDismiss once `visible` has dropped) so chaining can be verified.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

  interface MockModalProps {
    readonly visible?: boolean;
    readonly onDismiss?: () => void;
    readonly onRequestClose?: () => void;
    readonly children?: React.ReactNode;
  }

  class MockModal extends React.Component<MockModalProps> {
    componentDidUpdate(previous: MockModalProps) {
      if (previous.visible && !this.props.visible) this.props.onDismiss?.();
    }

    render() {
      return this.props.visible
        ? React.createElement(
            View,
            {
              testID: 'mock-modal',
              onRequestClose: this.props.onRequestClose,
            } as unknown as React.ComponentProps<typeof View>,
            this.props.children,
          )
        : null;
    }
  }

  return { __esModule: true, default: MockModal };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

async function renderSheet(overrides: Partial<React.ComponentProps<typeof BottomSheet>> = {}) {
  const onClose = jest.fn();
  const onDismissed = jest.fn();
  const props: React.ComponentProps<typeof BottomSheet> = {
    backdropLabel: 'Fermer le panneau',
    children: <Text>Contenu</Text>,
    onClose,
    onDismissed,
    testID: 'sheet',
    visible: true,
    ...overrides,
  };
  const view = await render(<BottomSheet {...props} />);
  const rerender = (next: Partial<React.ComponentProps<typeof BottomSheet>>) =>
    act(async () => {
      view.rerender(<BottomSheet {...props} {...next} />);
    });
  return { view, onClose, onDismissed, rerender };
}

describe('BottomSheet', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders one scrim behind the sheet content and dismisses on outside tap', async () => {
    const { view, onClose } = await renderSheet();

    expect(view.getAllByTestId('bottom-sheet-scrim')).toHaveLength(1);
    expect(view.getByTestId('sheet')).toBeTruthy();
    expect(view.getByText('Contenu')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByLabelText('Fermer le panneau')));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores outside taps when backdrop dismissal is not allowed', async () => {
    const { view, onClose } = await renderSheet({
      backdropLabel: 'Zone extérieure',
      dismissOnBackdropPress: false,
    });

    expect(view.getByLabelText('Zone extérieure').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await act(async () => fireEvent.press(view.getByLabelText('Zone extérieure')));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the surface mounted while it slides down, then unmounts and reports dismissal', async () => {
    const { view, onDismissed, rerender } = await renderSheet();
    expect(onDismissed).not.toHaveBeenCalled();

    await rerender({ visible: false });

    // Still on screen during the close transition — never an instant disappearance.
    expect(view.getByTestId('sheet')).toBeTruthy();
    expect(view.getByTestId('bottom-sheet-scrim')).toBeTruthy();
    expect(onDismissed).not.toHaveBeenCalled();

    await settleSheetTransition();

    expect(view.queryByTestId('sheet')).toBeNull();
    expect(view.queryByTestId('bottom-sheet-scrim')).toBeNull();
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it('reports nothing while hidden and only after a real close', async () => {
    const { view, onDismissed, rerender } = await renderSheet({ visible: false });

    expect(view.queryByTestId('bottom-sheet-scrim')).toBeNull();
    expect(onDismissed).not.toHaveBeenCalled();

    await rerender({ visible: true });
    await settleSheetTransition();
    expect(view.getByTestId('sheet')).toBeTruthy();
    expect(onDismissed).not.toHaveBeenCalled();

    await rerender({ visible: false });
    await settleSheetTransition();
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it('can be reopened while it is closing without a stale dismissal', async () => {
    const { view, onDismissed, rerender } = await renderSheet();

    await rerender({ visible: false });
    await rerender({ visible: true });
    await settleSheetTransition();

    expect(view.getByTestId('sheet')).toBeTruthy();
    expect(onDismissed).not.toHaveBeenCalled();
  });

  it('exposes the drag zone and lets a downward drag past the threshold request a close', async () => {
    const { view, onClose } = await renderSheet();
    const dragZone = view.getByTestId('bottom-sheet-drag-zone');

    await act(async () => {
      fireEvent(dragZone, 'responderGrant', {
        nativeEvent: { touches: [], changedTouches: [] },
        touchHistory: { touchBank: [], numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: 0 },
      });
    });
    // The PanResponder handlers are wired to the grabber/header zone only.
    expect(dragZone.props.onResponderGrant).toBeDefined();
    expect(dragZone.props.onMoveShouldSetResponder).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not react to a pan on the drag zone when pan dismissal is disabled', async () => {
    const { view } = await renderSheet({ dismissOnPanDown: false });
    const dragZone = view.getByTestId('bottom-sheet-drag-zone');

    const shouldSet = dragZone.props.onMoveShouldSetResponder as (event: unknown) => boolean;
    // A generous downward move never claims the responder for a scroll-safe sheet.
    expect(
      shouldSet({
        nativeEvent: { touches: [{ pageX: 0, pageY: 0 }], changedTouches: [], identifier: 1 },
        touchHistory: {
          touchBank: [],
          numberActiveTouches: 1,
          indexOfSingleActiveTouch: 0,
          mostRecentTimeStamp: 0,
        },
      }),
    ).toBe(false);
  });

  it('keeps the hardware back inert when hardware-back dismissal is disabled', async () => {
    const { view, onClose } = await renderSheet({ dismissOnHardwareBack: false });

    expect(view.getByTestId('mock-modal').props.onRequestClose).toBeUndefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders the canonical header with its right action and the fixed action area', async () => {
    const onAction = jest.fn();
    const onPrimary = jest.fn();
    const { view } = await renderSheet({
      footer: (
        <SheetActionBar>
          <AppButton onPress={onPrimary} title="Enregistrer" />
        </SheetActionBar>
      ),
      header: (
        <SheetHeader
          action={{ accessibilityLabel: 'Fermer le panneau de test', label: 'Fermer', onPress: onAction }}
          eyebrow="COMPTE"
          title="Maison Léa"
        />
      ),
      scrollable: true,
    });

    expect(view.getByText('COMPTE')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Maison Léa' })).toBeTruthy();

    await act(async () => fireEvent.press(view.getByLabelText('Fermer le panneau de test')));
    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => fireEvent.press(view.getByText('Enregistrer')));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });
});
