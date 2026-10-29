// BeautIzzy — FormScrollView
//
// The scroll container of every BeautIzzy form: a ScrollView that keeps the
// focused field visible above the keyboard, on iOS and Android alike, so the
// professional never scrolls by hand to see what she types.
//
// Why a shared scroll and not one more KeyboardAvoidingView: the sheet shells
// already lift their fixed actions above the keyboard (iOS `padding`, Android
// window resize). That changes the SIZE of the scrolling body, never its
// offset — a field that sat in the lower part of the form is then below the
// fold. The platforms do not fully cover it either: UIKit scrolls to a field
// when it takes focus, with the frame the body has at that moment (before the
// keyboard), and Android only when its ScrollView shrinks, without margin.
//
// What it does, from measured geometry only (nothing is predicted):
//
// - lets the layout settle first. Every trigger — the keyboard transition
//   ending, the body's own layout change while the keyboard is up (the shell
//   has shrunk it), a focus change while the keyboard is already up (TextField
//   reports it through `useFormScrollView`), the content growing under the
//   caret (a multiline note, a validation line) — requests ONE reveal after a
//   short settle delay, so a burst of events ends in a single motion;
// - measures the focused input relative to the scroll content and the viewport
//   relative to the window, computes the one offset that shows the field with a
//   comfortable margin (`keyboard-visibility.ts`) and scrolls there. Nothing
//   moves when the field is already visible;
// - when the keyboard still covers the bottom of the viewport (a page without
//   a keyboard-avoiding shell), a trailing spacer as tall as that overlap lets
//   the last field scroll above the keyboard;
// - when the keyboard closes, the spacer goes and an offset that now points
//   past the content settles back to its end: no blank area left behind.
//
// Only the focused input of THIS scroll view counts: a covered sheet measuring
// the input of the sheet presented over it gets nothing back and stays put.
// Cursor, selection, value and validation are never touched: the field keeps
// its focus, only the scroll offset changes.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

import { measureInputInContent, measureScrollViewport } from './form-scroll-geometry';
import {
  resolveKeyboardOverlap,
  resolveKeyboardTop,
  resolveRevealOffset,
  resolveSettledOffset,
} from './keyboard-visibility';
import { spacing } from './theme';

/** Gap kept between the focused input and the keyboard (or the viewport edges). */
export const FORM_SCROLL_REVEAL_MARGIN = spacing.xl;
/** Settle delay (ms) between the last layout / keyboard event and the one reveal. */
export const FORM_SCROLL_SETTLE_MS = 48;

interface FormScrollViewContextValue {
  /** A field of this form took focus: keep it visible if the keyboard is up. */
  readonly revealFocusedInput: () => void;
}

const FormScrollViewContext = createContext<FormScrollViewContextValue | null>(null);

/** The enclosing FormScrollView, or `null` outside one (the field then does nothing special). */
export function useFormScrollView(): FormScrollViewContextValue | null {
  return useContext(FormScrollViewContext);
}

export interface FormScrollViewProps extends ScrollViewProps {
  readonly ref?: Ref<ScrollView>;
}

export function FormScrollView({
  ref,
  children,
  keyboardShouldPersistTaps = 'handled',
  onContentSizeChange,
  onLayout,
  onScroll,
  scrollEventThrottle = 16,
  ...props
}: FormScrollViewProps) {
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  // Live geometry, kept in refs: it changes on every frame of a scroll and never
  // needs a render of its own.
  const offset = useRef(0);
  const viewportHeight = useRef<number>(undefined);
  const contentHeight = useRef(0);
  /** The spacer that was part of the last reported content height. */
  const contentSpacer = useRef(0);
  /** Top edge of the keyboard in window coordinates; undefined while it is hidden. */
  const keyboardTop = useRef<number>(undefined);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A later request supersedes a measurement still in flight.
  const generation = useRef(0);
  const [spacer, setSpacer] = useState(0);
  const spacerRef = useRef(0);

  const assignRef = useCallback(
    (instance: ScrollView | null) => {
      scrollRef.current = instance;
      if (typeof ref === 'function') {
        ref(instance);
      } else if (ref) {
        ref.current = instance;
      }
    },
    [ref],
  );

  const scrollToOffset = (target: number) => {
    offset.current = target;
    scrollRef.current?.scrollTo({ y: target, animated: true });
  };

  /** Measures now and scrolls only if the focused input is not fully visible. */
  const reveal = useCallback(() => {
    const scrollView = scrollRef.current;
    const input = TextInput.State.currentlyFocusedInput();
    if (!scrollView || !input || keyboardTop.current === undefined) return;
    const run = ++generation.current;

    void Promise.all([measureScrollViewport(scrollView), measureInputInContent(scrollView, input)]).then(
      ([viewport, field]) => {
        if (run !== generation.current || !viewport || !field) return;
        const top = keyboardTop.current;
        if (top === undefined || TextInput.State.currentlyFocusedInput() !== input) return;

        const overlap = resolveKeyboardOverlap({
          viewportTop: viewport.top,
          viewportHeight: viewport.height,
          keyboardTop: top,
        });
        if (overlap !== spacerRef.current) {
          spacerRef.current = overlap;
          setSpacer(overlap);
        }
        const target = resolveRevealOffset({
          offset: offset.current,
          viewportHeight: viewport.height,
          keyboardOverlap: overlap,
          // The content as it will be once the spacer is laid out (unknown before its first layout).
          contentHeight: contentHeight.current > 0 ? contentHeight.current - contentSpacer.current + overlap : undefined,
          inputTop: field.top,
          inputHeight: field.height,
          margin: FORM_SCROLL_REVEAL_MARGIN,
        });
        if (target !== undefined) scrollToOffset(target);
      },
    );
  }, []);

  /** One reveal once the current burst of layout / keyboard events has settled. */
  const requestReveal = useCallback(() => {
    if (keyboardTop.current === undefined) return;
    if (settleTimer.current !== undefined) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = undefined;
      reveal();
    }, FORM_SCROLL_SETTLE_MS);
  }, [reveal]);

  /** Keyboard closed: never leave the offset pointing past the end of the content. */
  const settle = useCallback(() => {
    if (viewportHeight.current === undefined) return;
    const target = resolveSettledOffset({
      offset: offset.current,
      viewportHeight: viewportHeight.current,
      contentHeight: contentHeight.current,
    });
    if (target !== undefined) scrollToOffset(target);
  }, []);

  useEffect(() => {
    const onKeyboardFrame = (event: KeyboardEvent) => {
      keyboardTop.current = resolveKeyboardTop(event.endCoordinates, windowHeight);
    };
    const onKeyboardHidden = () => {
      keyboardTop.current = undefined;
      if (settleTimer.current !== undefined) {
        clearTimeout(settleTimer.current);
        settleTimer.current = undefined;
      }
      generation.current += 1;
      if (spacerRef.current !== 0) {
        spacerRef.current = 0;
        setSpacer(0);
      }
      settle();
    };

    // iOS announces the frame before the transition and the end of it after;
    // Android only knows the keyboard once it is there (the window has resized).
    const subscriptions =
      Platform.OS === 'ios'
        ? [
            Keyboard.addListener('keyboardWillShow', onKeyboardFrame),
            Keyboard.addListener('keyboardWillChangeFrame', onKeyboardFrame),
            Keyboard.addListener('keyboardDidShow', requestReveal),
            Keyboard.addListener('keyboardDidChangeFrame', requestReveal),
            Keyboard.addListener('keyboardWillHide', onKeyboardHidden),
          ]
        : [
            Keyboard.addListener('keyboardDidShow', (event) => {
              onKeyboardFrame(event);
              requestReveal();
            }),
            Keyboard.addListener('keyboardDidHide', onKeyboardHidden),
          ];

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      if (settleTimer.current !== undefined) clearTimeout(settleTimer.current);
    };
  }, [windowHeight, requestReveal, settle]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    const changed = viewportHeight.current !== undefined && Math.abs(viewportHeight.current - height) >= 1;
    viewportHeight.current = height;
    onLayout?.(event);
    if (!changed) return;
    if (keyboardTop.current !== undefined) requestReveal();
    else settle();
  };

  const handleContentSizeChange = (width: number, height: number) => {
    const changed = Math.abs(contentHeight.current - height) >= 1;
    contentHeight.current = height;
    contentSpacer.current = spacerRef.current;
    onContentSizeChange?.(width, height);
    if (!changed) return;
    if (keyboardTop.current !== undefined) requestReveal();
    else settle();
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };

  const context = useMemo<FormScrollViewContextValue>(() => ({ revealFocusedInput: requestReveal }), [requestReveal]);

  return (
    <FormScrollViewContext.Provider value={context}>
      <ScrollView
        {...props}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
        onScroll={handleScroll}
        ref={assignRef}
        scrollEventThrottle={scrollEventThrottle}
      >
        {children}
        {spacer > 0 && <View pointerEvents="none" style={{ height: spacer }} testID="form-scroll-keyboard-spacer" />}
      </ScrollView>
    </FormScrollViewContext.Provider>
  );
}
