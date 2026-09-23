import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { BottomSheet } from '../BottomSheet';
import { SheetScreen } from '../SheetScreen';
import { avoidsKeyboard, captureKeyboardEvents, keyboardTopGap } from '../testing/sheet-keyboard';
import { settleSheetTransition } from '../testing/sheet-transitions';
import { sheet } from '../theme';

const mockBack = jest.fn();
const mockDispatch = jest.fn();
// The latest registration of the removal guard: [prevent, onHeld].
const mockGuard: { prevent?: boolean; onHeld?: (event: { data: { action: object } }) => void } = {};

// Whether the route is the focused one (false: another route is presented over it).
let mockFocused = true;

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useNavigation: () => ({ dispatch: mockDispatch }),
  useIsFocused: () => mockFocused,
}));

jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (prevent: boolean, onHeld: (event: { data: { action: object } }) => void) => {
    mockGuard.prevent = prevent;
    mockGuard.onHeld = onHeld;
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

describe('SheetScreen', () => {
  beforeEach(() => {
    mockFocused = true;
    mockBack.mockClear();
    mockDispatch.mockClear();
  });

  describe('fit="content" — the shared presentation hosted in a transparent route', () => {
    it('draws the edge-to-edge sheet itself: scrim, content-sized surface capped at the detent', async () => {
      const view = await render(
        <SheetScreen fit="content" testID="details">
          <Text>Contenu</Text>
        </SheetScreen>,
      );

      expect(view.getByTestId('sheet-screen-scrim')).toBeTruthy();
      const surface = StyleSheet.flatten(view.getByTestId('sheet-screen-surface').props.style);
      expect(surface.flex).toBeUndefined();
      expect(surface.maxHeight).toBeGreaterThan(0);
      // Attached to the screen: no horizontal margin, top corners only.
      expect(surface.marginHorizontal).toBeUndefined();
      expect(surface.borderTopLeftRadius).toBeGreaterThan(0);
      expect(surface.borderBottomLeftRadius).toBeUndefined();
      expect(view.getByTestId('details')).toBeTruthy();
      expect(view.getByText('Contenu')).toBeTruthy();
    });

    it('asks the router to go back on an outside tap, like any other way out', async () => {
      const view = await render(
        <SheetScreen fit="content">
          <Text>Contenu</Text>
        </SheetScreen>,
      );

      await act(async () => fireEvent.press(view.getByTestId('sheet-screen-scrim')));
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('ignores outside taps while a draft is edited', async () => {
      const view = await render(
        <SheetScreen dismissible={false} fit="content">
          <Text>Contenu</Text>
        </SheetScreen>,
      );

      await act(async () => fireEvent.press(view.getByTestId('sheet-screen-scrim')));
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('brings a change of contentKey as a new sheet and keeps the previous one only while it slides away', async () => {
      const wait = (ms: number) => act(async () => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      const view = await render(
        <SheetScreen contentKey="read" fit="content">
          <Text>Lecture</Text>
        </SheetScreen>,
      );
      // The first surface has opened (no native layout under Jest: the wait fallback).
      await wait(sheet.layoutWaitFallback + 40);

      await view.rerender(
        <SheetScreen contentKey="edit" fit="content">
          <Text>Édition</Text>
        </SheetScreen>,
      );

      // The new sheet is the only one users and assistive tech can reach…
      expect(view.getByText('Édition')).toBeTruthy();
      expect(view.queryByText('Lecture')).toBeNull();
      // …while the previous one is still drawn beneath it: no instant swap.
      const leaving = view.getByText('Lecture', { includeHiddenElements: true });
      expect(leaving).toBeTruthy();
      expect(view.getAllByTestId('sheet-screen-surface', { includeHiddenElements: true })).toHaveLength(2);

      await wait(sheet.layoutWaitFallback + 40);
      await settleSheetTransition();
      expect(view.queryByText('Lecture', { includeHiddenElements: true })).toBeNull();
      expect(view.getAllByTestId('sheet-screen-surface', { includeHiddenElements: true })).toHaveLength(1);
      expect(view.getByText('Édition')).toBeTruthy();
    });

    it('updates the content in place when the contentKey does not change', async () => {
      const view = await render(
        <SheetScreen contentKey="read" fit="content">
          <Text>Avant</Text>
        </SheetScreen>,
      );
      await view.rerender(
        <SheetScreen contentKey="read" fit="content">
          <Text>Après</Text>
        </SheetScreen>,
      );

      expect(view.getByText('Après')).toBeTruthy();
      expect(view.queryByText('Avant', { includeHiddenElements: true })).toBeNull();
      expect(view.getAllByTestId('sheet-screen-surface', { includeHiddenElements: true })).toHaveLength(1);
    });

    it('holds the removal while the sheet slides down, then lets the same action through', async () => {
      await render(
        <SheetScreen fit="content">
          <Text>Contenu</Text>
        </SheetScreen>,
      );
      expect(mockGuard.prevent).toBe(true);

      const action = { type: 'GO_BACK' };
      await act(async () => mockGuard.onHeld?.({ data: { action } }));
      // Still held: the route never vanishes before the close transition ends.
      expect(mockDispatch).not.toHaveBeenCalled();
      expect(mockGuard.prevent).toBe(true);

      await settleSheetTransition();
      expect(mockGuard.prevent).toBe(false);
      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith(action);
    });

    it('asks a guarded draft instead of closing when a way out it did not start comes in', async () => {
      const onLeaveAttempt = jest.fn();
      await render(
        <SheetScreen dismissible={false} fit="content" onLeaveAttempt={onLeaveAttempt}>
          <Text>Brouillon</Text>
        </SheetScreen>,
      );

      await act(async () => mockGuard.onHeld?.({ data: { action: { type: 'GO_BACK' } } }));
      await settleSheetTransition();
      // The sheet stays: no close transition, no navigation.
      expect(onLeaveAttempt).toHaveBeenCalledTimes(1);
      expect(mockGuard.prevent).toBe(true);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('shrinks a tall sheet above the keyboard, below the detent top gap', async () => {
      const keyboard = captureKeyboardEvents();
      const view = await render(
        <SheetScreen fit="content" keyboardAvoiding>
          <Text>Contenu</Text>
        </SheetScreen>,
      );
      const surface = () => view.getByTestId('sheet-screen-surface');

      // Keyboard down: no top gap (maxHeight bounds the sheet).
      expect(avoidsKeyboard(surface())).toBe(true);
      expect(keyboardTopGap(surface())).toBeUndefined();
      expect(StyleSheet.flatten(surface().props.style).flexShrink).toBe(1);

      await keyboard.show();
      expect(keyboardTopGap(surface())).toBeGreaterThan(0);

      await keyboard.hide();
      expect(keyboardTopGap(surface())).toBeUndefined();
      keyboard.restore();
    });

    it('lets only the top sheet react to the keyboard: a drawer opened inside it leaves it in place', async () => {
      const keyboard = captureKeyboardEvents();
      const renderRoute = (drawerVisible: boolean) => (
        <SheetScreen fit="content" keyboardAvoiding>
          <Text>Sous la caisse</Text>
          <BottomSheet backdropLabel="Fermer" keyboardAvoiding onClose={jest.fn()} visible={drawerVisible}>
            <Text>Caisse</Text>
          </BottomSheet>
        </SheetScreen>
      );
      const view = await render(renderRoute(true));
      const route = () => view.getByTestId('sheet-screen-surface');
      const drawer = () => view.getByText('Caisse');

      await keyboard.show();
      // The drawer takes the keyboard; the covered route neither lifts nor shrinks.
      expect(avoidsKeyboard(drawer())).toBe(true);
      expect(keyboardTopGap(drawer())).toBeGreaterThan(0);
      expect(avoidsKeyboard(route())).toBe(false);
      expect(keyboardTopGap(route())).toBeUndefined();

      await keyboard.hide();
      await view.rerender(renderRoute(false));
      await settleSheetTransition();
      // Uncovered again: the route is the top sheet and avoids the keyboard.
      expect(view.queryByText('Caisse')).toBeNull();
      expect(avoidsKeyboard(route())).toBe(true);
      await keyboard.show();
      expect(keyboardTopGap(route())).toBeGreaterThan(0);
      keyboard.restore();
    });
  });

  describe('fit="content" — a route under another route', () => {
    it('ignores the keyboard of the route presented over it, and takes it back once on top again', async () => {
      const keyboard = captureKeyboardEvents();
      const renderRoute = () => (
        <SheetScreen fit="content" keyboardAvoiding>
          <Text>Détails du produit</Text>
        </SheetScreen>
      );
      // « Vendre ce produit » pushed a Sale route over these details.
      mockFocused = false;
      const view = await render(renderRoute());
      const surface = () => view.getByTestId('sheet-screen-surface');

      await keyboard.show();
      expect(avoidsKeyboard(surface())).toBe(false);
      expect(keyboardTopGap(surface())).toBeUndefined();

      await keyboard.hide();
      mockFocused = true;
      await view.rerender(renderRoute());
      expect(avoidsKeyboard(surface())).toBe(true);
      await keyboard.show();
      expect(keyboardTopGap(surface())).toBeGreaterThan(0);
      keyboard.restore();
    });
  });

  describe('fit="fill" — the shell of a native workflow form sheet', () => {
    it('only draws the material inside the system sheet: no scrim, no removal guard of its own', async () => {
      mockGuard.prevent = undefined;
      const view = await render(
        <SheetScreen testID="workflow">
          <Text>Contenu</Text>
        </SheetScreen>,
      );

      expect(view.queryByTestId('sheet-screen-scrim')).toBeNull();
      expect(view.queryByTestId('bottom-sheet-scrim')).toBeNull();
      expect(StyleSheet.flatten(view.getByTestId('workflow').props.style).flex).toBe(1);
      expect(mockGuard.prevent).toBeUndefined();
    });

    it('stays put while a drawer presented from it holds the keyboard', async () => {
      const renderWorkflow = (drawerVisible: boolean) => (
        <SheetScreen keyboardAvoiding testID="workflow">
          <Text>Formulaire</Text>
          <BottomSheet backdropLabel="Fermer" keyboardAvoiding onClose={jest.fn()} visible={drawerVisible}>
            <Text>Tiroir</Text>
          </BottomSheet>
        </SheetScreen>
      );
      // The keyboard-avoiding body of the native shell pads itself (`padding`) only while on top.
      const bodyPadding = () =>
        StyleSheet.flatten(view.getByText('Formulaire').parent?.props.style).paddingBottom;
      const view = await render(renderWorkflow(false));
      expect(bodyPadding()).toBeDefined();

      await view.rerender(renderWorkflow(true));
      expect(bodyPadding()).toBeUndefined();

      await view.rerender(renderWorkflow(false));
      await settleSheetTransition();
      expect(bodyPadding()).toBeDefined();
    });
  });
});
