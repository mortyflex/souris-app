// BeautIzzy — FormScrollView: the focused field stays visible above the keyboard
//
// Jest lays nothing out: each test states the geometry (viewport in the
// window, focused input in the content), plays the keyboard and reads the one
// scroll the form asks for — or that it asked for none.

import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef } from 'react';
import { Platform, ScrollView, Text } from 'react-native';

import { FormScrollView } from '../FormScrollView';
import { captureKeyboardEvents } from '../testing/sheet-keyboard';
import { scrollToMock, settleFormScroll, stageFocusedInput } from '../testing/form-scroll';
import { TextField } from '../TextField';

jest.mock('@/shared/ui/form-scroll-geometry');

type Rendered = Awaited<ReturnType<typeof render>>;

/** Viewport 600 pt tall starting 100 pt below the window top; the keyboard top is 500 → 200 pt overlap. */
const VIEWPORT = { top: 100, height: 600 };
/** Under the test keyboard (top 500) and the shell that does not lift: 400 pt remain visible. */
const VISIBLE_HEIGHT = 400;
const MARGIN = 24;
const CONTENT_HEIGHT = 800;

function Form({ scrollRef }: { readonly scrollRef?: React.RefObject<ScrollView | null> }) {
  return (
    <FormScrollView ref={scrollRef} testID="form">
      <Text>Formulaire</Text>
      <TextField accessibilityLabel="Notes" label="Notes" onChangeText={() => {}} placeholder="Notes" value="" />
    </FormScrollView>
  );
}

async function layOut(view: Rendered, height = VIEWPORT.height, contentHeight = CONTENT_HEIGHT) {
  // One event per act: two nested fireEvent acts in one scope overlap under React 19.
  await act(async () => {
    fireEvent(view.getByTestId('form'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
  });
  await act(async () => {
    fireEvent(view.getByTestId('form'), 'contentSizeChange', 390, contentHeight);
  });
}

describe('FormScrollView', () => {
  let keyboard: ReturnType<typeof captureKeyboardEvents>;
  let staged: ReturnType<typeof stageFocusedInput> | undefined;

  beforeEach(() => {
    scrollToMock().mockClear();
    keyboard = captureKeyboardEvents();
  });

  afterEach(() => {
    staged?.restore();
    staged = undefined;
    keyboard.restore();
  });

  it('scrolls just enough to reveal a focused field the keyboard covers, and pads the end of the content by the overlap', async () => {
    const view = await render(<Form />);
    await layOut(view);
    staged = stageFocusedInput({ viewport: VIEWPORT, input: { top: 700, height: 44 } });

    await keyboard.show();
    await settleFormScroll();

    // 200 pt of the viewport are under the keyboard: a spacer lets the last field scroll above it.
    expect(view.getByTestId('form-scroll-keyboard-spacer')).toHaveStyle({ height: 200 });
    expect(scrollToMock()).toHaveBeenCalledTimes(1);
    expect(scrollToMock()).toHaveBeenCalledWith({ y: 744 + MARGIN - VISIBLE_HEIGHT, animated: true });
  });

  it('does not scroll when the focused field is already visible', async () => {
    const view = await render(<Form />);
    await layOut(view);
    staged = stageFocusedInput({ viewport: VIEWPORT, input: { top: 100, height: 44 } });

    await keyboard.show();
    await settleFormScroll();

    expect(scrollToMock()).not.toHaveBeenCalled();
  });

  it('reveals the field that takes focus while the keyboard is already up', async () => {
    const view = await render(<Form />);
    await layOut(view, VIEWPORT.height, 1200);
    staged = stageFocusedInput({ viewport: VIEWPORT, input: { top: 100, height: 44 } });
    await keyboard.show();
    await settleFormScroll();
    expect(scrollToMock()).not.toHaveBeenCalled();

    // The professional taps the Notes field, low in the form: TextField reports the focus.
    staged.restore();
    staged = stageFocusedInput({ viewport: VIEWPORT, input: { top: 700, height: 96 } });
    await act(async () => fireEvent(view.getByLabelText('Notes'), 'focus'));
    await settleFormScroll();

    expect(scrollToMock()).toHaveBeenCalledTimes(1);
    expect(scrollToMock()).toHaveBeenCalledWith({ y: 796 + MARGIN - VISIBLE_HEIGHT, animated: true });
  });

  it('follows a multiline field that grows under the caret: the content change re-checks the field', async () => {
    const view = await render(<Form />);
    await layOut(view);
    staged = stageFocusedInput({ viewport: VIEWPORT, input: { top: 300, height: 96 } });
    await keyboard.show();
    await settleFormScroll();
    const revealedOnce = scrollToMock().mock.calls.length;

    // Two more lines typed: the field is 44 pt taller, the content too.
    staged.restore();
    staged = stageFocusedInput({ viewport: VIEWPORT, input: { top: 300, height: 140 } });
    await act(async () => fireEvent(view.getByTestId('form'), 'contentSizeChange', 390, CONTENT_HEIGHT + 44));
    await settleFormScroll();

    expect(scrollToMock().mock.calls.length).toBe(revealedOnce + 1);
    expect(scrollToMock()).toHaveBeenLastCalledWith({ y: 440 + MARGIN - VISIBLE_HEIGHT, animated: true });
  });

  it('coalesces a burst of layout and keyboard events into one reveal', async () => {
    const view = await render(<Form />);
    await layOut(view);
    staged = stageFocusedInput({ viewport: VIEWPORT, input: { top: 700, height: 44 } });

    await keyboard.show();
    // The shell shrinks the body while the keyboard animates: a layout change inside the settle window.
    await act(async () => {
      fireEvent(view.getByTestId('form'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 598 } } });
    });
    await settleFormScroll();

    expect(scrollToMock()).toHaveBeenCalledTimes(1);
  });

  it('removes the spacer when the keyboard closes and settles an offset left past the content', async () => {
    const view = await render(<Form />);
    await layOut(view);
    staged = stageFocusedInput({ viewport: VIEWPORT, input: { top: 700, height: 44 } });
    await keyboard.show();
    await settleFormScroll();
    scrollToMock().mockClear();
    // The scroll the form asked for has happened.
    await act(async () => {
      fireEvent.scroll(view.getByTestId('form'), { nativeEvent: { contentOffset: { y: 368 } } });
    });

    await keyboard.hide();

    expect(view.queryByTestId('form-scroll-keyboard-spacer')).toBeNull();
    // 800 pt of content in a 600 pt viewport: 368 would leave a blank area, 200 is the end.
    expect(scrollToMock()).toHaveBeenCalledWith({ y: CONTENT_HEIGHT - VIEWPORT.height, animated: true });
  });

  it('leaves the form alone when the keyboard closes on a sound offset', async () => {
    const view = await render(<Form />);
    await layOut(view);
    staged = stageFocusedInput({ viewport: VIEWPORT, input: { top: 100, height: 44 } });
    await keyboard.show();
    await settleFormScroll();

    await keyboard.hide();

    expect(scrollToMock()).not.toHaveBeenCalled();
  });

  it('ignores a focused input that is not inside this scroll view (the field of a sheet presented over it)', async () => {
    const view = await render(<Form />);
    await layOut(view);
    staged = stageFocusedInput({ viewport: VIEWPORT, input: undefined });

    await keyboard.show();
    await settleFormScroll();

    expect(scrollToMock()).not.toHaveBeenCalled();
    expect(view.queryByTestId('form-scroll-keyboard-spacer')).toBeNull();
  });

  it('does nothing without a focused input, whatever the keyboard does', async () => {
    const view = await render(<Form />);
    await layOut(view);

    await keyboard.show();
    await settleFormScroll();
    await keyboard.hide();

    expect(scrollToMock()).not.toHaveBeenCalled();
  });

  it('on Android, learns the keyboard once it is shown and reveals the field the same way', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      const view = await render(<Form />);
      await layOut(view);
      staged = stageFocusedInput({ viewport: VIEWPORT, input: { top: 700, height: 44 } });

      await keyboard.show();
      await settleFormScroll();

      expect(scrollToMock()).toHaveBeenCalledWith({ y: 744 + MARGIN - VISIBLE_HEIGHT, animated: true });

      await keyboard.hide();
      expect(view.queryByTestId('form-scroll-keyboard-spacer')).toBeNull();
    } finally {
      platform.restore();
    }
  });

  it('keeps the ScrollView API for its screens: a ref scrolls it, taps on a field never dismiss the keyboard first', async () => {
    const scrollRef = createRef<ScrollView | null>();
    const view = await render(<Form scrollRef={scrollRef} />);

    scrollRef.current?.scrollTo({ y: 0, animated: true });
    expect(scrollToMock()).toHaveBeenCalledWith({ y: 0, animated: true });
    expect(view.getByTestId('form').props.keyboardShouldPersistTaps).toBe('handled');
  });
});
