import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { SheetScreen } from '../SheetScreen';
import { settleSheetTransition } from '../testing/sheet-transitions';
import { sheet } from '../theme';

const mockBack = jest.fn();
const mockDispatch = jest.fn();
// The latest registration of the removal guard: [prevent, onHeld].
const mockGuard: { prevent?: boolean; onHeld?: (event: { data: { action: object } }) => void } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useNavigation: () => ({ dispatch: mockDispatch }),
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
  });
});
