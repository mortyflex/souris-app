// BeautIzzy — test helpers for FormScrollView (never imported by app code)
//
// Jest lays nothing out: a test STATES where the scroll viewport and the
// focused input are, plays the keyboard (`sheet-keyboard.ts`), lets the form
// settle, and reads the scroll the form asked for. The test file must replace
// the measurement module first, at its top level:
//
//   jest.mock('@/shared/ui/form-scroll-geometry');

import { act } from '@testing-library/react-native';
import { ScrollView, TextInput, type HostInstance } from 'react-native';

import { measureInputInContent, measureScrollViewport } from '../form-scroll-geometry';
import { FORM_SCROLL_SETTLE_MS } from '../FormScrollView';
import type { MeasuredFrame } from '../form-scroll-geometry';

const SETTLE_MARGIN_MS = 20;

export interface FocusedInputScene {
  /** The scroll viewport, in window coordinates. */
  readonly viewport: MeasuredFrame;
  /** The focused input, in content coordinates; `undefined` when it is not inside this scroll. */
  readonly input: MeasuredFrame | undefined;
}

/**
 * Declares a focused input and the measurements the form will read for it.
 * Returns the restore of the focus stub; the measurement stubs reset with the
 * usual `jest.mocked(...).mockReset()`.
 */
export function stageFocusedInput(scene: FocusedInputScene): { readonly restore: () => void } {
  jest.mocked(measureScrollViewport).mockResolvedValue(scene.viewport);
  jest.mocked(measureInputInContent).mockResolvedValue(scene.input);
  const focused = jest
    .spyOn(TextInput.State, 'currentlyFocusedInput')
    .mockReturnValue({ measureLayout: jest.fn() } as unknown as HostInstance);
  return { restore: () => focused.mockRestore() };
}

/** The shared `scrollTo` of every mounted ScrollView (the preset mocks it on the prototype). */
export function scrollToMock(): jest.Mock {
  return ScrollView.prototype.scrollTo as unknown as jest.Mock;
}

function usesFakeTimers(): boolean {
  return typeof (setTimeout as unknown as { clock?: unknown }).clock !== 'undefined';
}

/** Lets the settle delay elapse and the measurements resolve: the form has revealed or stayed. */
export async function settleFormScroll(): Promise<void> {
  const total = FORM_SCROLL_SETTLE_MS + SETTLE_MARGIN_MS;
  await act(async () => {
    if (usesFakeTimers()) {
      jest.advanceTimersByTime(total);
      // The measurements resolve over a few microtask hops.
      for (let hop = 0; hop < 20; hop += 1) await Promise.resolve();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, total));
  });
}
