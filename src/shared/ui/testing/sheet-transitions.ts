// Souris — test helpers for shared-UI transitions (never imported by app code)
//
// The shared BottomSheet slides down before it unmounts and the floating
// create button reveals shortly after focus. Under Jest the Animated
// completions arrive through timers, so a test that asserts a sheet is gone
// (or chains a presentation through `onDismissed`), or presses a freshly
// revealed floating +, lets the transition settle first. Works with real
// timers and with Jest fake timers.

import { act } from '@testing-library/react-native';

import { duration, floatingAction } from '../theme';

const SETTLE_MARGIN_MS = 40;

function usesFakeTimers(): boolean {
  return typeof (setTimeout as unknown as { clock?: unknown }).clock !== 'undefined';
}

/** Lets the open/close transition of every mounted BottomSheet complete. */
export async function settleSheetTransition(): Promise<void> {
  await act(async () => {
    if (usesFakeTimers()) {
      jest.advanceTimersByTime(duration.panel + SETTLE_MARGIN_MS);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, duration.panel + SETTLE_MARGIN_MS));
  });
}

/** Lets the floating create button's focus reveal (delay + fade/rise) complete. */
export async function settleFloatingReveal(): Promise<void> {
  const total = floatingAction.revealDelay + duration.state + SETTLE_MARGIN_MS;
  await act(async () => {
    if (usesFakeTimers()) {
      jest.advanceTimersByTime(total);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, total));
  });
}
