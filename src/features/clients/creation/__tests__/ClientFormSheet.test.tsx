// Souris — Client form sheet: canonical shell, keyboard rule, birthday wheel
//
// The sheet opens with the keyboard closed (no field auto-focuses), the
// birthday is a day + month wheel (no year, no keyboard), impossible dates
// resolve safely, and the value survives save → reopen.

import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import { ClientFormSheet } from '../ClientFormSheet';
import { WHEEL_ROW_HEIGHT } from '../components/BirthdayWheelPicker';
import type { Client } from '@/domain/clients';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    SymbolView: () => React.createElement(React.Fragment, null),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const selectionHaptic = jest.spyOn(haptics, 'selection').mockImplementation();

const editableClient: Client = {
  id: 'client-agenda-lea',
  firstName: 'Léa',
  lastName: 'Martin',
  birthday: { month: 10, day: 12 },
};

function SessionProbe() {
  const { getClientById } = useClientSession();
  const client = getClientById('client-agenda-lea');

  return (
    <Text testID="session-birthday">
      {client?.birthday ? `${client.birthday.month}-${client.birthday.day}` : ''}
    </Text>
  );
}

function renderSheet(mode: 'create' | 'edit', onSubmitted = () => {}) {
  return render(
    <TestPersistenceProvider>
      <ClientSessionProvider>
        <ClientFormSheet
          client={mode === 'edit' ? editableClient : undefined}
          mode={mode}
          onClose={() => {}}
          onSubmitted={onSubmitted}
          visible
        />
        <SessionProbe />
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

type Rendered = Awaited<ReturnType<typeof render>>;

async function press(view: Rendered, testID: string) {
  await act(async () => fireEvent.press(view.getByTestId(testID)));
}

/** Scrolls a wheel column so that the row at `index` settles in the center. */
async function settleWheel(view: Rendered, testID: string, index: number) {
  await act(async () => {
    fireEvent(view.getByTestId(testID), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { y: index * WHEEL_ROW_HEIGHT } },
    });
  });
}

function wheelValue(view: Rendered, testID: string): string {
  return view.getByTestId(testID).props.accessibilityValue.text as string;
}

function wheelRowCount(view: Rendered, testID: string): number {
  return view.getAllByTestId(new RegExp(`^${testID}-row-\\d+$`), { includeHiddenElements: true }).length;
}

describe('ClientFormSheet', () => {
  beforeEach(() => selectionHaptic.mockClear());

  it('uses the canonical sheet shell and never auto-focuses a field', async () => {
    const view = await renderSheet('create');

    expect(view.getByText('NOUVELLE CLIENTE')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Ajouter une cliente' })).toBeTruthy();
    expect(view.getByLabelText('Fermer')).toBeTruthy();
    expect(view.getByTestId('bottom-sheet-scrim')).toBeTruthy();

    for (const label of ['Prénom', 'Nom', 'Téléphone', 'Email']) {
      expect(view.getByLabelText(label).props.autoFocus).toBeFalsy();
    }
    // Pan-to-dismiss stays off: scrolling the form never abandons the draft.
    const shouldSet = view.getByTestId('bottom-sheet-drag-zone').props.onMoveShouldSetResponder as (
      event: unknown,
    ) => boolean;
    expect(
      shouldSet({
        nativeEvent: { touches: [{ pageX: 0, pageY: 0 }], changedTouches: [], identifier: 1 },
        touchHistory: { touchBank: [], numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: 0 },
      }),
    ).toBe(false);
  });

  it('anchors the submit action in the shared action bar for create and edit alike', async () => {
    const create = await renderSheet('create');
    expect(create.getByTestId('client-form-actions')).toBeTruthy();
    expect(create.getByTestId('submit-client')).toBeTruthy();
    expect(create.getByText('Ajouter la cliente')).toBeTruthy();

    const edit = await renderSheet('edit');
    expect(edit.getByTestId('client-form-actions')).toBeTruthy();
    expect(edit.getByTestId('submit-client')).toBeTruthy();
    expect(edit.getByText('Enregistrer les modifications')).toBeTruthy();
  });

  it('shows the birthday placeholder in create mode and keeps the wheel closed', async () => {
    const view = await renderSheet('create');

    expect(view.getByText('Optionnel')).toBeTruthy();
    expect(view.queryByTestId('birthday-wheel')).toBeNull();
    expect(view.queryByTestId('birthday-clear')).toBeNull();
  });

  it('displays an existing birthday as day + month, never a year (edit mode)', async () => {
    const view = await renderSheet('edit');

    expect(view.getByText('12 octobre')).toBeTruthy();
    expect(view.queryByText(/19\d\d|20\d\d/)).toBeNull();
  });

  it('opens a day + month wheel preselected on the existing birthday, with no year column', async () => {
    const view = await renderSheet('edit');

    await press(view, 'birthday-field');

    expect(view.getByTestId('birthday-wheel')).toBeTruthy();
    expect(view.getByText('Jour')).toBeTruthy();
    expect(view.getByText('Mois')).toBeTruthy();
    expect(view.queryByText(/Année/)).toBeNull();
    expect(wheelValue(view, 'birthday-wheel-day')).toBe('12');
    expect(wheelValue(view, 'birthday-wheel-month')).toBe('octobre');
    expect(wheelRowCount(view, 'birthday-wheel-day')).toBe(31);
    expect(wheelRowCount(view, 'birthday-wheel-month')).toBe(12);
    expect(view.queryByLabelText(/Prénom/)?.props.autoFocus).toBeFalsy();
    // The wheel starts centered on the saved value, with no keyboard.
    expect(view.getByTestId('birthday-wheel-day').props.contentOffset).toEqual({ x: 0, y: 11 * WHEEL_ROW_HEIGHT });
    expect(view.getByTestId('birthday-wheel-month').props.contentOffset).toEqual({ x: 0, y: 9 * WHEEL_ROW_HEIGHT });
  });

  it('builds the wheels from plain ScrollViews: no VirtualizedList nested in the form scroll', async () => {
    const consoleError = jest.spyOn(console, 'error');
    const view = await renderSheet('edit');

    await press(view, 'birthday-field');

    // React Native reports a VirtualizedList nested in a ScrollView through
    // console.error; the wheels are plain snapping ScrollViews, so it stays silent.
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/VirtualizedLists should never be nested/);
    for (const testID of ['birthday-wheel-day', 'birthday-wheel-month']) {
      const wheel = view.getByTestId(testID);
      expect(wheel.props.renderItem).toBeUndefined();
      expect(wheel.props.data).toBeUndefined();
      expect(wheel.props.snapToInterval).toBe(WHEEL_ROW_HEIGHT);
      expect(wheel.props.decelerationRate).toBe('fast');
      expect(wheel.props.showsVerticalScrollIndicator).toBe(false);
    }
    consoleError.mockRestore();
  });

  it('selects a day + month by scrolling, committing to the draft only', async () => {
    const view = await renderSheet('create');

    await press(view, 'birthday-field');
    // Month wheel: index 6 = juillet. Day wheel: index 20 = 21.
    await settleWheel(view, 'birthday-wheel-month', 6);
    await settleWheel(view, 'birthday-wheel-day', 20);

    expect(view.getByTestId('birthday-value').props.children).toBe('21 juillet');
    expect(wheelValue(view, 'birthday-wheel-day')).toBe('21');
    expect(wheelValue(view, 'birthday-wheel-month')).toBe('juillet');
    expect(view.getByTestId('session-birthday').props.children).toBe('');
  });

  it('adapts the valid days to the month: February offers 29 and a shorter month resolves the day', async () => {
    const view = await renderSheet('create');

    await press(view, 'birthday-field');
    await settleWheel(view, 'birthday-wheel-month', 1);
    expect(wheelRowCount(view, 'birthday-wheel-day')).toBe(29);
    await settleWheel(view, 'birthday-wheel-day', 28);
    expect(view.getByTestId('birthday-value').props.children).toBe('29 février');

    await settleWheel(view, 'birthday-wheel-month', 0);
    await settleWheel(view, 'birthday-wheel-day', 30);
    expect(view.getByTestId('birthday-value').props.children).toBe('31 janvier');

    // April has 30 days: the 31st resolves to the 30th, never an impossible date.
    await settleWheel(view, 'birthday-wheel-month', 3);
    expect(view.getByTestId('birthday-value').props.children).toBe('30 avril');
    expect(wheelRowCount(view, 'birthday-wheel-day')).toBe(30);
    expect(wheelValue(view, 'birthday-wheel-day')).toBe('30');
  });

  it('gives one selection haptic per committed row change, none while scrolling or for a clamp', async () => {
    const view = await renderSheet('edit');

    await press(view, 'birthday-field');
    const day = view.getByTestId('birthday-wheel-day');
    for (const y of [12 * WHEEL_ROW_HEIGHT + 4, 12 * WHEEL_ROW_HEIGHT + 12, 13 * WHEEL_ROW_HEIGHT]) {
      await act(async () => {
        fireEvent.scroll(day, { nativeEvent: { contentOffset: { y } } });
      });
    }
    expect(selectionHaptic).not.toHaveBeenCalled();

    // One settle on a new row → one haptic; settling on the same row → none.
    await settleWheel(view, 'birthday-wheel-day', 13);
    await settleWheel(view, 'birthday-wheel-day', 13);
    expect(selectionHaptic).toHaveBeenCalledTimes(1);

    // 14 octobre → février clamps 14? No: 14 exists in February; use the 31st.
    await settleWheel(view, 'birthday-wheel-day', 30);
    expect(selectionHaptic).toHaveBeenCalledTimes(2);
    await settleWheel(view, 'birthday-wheel-month', 1);
    // The month change is the only haptic; the 31 → 29 correction adds none.
    expect(selectionHaptic).toHaveBeenCalledTimes(3);
    expect(view.getByTestId('birthday-value').props.children).toBe('29 février');
  });

  it('clears an existing birthday', async () => {
    const view = await renderSheet('edit');

    await press(view, 'birthday-field');
    await press(view, 'birthday-clear');

    expect(view.getByText('Optionnel')).toBeTruthy();
    expect(view.queryByTestId('birthday-clear')).toBeNull();
  });

  it('persists the chosen birthday and hydrates it back into the wheel', async () => {
    const submitted = jest.fn();
    const view = await renderSheet('edit', submitted);

    await press(view, 'birthday-field');
    await settleWheel(view, 'birthday-wheel-month', 1);
    await settleWheel(view, 'birthday-wheel-day', 28);
    await press(view, 'submit-client');

    expect(view.getByTestId('session-birthday').props.children).toBe('2-29');
    expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ birthday: { month: 2, day: 29 } }));

    const reopened = await renderSheet('edit');
    expect(reopened.getByText('12 octobre')).toBeTruthy();
    await press(reopened, 'birthday-field');
    expect(wheelValue(reopened, 'birthday-wheel-day')).toBe('12');
    expect(wheelValue(reopened, 'birthday-wheel-month')).toBe('octobre');
  });

  it('keeps create and edit behavior otherwise unchanged: first name required, edit keeps the id', async () => {
    const submitted = jest.fn();
    const view = await renderSheet('edit', submitted);

    await act(async () => fireEvent.changeText(view.getByLabelText('Prénom'), ''));
    expect(view.getByTestId('submit-client').props.accessibilityState).toMatchObject({ disabled: true });

    await act(async () => fireEvent.changeText(view.getByLabelText('Prénom'), 'Léana'));
    await press(view, 'submit-client');
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'client-agenda-lea', firstName: 'Léana', birthday: { month: 10, day: 12 } }),
    );
  });
});
