// BeautIzzy — test helpers for keyboard-avoiding sheets (never imported by app code)
//
// Jest has no software keyboard: `captureKeyboardEvents` records every
// Keyboard listener so a test can play a show / hide, and `sheetAnchor`
// finds the bottom-justified anchor a sheet surface sits in — the view whose
// top gap reveals whether that sheet is avoiding the keyboard.

import { act } from '@testing-library/react-native';
import { Keyboard, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type Listener = (event: unknown) => void;

const keyboardFrame = {
  duration: 0,
  easing: 'keyboard',
  endCoordinates: { height: 300, screenX: 0, screenY: 500, width: 390 },
};

export function captureKeyboardEvents() {
  const listeners = new Map<string, Set<Listener>>();
  const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: Listener) => {
    const registered = listeners.get(event) ?? new Set<Listener>();
    registered.add(listener);
    listeners.set(event, registered);
    return { remove: () => registered.delete(listener) };
  }) as unknown as typeof Keyboard.addListener);

  const emit = (events: readonly string[]) =>
    act(async () => {
      for (const event of events) {
        listeners.get(event)?.forEach((listener) => listener(keyboardFrame));
      }
    });

  return {
    show: () => emit(['keyboardWillShow', 'keyboardDidShow']),
    hide: () => emit(['keyboardWillHide', 'keyboardDidHide']),
    restore: () => spy.mockRestore(),
  };
}

interface HostNode {
  readonly props: { readonly style?: StyleProp<ViewStyle> };
  readonly parent: HostNode | null;
}

/** The nearest sheet anchor above `node` (bottom-justified host). */
export function sheetAnchor(node: HostNode): HostNode | null {
  let current = node.parent;
  while (current && StyleSheet.flatten(current.props.style)?.justifyContent !== 'flex-end') {
    current = current.parent;
  }
  return current;
}

/**
 * Whether the sheet holding `node` avoids the keyboard: its keyboard-avoiding
 * anchor pads itself (`padding` behavior) — a covered sheet renders a plain
 * anchor instead.
 */
export function avoidsKeyboard(node: HostNode): boolean {
  const anchor = sheetAnchor(node);
  return anchor !== null && StyleSheet.flatten(anchor.props.style)?.paddingBottom !== undefined;
}

/** The top gap a sheet keeps above its surface while the keyboard is up. */
export function keyboardTopGap(node: HostNode): number | undefined {
  const anchor = sheetAnchor(node);
  return anchor ? (StyleSheet.flatten(anchor.props.style)?.paddingTop as number | undefined) : undefined;
}
