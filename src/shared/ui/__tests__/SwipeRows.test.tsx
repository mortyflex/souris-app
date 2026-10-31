// BeautIzzy — shared swipe rows: the revealed action is really tappable
//
// Regression (Android, October 2026): swiping revealed the trash / « Actions »,
// but tapping it did nothing. gesture-handler's ReanimatedSwipeable keeps an
// empty, opacity-0, `absoluteFill` right-actions container ABOVE its left
// actions; Android hit-testing ignores opacity (iOS skips alpha < 0.01), so
// the tap landed on that invisible layer. The action now lives in the row's
// own `SwipeRevealedAction` layer, drawn above the swipeable on every
// platform and clipped to the strip the row uncovered.
//
// Jest cannot run native hit-testing: these tests pin the STRUCTURE that
// makes the tap reachable (the action is never inside the swipeable, it is
// drawn after it, it is zero wide at rest), plus the interactions on top of
// it. Real Android validation stays a manual check.

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Platform, Pressable, StyleSheet, Text, type GestureResponderEvent } from 'react-native';

import { haptics } from '@/shared/lib/haptics';

import { SwipeActionRow, SWIPE_ACTION_WIDTH } from '../SwipeActionRow';
import { SwipeToDeleteRow } from '../SwipeToDeleteRow';
import { DELETE_ACTION_WIDTH, SWIPE_HINT_DELAY_MS, SWIPE_HINT_TOTAL_MS } from '../swipe-to-delete';
import { MOCK_PARTIAL_SWIPE_DISTANCE } from '../testing/mock-reanimated-swipeable';

jest.spyOn(haptics, 'selection').mockImplementation();

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
  cancelAnimation: () => undefined,
  Extrapolation: { CLAMP: 'clamp' },
  interpolate: (value: number, input: number[], output: number[]) =>
    value <= input[0] ? output[0] : output[output.length - 1],
}));

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  jest.requireActual('@/shared/ui/testing/mock-reanimated-swipeable'),
);

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: never[]) => void, ...args: never[]) => fn(...args),
}));

const originalOS = Platform.OS;

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
}

function layerWidth(view: Awaited<ReturnType<typeof render>>, testID: string): unknown {
  return StyleSheet.flatten(view.getByTestId(testID).props.style).width;
}

function touch(pageX: number, pageY: number) {
  return { nativeEvent: { pageX, pageY } } as GestureResponderEvent;
}

async function renderActionRow(props: { readonly hint?: boolean } = {}) {
  const onAction = jest.fn();
  const onOpenDetail = jest.fn();
  const element = () => (
    <SwipeActionRow
      actionIcon={{ ios: 'ellipsis.circle', android: 'more_horiz' }}
      actionLabel="Actions"
      actionTestID="sale-actions"
      hint={props.hint}
      onAction={onAction}
      surfaceColor="#fff"
      testID="sale-swipe"
    >
      <Pressable onPress={onOpenDetail} testID="sale-row">
        <Text>Vente sans client</Text>
      </Pressable>
    </SwipeActionRow>
  );
  const view = await render(element());
  // The mocked swipeable re-renders alone; re-rendering the row re-evaluates its animated styles.
  const refresh = () => view.rerender(element());
  return { view, refresh, onAction, onOpenDetail };
}

async function renderDeleteRow(onDelete: () => boolean) {
  const onOpenDetail = jest.fn();
  const element = () => (
    <SwipeToDeleteRow
      deleteAccessibilityLabel="Supprimer Ongles naturels"
      deleteTestID="category-delete"
      onDelete={onDelete}
      surfaceColor="#fff"
      testID="category-swipe"
    >
      <Pressable onPress={onOpenDetail} testID="category-row">
        <Text>Ongles naturels</Text>
      </Pressable>
    </SwipeToDeleteRow>
  );
  const view = await render(element());
  const refresh = () => view.rerender(element());
  return { view, refresh, onOpenDetail };
}

describe.each(['android', 'ios'] as const)('shared swipe rows on %s', (os) => {
  beforeEach(() => {
    Platform.OS = os;
  });
  afterAll(() => {
    Platform.OS = originalOS;
  });

  describe('SwipeActionRow', () => {
    it('draws « Actions » outside the swipeable and after it, so no layer of the primitive can cover it', async () => {
      const { view } = await renderActionRow();
      const swipeable = view.getByTestId('sale-swipe');

      expect(within(swipeable).queryByTestId('sale-actions')).toBeNull();
      const layer = view.getByTestId('sale-swipe-revealed');
      expect(within(layer).getByTestId('sale-actions')).toBeTruthy();

      const row = view.getByTestId('sale-swipe-container');
      const rowChildren = row.children as { props: { testID?: string } }[];
      const order = rowChildren.map((child) => child.props.testID);
      expect(order.indexOf('sale-swipe-revealed')).toBeGreaterThan(-1);
      // The layer is the last child: above the swipeable in z-order.
      expect(order.at(-1)).toBe('sale-swipe-revealed');
    });

    it('is zero wide at rest, so a tap on the row still opens its detail', async () => {
      const { view, onAction, onOpenDetail } = await renderActionRow();

      expect(layerWidth(view, 'sale-swipe-revealed')).toBe(0);
      await press(view.getByTestId('sale-row'));

      expect(onOpenDetail).toHaveBeenCalledTimes(1);
      expect(onAction).not.toHaveBeenCalled();
    });

    it('manual swipe → the 76 pt action is uncovered; tapping it opens the flow once and closes the row', async () => {
      const { view, refresh, onAction, onOpenDetail } = await renderActionRow();

      await press(view.getByTestId('sale-swipe-swipe-partial'));
      await refresh();
      expect(MOCK_PARTIAL_SWIPE_DISTANCE).toBeGreaterThan(SWIPE_ACTION_WIDTH);
      expect(layerWidth(view, 'sale-swipe-revealed')).toBe(SWIPE_ACTION_WIDTH);
      expect(onAction).not.toHaveBeenCalled();

      await press(view.getByTestId('sale-actions'));

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onOpenDetail).not.toHaveBeenCalled();
      expect(view.getByTestId('sale-swipe-closed').props.children).toBe('1');
    });

    it('ignores rapid repeated taps on the same reveal, and re-arms on the next reveal', async () => {
      const { view, onAction } = await renderActionRow();

      await press(view.getByTestId('sale-swipe-swipe-partial'));
      await press(view.getByTestId('sale-actions'));
      await press(view.getByTestId('sale-actions'));
      await press(view.getByTestId('sale-actions'));
      expect(onAction).toHaveBeenCalledTimes(1);

      await press(view.getByTestId('sale-swipe-swipe-partial'));
      await press(view.getByTestId('sale-actions'));
      expect(onAction).toHaveBeenCalledTimes(2);
    });

    it('a swipe never acts by itself, full swipe included', async () => {
      const { view, refresh, onAction } = await renderActionRow();

      await press(view.getByTestId('sale-swipe-swipe-full'));
      await refresh();

      expect(onAction).not.toHaveBeenCalled();
      // Clipped to the action: never wider than 76 pt.
      expect(layerWidth(view, 'sale-swipe-revealed')).toBe(SWIPE_ACTION_WIDTH);
    });

    it('a drag that starts on the revealed action is a swipe, not a tap', async () => {
      const { view } = await renderActionRow();
      const guard = within(view.getByTestId('sale-swipe-revealed')).getByTestId('sale-actions').parent;
      const handlers = guard?.props as {
        onStartShouldSetResponderCapture: (event: GestureResponderEvent) => boolean;
        onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => boolean;
      };

      expect(handlers.onStartShouldSetResponderCapture(touch(40, 300))).toBe(false);
      expect(handlers.onMoveShouldSetResponderCapture(touch(41, 302))).toBe(false); // a tap's jitter
      expect(handlers.onMoveShouldSetResponderCapture(touch(40, 340))).toBe(false); // a vertical scroll
      expect(handlers.onMoveShouldSetResponderCapture(touch(20, 301))).toBe(true); // sideways: claimed
    });

    it('after the automatic peek, a manual swipe still reveals a tappable « Actions »', async () => {
      jest.useFakeTimers();
      try {
        const { view, onAction } = await renderActionRow({ hint: true });

        await act(async () => {
          jest.advanceTimersByTime(SWIPE_HINT_DELAY_MS);
        });
        expect(view.getByTestId('sale-swipe-hint')).toBeTruthy();
        // The peek moves the row, never the action layer: nothing is tappable yet.
        expect(layerWidth(view, 'sale-swipe-revealed')).toBe(0);
        await act(async () => {
          jest.advanceTimersByTime(SWIPE_HINT_TOTAL_MS);
        });
        expect(view.queryByTestId('sale-swipe-hint')).toBeNull();
        expect(onAction).not.toHaveBeenCalled();

        await press(view.getByTestId('sale-swipe-swipe-partial'));
        await press(view.getByTestId('sale-actions'));

        expect(onAction).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('SwipeToDeleteRow', () => {
    it('draws the trash outside the swipeable and after it', async () => {
      const { view } = await renderDeleteRow(() => true);

      expect(within(view.getByTestId('category-swipe')).queryByTestId('category-delete')).toBeNull();
      expect(within(view.getByTestId('category-swipe-revealed')).getByTestId('category-delete')).toBeTruthy();
      expect(layerWidth(view, 'category-swipe-revealed')).toBe(0);
    });

    it('manual swipe → tapping the trash asks the caller once (its confirmation), never the row press', async () => {
      const onDelete = jest.fn(() => false); // the caller shows its confirmation; nothing committed yet
      const { view, refresh, onOpenDetail } = await renderDeleteRow(onDelete);

      await press(view.getByTestId('category-swipe-swipe-partial'));
      await refresh();
      expect(onDelete).not.toHaveBeenCalled();
      expect(layerWidth(view, 'category-swipe-revealed')).toBe(DELETE_ACTION_WIDTH);

      await press(view.getByTestId('category-delete'));

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onOpenDetail).not.toHaveBeenCalled();
      // Not committed: the row closes again, and the trash stays usable next time.
      expect(view.getByTestId('category-swipe-closed').props.children).toBe('1');
      await press(view.getByTestId('category-swipe-swipe-partial'));
      await press(view.getByTestId('category-delete'));
      expect(onDelete).toHaveBeenCalledTimes(2);
    });

    it('deletes at most once: repeated trash taps after a committed deletion do nothing', async () => {
      const onDelete = jest.fn(() => true);
      const { view } = await renderDeleteRow(onDelete);

      await press(view.getByTestId('category-swipe-swipe-partial'));
      await press(view.getByTestId('category-delete'));
      await press(view.getByTestId('category-delete'));

      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('a tap on the row at rest still opens it', async () => {
      const onDelete = jest.fn(() => true);
      const { view, onOpenDetail } = await renderDeleteRow(onDelete);

      await press(view.getByTestId('category-row'));

      expect(onOpenDetail).toHaveBeenCalledTimes(1);
      expect(onDelete).not.toHaveBeenCalled();
    });
  });
});
