// Souris — Client picker sheet (shared Client selection)
//
// The ONE bottom-sheet Client picker used wherever a screen needs to choose or
// reassign a Client after it is open: Appointment Editing and Sale creation.
// Composes ClientPickerStep (search + virtualized directory over the SAME
// Client source, ACTIVE Clients only — archived Clients are never offered
// for a new action) and the shared ClientFormSheet for creating a client on
// the fly. Identity stays clientId-only; selecting never mutates the Client.
//
// Scrolling is the primary interaction here, so pan-to-dismiss is disabled:
// the list scrolls freely and the sheet closes only through « Fermer ».

import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { prepareClientDirectory } from '@/features/clients/directory/sort-clients';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import type { Client } from '@/domain/clients';

import { ClientPickerStep } from './ClientPickerStep';

interface ClientPickerSheetProps {
  readonly visible: boolean;
  readonly selectedClientId: string | undefined;
  readonly onClose: () => void;
  readonly onSelectClient: (clientId: string) => void;
}

export function ClientPickerSheet({
  visible,
  selectedClientId,
  onClose,
  onSelectClient,
}: ClientPickerSheetProps) {
  const { activeClients } = useClientSession();
  const [query, setQuery] = useState('');
  const [addClientVisible, setAddClientVisible] = useState(false);

  const visibleClients = useMemo(
    () => prepareClientDirectory(activeClients, query),
    [activeClients, query],
  );

  const select = (clientId: string) => {
    setQuery('');
    onSelectClient(clientId);
  };

  const handleClientCreated = (client: Client) => {
    setAddClientVisible(false);
    select(client.id);
  };

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <BottomSheet
      backdropLabel="Fermer le sélecteur de cliente"
      contentStyle={styles.body}
      dismissOnPanDown={false}
      header={
        <SheetHeader
          action={{ label: 'Fermer', onPress: close }}
          eyebrow="CLIENTE"
          title="Choisir la cliente"
        />
      }
      height="88%"
      onClose={close}
      padded={false}
      testID="client-picker-sheet"
      visible={visible}
    >
      <View style={styles.body}>
        <ClientPickerStep
          clients={visibleClients}
          query={query}
          selectedClientId={selectedClientId}
          onChangeQuery={setQuery}
          onSelectClient={select}
          onAddClientPress={() => setAddClientVisible(true)}
        />
      </View>

      <ClientFormSheet
        mode="create"
        onClose={() => setAddClientVisible(false)}
        onSubmitted={handleClientCreated}
        visible={addClientVisible}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
});
