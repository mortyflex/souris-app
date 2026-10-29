// BeautIzzy — FormScrollView measurements
//
// The only native measurements of the form scroll, isolated so the behaviour
// of FormScrollView can be tested on plain geometry: Jest lays nothing out, and
// these two calls are what a test replaces (`testing/form-scroll.ts`).

import type { HostInstance, ScrollView } from 'react-native';

export interface MeasuredFrame {
  readonly top: number;
  readonly height: number;
}

// The imperative method exists on every ScrollView (`getInnerViewRef`), next to
// `getInnerViewNode`; only the published TypeScript declaration leaves it out.
interface ScrollViewWithInnerRef {
  readonly getInnerViewRef?: () => HostInstance | null;
}

/** The scroll viewport in WINDOW coordinates, where the keyboard frame is expressed. */
export function measureScrollViewport(scrollView: ScrollView): Promise<MeasuredFrame | undefined> {
  const node = scrollView.getNativeScrollRef();
  if (!node) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    node.measureInWindow((_x, y, _width, height) => resolve({ top: y, height }));
  });
}

/**
 * The focused input relative to the scroll CONTENT, independent of the current
 * offset — or `undefined` when the input is not inside this scroll view (the
 * field of another sheet, for instance).
 */
export function measureInputInContent(scrollView: ScrollView, input: HostInstance): Promise<MeasuredFrame | undefined> {
  const content = (scrollView as ScrollView & ScrollViewWithInnerRef).getInnerViewRef?.();
  if (!content) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    input.measureLayout(
      content,
      (_x, y, _width, height) => resolve({ top: y, height }),
      () => resolve(undefined),
    );
  });
}
