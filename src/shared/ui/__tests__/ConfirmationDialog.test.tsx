import { act, fireEvent, render } from '@testing-library/react-native';

import { ConfirmationDialog } from '../ConfirmationDialog';

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

async function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmationDialog>> = {}) {
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  const view = await render(
    <ConfirmationDialog
      body="Cette action est irréversible."
      cancelLabel="Retour"
      cancelTestID="cancel"
      confirmLabel="Supprimer"
      confirmTestID="confirm"
      eyebrow="SUPPRESSION"
      onCancel={onCancel}
      onConfirm={onConfirm}
      testID="dialog"
      title="Supprimer définitivement ?"
      visible
      {...overrides}
    />,
  );
  return { view, onCancel, onConfirm };
}

describe('ConfirmationDialog', () => {
  it('renders eyebrow, title, body and both actions with modal semantics', async () => {
    const { view } = await renderDialog();

    expect(view.getByText('SUPPRESSION')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Supprimer définitivement ?' })).toBeTruthy();
    expect(view.getByText('Cette action est irréversible.')).toBeTruthy();
    const dialog = view.getByTestId('dialog');
    expect(dialog.props.accessibilityRole).toBe('alert');
    expect(dialog.props.accessibilityViewIsModal).toBe(true);
    expect(view.getByTestId('cancel')).toBeTruthy();
    expect(view.getByTestId('confirm')).toBeTruthy();
  });

  it('confirms the destructive action only through the confirm control', async () => {
    const { view, onCancel, onConfirm } = await renderDialog();

    await act(async () => fireEvent.press(view.getByTestId('confirm')));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels from the secondary action and from the scrim', async () => {
    const { view, onCancel, onConfirm } = await renderDialog();

    await act(async () => fireEvent.press(view.getByTestId('cancel')));
    // The scrim sits outside the modal card, so it is hidden from the accessibility tree.
    await act(async () => fireEvent.press(view.getByLabelText('Fermer', { includeHiddenElements: true })));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables both actions while busy', async () => {
    const { view, onCancel, onConfirm } = await renderDialog({ busy: true });

    expect(view.getByTestId('confirm').props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(view.getByTestId('cancel').props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => fireEvent.press(view.getByTestId('confirm')));
    await act(async () => fireEvent.press(view.getByTestId('cancel')));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders an explanation-only dialog without a confirm control', async () => {
    const { view } = await renderDialog({ cancelLabel: 'Compris', confirmLabel: undefined, tone: 'neutral' });

    expect(view.getByText('Compris')).toBeTruthy();
    expect(view.queryByTestId('confirm')).toBeNull();
  });

  it('renders nothing while hidden', async () => {
    const { view } = await renderDialog({ visible: false });

    expect(view.queryByTestId('dialog')).toBeNull();
  });
});
