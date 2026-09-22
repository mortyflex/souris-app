import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { haptics } from '@/shared/lib/haptics';

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
});
