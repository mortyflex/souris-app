import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import { ClientPickerSheet } from '../ClientPickerSheet';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { DateTimePicker: () => React.createElement(View, null) };
});

function Host() {
  const { clients, archiveClient } = useClientSession();
  const [visible, setVisible] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>();
  const selected = clients.find((client) => client.id === selectedClientId);

  return (
    <>
      <Text testID="selected">{selected ? `${selected.id}:${selected.firstName}` : 'none'}</Text>
      <Text testID="client-count">{clients.length}</Text>
      <Pressable testID="open" onPress={() => setVisible(true)} />
      <Pressable testID="archive-camille" onPress={() => archiveClient('client-agenda-camille')} />
      <ClientPickerSheet
        onClose={() => setVisible(false)}
        onSelectClient={(clientId) => {
          setSelectedClientId(clientId);
          setVisible(false);
        }}
        selectedClientId={selectedClientId}
        visible={visible}
      />
    </>
  );
}

function renderPicker() {
  return render(
    <TestPersistenceProvider>
      <ClientSessionProvider>
      <Host />
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

describe('ClientPickerSheet (shared Client selection)', () => {
  it('searches the shared Client source and returns a stable clientId', async () => {
    const view = await renderPicker();

    await act(async () => fireEvent.press(view.getByTestId('open')));
    expect(view.getByText('Choisir la cliente')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'camille');
    });
    await act(async () => fireEvent.press(view.getByText('Camille Durand')));

    expect(view.getByTestId('selected').props.children).toBe('client-agenda-camille:Camille');
    expect(view.queryByText('Choisir la cliente')).toBeNull();
  });

  it('creates a Client on the fly and selects it without touching other Clients', async () => {
    const view = await renderPicker();
    const initialCount = Number(view.getByTestId('client-count').props.children);

    await act(async () => fireEvent.press(view.getByTestId('open')));
    await act(async () => fireEvent.press(view.getByTestId('add-client-picker')));
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prénom'), 'Nour');
    });
    await act(async () => fireEvent.press(view.getByText('Ajouter la cliente')));

    expect(view.getByTestId('selected').props.children).toMatch(/^client-\d+-\d+:Nour$/);
    expect(Number(view.getByTestId('client-count').props.children)).toBe(initialCount + 1);
  });

  it('closes without selecting from the explicit Fermer action', async () => {
    const view = await renderPicker();

    await act(async () => fireEvent.press(view.getByTestId('open')));
    await act(async () => fireEvent.press(view.getByLabelText('Fermer')));

    expect(view.getByTestId('selected').props.children).toBe('none');
    expect(view.queryByText('Choisir la cliente')).toBeNull();
  });

  it('never offers an archived Client, while the shared source still holds her', async () => {
    const view = await renderPicker();
    const initialCount = Number(view.getByTestId('client-count').props.children);

    await act(async () => fireEvent.press(view.getByTestId('archive-camille')));
    await act(async () => fireEvent.press(view.getByTestId('open')));
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'camille');
    });

    expect(view.queryByText('Camille Durand')).toBeNull();
    expect(view.getByText('Aucune cliente trouvée')).toBeTruthy();
    expect(Number(view.getByTestId('client-count').props.children)).toBe(initialCount);
  });
});
