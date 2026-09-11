import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { BottomSheet } from '../BottomSheet';

// The preset Modal mock never reports dismissal; this one mirrors the iOS
// contract (onDismiss once `visible` has dropped) so chaining can be verified.
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
      return this.props.visible
        ? React.createElement(View, { testID: 'mock-modal' }, this.props.children)
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

describe('BottomSheet', () => {
  it('renders one scrim behind the sheet content and dismisses on outside tap', async () => {
    const onClose = jest.fn();
    const view = await render(
      <BottomSheet backdropLabel="Fermer le panneau" onClose={onClose} testID="sheet" visible>
        <Text>Contenu</Text>
      </BottomSheet>,
    );

    expect(view.getAllByTestId('bottom-sheet-scrim')).toHaveLength(1);
    expect(view.getByTestId('sheet')).toBeTruthy();
    expect(view.getByText('Contenu')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByLabelText('Fermer le panneau')));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores outside taps when dismissal is not allowed', async () => {
    const onClose = jest.fn();
    const view = await render(
      <BottomSheet
        backdropLabel="Zone extérieure"
        dismissOnBackdropPress={false}
        onClose={onClose}
        visible
      >
        <Text>Contenu</Text>
      </BottomSheet>,
    );

    expect(view.getByLabelText('Zone extérieure').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await act(async () => fireEvent.press(view.getByLabelText('Zone extérieure')));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports dismissal only after the modal is gone, and nothing while hidden', async () => {
    const onDismissed = jest.fn();
    const view = await render(
      <BottomSheet backdropLabel="Fermer" onClose={jest.fn()} onDismissed={onDismissed} visible={false}>
        <Text>Contenu</Text>
      </BottomSheet>,
    );

    expect(view.queryByTestId('bottom-sheet-scrim')).toBeNull();
    expect(onDismissed).not.toHaveBeenCalled();

    await act(async () => {
      view.rerender(
        <BottomSheet backdropLabel="Fermer" onClose={jest.fn()} onDismissed={onDismissed} visible>
          <Text>Contenu</Text>
        </BottomSheet>,
      );
    });
    expect(onDismissed).not.toHaveBeenCalled();

    await act(async () => {
      view.rerender(
        <BottomSheet
          backdropLabel="Fermer"
          onClose={jest.fn()}
          onDismissed={onDismissed}
          visible={false}
        >
          <Text>Contenu</Text>
        </BottomSheet>,
      );
    });
    expect(onDismissed).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('bottom-sheet-scrim')).toBeNull();
  });
});
