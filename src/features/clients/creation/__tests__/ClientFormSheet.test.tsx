// Souris — Client form sheet birthday boundary
//
// The birth date field behaves as a normal form row; the native picker
// presentation is tested at the component boundary (no pixel tests):
// empty/value display, open, confirm updates the draft only, cancel
// preserves the draft, clearing works, and create/edit share the same form.

import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import { ClientFormSheet } from '../ClientFormSheet';
import type { Client } from '@/domain/clients';

interface PickerProps {
  readonly onValueChange?: (event: unknown, date: Date) => void;
  readonly onDismiss?: () => void;
  readonly value: Date;
}

jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const store: { props: PickerProps | undefined } = { props: undefined };

  const DateTimePicker = (props: PickerProps) => {
    store.props = props;
    return React.createElement(View, { testID: 'mock-date-picker' });
  };

  return { DateTimePicker, __pickerStore: store };
});

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

const pickerModule = jest.requireMock('@expo/ui/community/datetime-picker') as {
  __pickerStore: { props: PickerProps | undefined };
};

const editableClient: Client = {
  id: 'client-agenda-lea',
  firstName: 'Léa',
  lastName: 'Martin',
  birthDate: '1994-10-12',
};

function SessionProbe() {
  const { getClientById } = useClientSession();
  const client = getClientById('client-agenda-lea');

  return <Text testID="session-birth-date">{client?.birthDate ?? ''}</Text>;
}

function renderCreateSheet() {
  return render(
    <ClientSessionProvider>
      <ClientFormSheet mode="create" onClose={() => {}} onSubmitted={() => {}} visible />
      <SessionProbe />
    </ClientSessionProvider>,
  );
}

function renderEditSheet() {
  return render(
    <ClientSessionProvider>
      <ClientFormSheet
        client={editableClient}
        mode="edit"
        onClose={() => {}}
        onSubmitted={() => {}}
        visible
      />
      <SessionProbe />
    </ClientSessionProvider>,
  );
}

async function openPicker(view: Awaited<ReturnType<typeof renderEditSheet>>) {
  await act(async () => {
    fireEvent.press(view.getByTestId('birth-date-field'));
  });
}

async function pickDate(date: Date) {
  await act(async () => {
    pickerModule.__pickerStore.props?.onValueChange?.({}, date);
  });
}

describe('ClientFormSheet birth date field', () => {
  beforeEach(() => {
    pickerModule.__pickerStore.props = undefined;
  });

  it('shows the placeholder row when empty (create mode)', async () => {
    const view = await renderCreateSheet();

    expect(view.getByText('Optionnel')).toBeTruthy();
    expect(view.queryByLabelText('Effacer la date de naissance')).toBeNull();
  });

  it('displays an existing birthDate as a friendly French date (edit mode)', async () => {
    const view = await renderEditSheet();

    expect(view.getByText('12 octobre 1994')).toBeTruthy();
  });

  it('opens a dedicated contained picker presentation on tap', async () => {
    const view = await renderEditSheet();

    await openPicker(view);

    expect(view.getByTestId('birthday-picker-title')).toBeTruthy();
    expect(view.getByText('Confirmer')).toBeTruthy();
    expect(view.getByText('Annuler')).toBeTruthy();
    expect(view.getByTestId('mock-date-picker')).toBeTruthy();
  });

  it('confirming updates the form draft only', async () => {
    const view = await renderEditSheet();

    await openPicker(view);
    await pickDate(new Date(1990, 3, 5));
    await act(async () => {
      fireEvent.press(view.getByText('Confirmer'));
    });

    // The field reflects the confirmed civil date…
    expect(view.getByText('5 avril 1990')).toBeTruthy();
    // …but the session client is untouched until the form is submitted.
    expect(view.getByTestId('session-birth-date').props.children).toBe('');
  });

  it('canceling preserves the draft', async () => {
    const view = await renderEditSheet();

    await openPicker(view);
    await pickDate(new Date(1985, 11, 25));
    await act(async () => {
      fireEvent.press(view.getByText('Annuler'));
    });

    expect(view.getByText('12 octobre 1994')).toBeTruthy();
    expect(view.queryByText('25 décembre 1985')).toBeNull();
  });

  it('clears an existing optional birthDate', async () => {
    const view = await renderEditSheet();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Effacer la date de naissance'));
    });

    expect(view.getByText('Optionnel')).toBeTruthy();
    expect(view.queryByLabelText('Effacer la date de naissance')).toBeNull();
  });

  it('works identically in create mode: pick, confirm, clear', async () => {
    const view = await renderCreateSheet();

    await openPicker(view);
    await pickDate(new Date(1990, 3, 5));
    await act(async () => {
      fireEvent.press(view.getByText('Confirmer'));
    });
    expect(view.getByText('5 avril 1990')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Effacer la date de naissance'));
    });
    expect(view.getByText('Optionnel')).toBeTruthy();
  });
});
