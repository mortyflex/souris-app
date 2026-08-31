// Souris — Client picker sheet (Appointment Editing)
//
// Focused client-selection sheet for reassigning the Appointment's Client.
// Reuses the shared ClientPickerStep (search + virtualized directory over the
// SAME Client source) and the shared ClientFormSheet for creating a client on
// the fly. Identity stays clientId-only.

import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { prepareClientDirectory } from '@/features/clients/directory/sort-clients';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import type { Client } from '@/domain/clients';
import {
  gutter,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { ClientPickerStep } from '../../creation/components/ClientPickerStep';

interface ClientPickerSheetProps {
  readonly visible: boolean;
  readonly selectedClientId: string | undefined;
  readonly onClose: () => void;
  readonly onSelectClient: (clientId: string) => void;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function ClientPickerSheet({
  visible,
  selectedClientId,
  onClose,
  onSelectClient,
}: ClientPickerSheetProps) {
  const { clients } = useClientSession();
  const [query, setQuery] = useState('');
  const [addClientVisible, setAddClientVisible] = useState(false);

  const visibleClients = useMemo(
    () => prepareClientDirectory(clients, query),
    [clients, query],
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
    <Modal
      animationType="slide"
      onRequestClose={close}
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel="Fermer le sélecteur de cliente"
          onPress={close}
          style={styles.backdrop}
        />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <AppText variant="sheetTitle" accessibilityRole="header" style={styles.title}>
              Choisir la cliente
            </AppText>
            <AppButton
              accessibilityLabel="Fermer"
              onPress={close}
              style={styles.closeButton}
              title="Fermer"
              variant="tertiary"
            />
          </View>
          <View style={styles.pickerBody}>
            <ClientPickerStep
              clients={visibleClients}
              query={query}
              selectedClientId={selectedClientId}
              onChangeQuery={setQuery}
              onSelectClient={select}
              onAddClientPress={() => setAddClientVisible(true)}
            />
          </View>
        </SafeAreaView>

        <ClientFormSheet
          mode="create"
          onClose={() => setAddClientVisible(false)}
          onSubmitted={handleClientCreated}
          visible={addClientVisible}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(25, 22, 63, 0.24)',
  },
  sheet: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderTopLeftRadius: radii.ios.sheet,
    borderTopRightRadius: radii.ios.sheet,
    height: '88%',
    paddingHorizontal: horizontalGutter,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: semanticColors.borderSubtle,
    borderRadius: radii.pill,
    height: 5,
    marginTop: spacing.sm,
    width: 40,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingTop: spacing.base,
  },
  title: { flexShrink: 1 },
  closeButton: { paddingHorizontal: spacing.md },
  pickerBody: { flex: 1 },
  pressed: { opacity: interaction.pressedOpacity },
});
