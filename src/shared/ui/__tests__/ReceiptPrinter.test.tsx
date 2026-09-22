import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { haptics } from '@/shared/lib/haptics';

import { glassIcons } from '../GlassIconButton';
import { ReceiptPrinter } from '../ReceiptPrinter';
import { receiptPrint } from '../theme';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// Nothing animates under test; `withDelay` is observed to tell the printed
// feed from the reduced-motion placement.
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('@/features/clients/birthday/testing/mock-reanimated');
  return { __esModule: true, ...actual, withDelay: jest.fn(actual.withDelay) };
});

const reanimated = jest.requireMock('react-native-reanimated') as {
  readonly reducedMotion: { enabled: boolean };
  readonly withDelay: jest.Mock;
};

function renderPrinter(onClose = jest.fn()) {
  return render(
    <ReceiptPrinter
      backdropLabel="Fermer le ticket"
      onClose={onClose}
      renderReceipt={({ width }) => <Text testID="receipt-content">{`paper ${width}`}</Text>}
      testID="printer"
      visible
    />,
  );
}

async function layOutPaper(view: Awaited<ReturnType<typeof renderPrinter>>, height = 480) {
  await act(async () =>
    fireEvent(view.getByTestId('printer-paper'), 'layout', {
      nativeEvent: { layout: { height, width: 340, x: 0, y: 0 } },
    }),
  );
}

describe('ReceiptPrinter', () => {
  beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    reanimated.reducedMotion.enabled = false;
    reanimated.withDelay.mockClear();
  });

  it('prints the receipt once it is laid out, with ONE haptic whatever later layouts report', async () => {
    const print = jest.spyOn(haptics, 'print');
    const view = await renderPrinter();
    expect(view.getByTestId('receipt-content')).toBeTruthy();
    expect(print).not.toHaveBeenCalled();

    await layOutPaper(view);
    await layOutPaper(view, 620);

    expect(print).toHaveBeenCalledTimes(1);
    // The feed waits for the capsule, then the settle follows the feed.
    expect(reanimated.withDelay).toHaveBeenCalledWith(receiptPrint.feedDelay, expect.anything());
    expect(reanimated.withDelay).toHaveBeenCalledWith(
      receiptPrint.feedDelay + receiptPrint.feed,
      expect.anything(),
    );
    print.mockRestore();
  });

  it('with Reduce Motion places the paper at once, keeping the haptic', async () => {
    reanimated.reducedMotion.enabled = true;
    const print = jest.spyOn(haptics, 'print');
    const view = await renderPrinter();

    await layOutPaper(view);

    expect(print).toHaveBeenCalledTimes(1);
    expect(reanimated.withDelay).not.toHaveBeenCalled();
    expect(view.getByTestId('receipt-content')).toBeTruthy();
    print.mockRestore();
  });

  it('closes from « Fermer », the dimmed page, the hardware back button and the escape gesture', async () => {
    const onClose = jest.fn();
    const view = await renderPrinter(onClose);

    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Fermer' })));
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Fermer le ticket' })));
    await act(async () => fireEvent(view.getByTestId('printer'), 'accessibilityEscape'));
    const modal = view.container.queryAll((node) => typeof node.props.onRequestClose === 'function')[0];
    await act(async () => modal!.props.onRequestClose());

    expect(onClose).toHaveBeenCalledTimes(4);
    expect(view.queryByLabelText(/^×$|^X$/)).toBeNull();
  });

  it('shows only the « Fermer » icon button unless the receipt offers more actions', async () => {
    const view = await renderPrinter();
    expect(view.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual([
      'Fermer le ticket',
      'Fermer',
    ]);
    // The same icon-only close button as « Tops & tendances »: spoken, not written.
    expect(view.queryByText('Fermer')).toBeNull();
    const close = view.getByTestId('printer-close');
    expect(close.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(close.props.style)).toMatchObject({ width: 44, height: 44 });
    expect(view.queryByTestId('printer-notice')).toBeNull();
    expect(view.queryByTestId('printer-offstage', { includeHiddenElements: true })).toBeNull();
  });

  it('turns « Fermer » and the actions into one row of labelled icon buttons, with a notice line and a hidden off-stage surface', async () => {
    const onPress = jest.fn();
    const onSave = jest.fn();
    const view = await render(
      <ReceiptPrinter
        actionNotice="Impossible de préparer le partage."
        backdropLabel="Fermer le ticket"
        offstage={<Text testID="export-surface">card</Text>}
        onClose={jest.fn()}
        renderReceipt={() => <Text>paper</Text>}
        actions={[
          { icon: glassIcons.saveImage, accessibilityLabel: 'Enregistrer le ticket', onPress: onSave, testID: 'printer-save' },
          { icon: glassIcons.share, accessibilityLabel: 'Partager le ticket', onPress, testID: 'printer-share' },
        ]}
        testID="printer"
        visible
      />,
    );

    const share = view.getByRole('button', { name: 'Partager le ticket' });
    // Fermer, then the actions in order, on one row — icon-only, each with its spoken label.
    expect(view.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual([
      'Fermer le ticket',
      'Fermer',
      'Enregistrer le ticket',
      'Partager le ticket',
    ]);
    expect(view.queryByText('Fermer')).toBeNull();
    await act(async () => fireEvent.press(view.getByTestId('printer-save')));
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(share));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('printer-notice').props.children).toBe('Impossible de préparer le partage.');

    // Mounted, but outside the window and never announced.
    expect(view.queryByTestId('export-surface')).toBeNull();
    const offstage = view.getByTestId('printer-offstage', { includeHiddenElements: true });
    expect(offstage.props.accessibilityElementsHidden).toBe(true);
    expect(offstage.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(offstage.props.style).left).toBeGreaterThan(0);
  });

  it('ignores presses on a busy or disabled action, the busy one showing a spinner in its circle', async () => {
    const onPress = jest.fn();
    const onSave = jest.fn();
    const view = await render(
      <ReceiptPrinter
        backdropLabel="Fermer le ticket"
        onClose={jest.fn()}
        renderReceipt={() => <Text>paper</Text>}
        actions={[
          { icon: glassIcons.saveImage, accessibilityLabel: 'Enregistrer', onPress: onSave, disabled: true, testID: 'save' },
          { icon: glassIcons.share, accessibilityLabel: 'Partager', onPress, busy: true, testID: 'share' },
        ]}
        testID="printer"
        visible
      />,
    );
    const share = view.getByTestId('share');
    expect(share.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(view.container.queryAll((node) => node.type === 'ActivityIndicator' || node.type === 'RCTActivityIndicatorView').length).toBe(1);
    await act(async () => fireEvent.press(share));
    expect(onPress).not.toHaveBeenCalled();
    const save = view.getByTestId('save');
    expect(save.props.accessibilityState).toMatchObject({ busy: false, disabled: true });
    await act(async () => fireEvent.press(save));
    expect(onSave).not.toHaveBeenCalled();
  });
});
