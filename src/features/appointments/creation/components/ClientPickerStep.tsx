// Souris — Client picker step (Appointment Creation)
//
// Search + virtualized list over the SHARED Client session source (same
// clients as the Clientes directory). No display cap: FlatList
// virtualization keeps the list fast without limiting the business dataset.
// A restrained "Ajouter une cliente" action opens the shared creation sheet
// when the person is not in the directory.

import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { getClientDisplayName, getClientInitial, type Client } from '@/domain/clients';
import { AppText } from '@/shared/ui/AppText';
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';
import { SearchField } from '@/shared/ui/SearchField';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface ClientPickerStepProps {
  readonly clients: readonly Client[];
  readonly query: string;
  readonly selectedClientId: string | undefined;
  readonly onChangeQuery: (query: string) => void;
  readonly onSelectClient: (clientId: string) => void;
  readonly onAddClientPress: () => void;
}

export function ClientPickerStep({
  clients,
  query,
  selectedClientId,
  onChangeQuery,
  onSelectClient,
  onAddClientPress,
}: ClientPickerStepProps) {
  return (
    <FlatList
      data={clients}
      keyExtractor={(client) => client.id}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <SearchField
            accessibilityLabel="Rechercher une cliente"
            onChangeText={onChangeQuery}
            placeholder="Rechercher une cliente"
            value={query}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter une cliente"
            hitSlop={spacing.sm}
            onPress={onAddClientPress}
            style={({ pressed }) => [styles.addAction, pressed && styles.addActionPressed]}
            testID="add-client-picker"
          >
            <SymbolView
              name={{ ios: 'plus.circle.fill', android: 'add_circle' }}
              size={15}
              tintColor={semanticColors.accent}
            />
            <AppText variant="metadata" style={styles.addActionText}>
              Ajouter une cliente
            </AppText>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <AppText variant="stateTitle">Aucune cliente trouvée</AppText>
          <AppText variant="metadata" style={styles.emptyStateText}>
            Essayez un autre nom ou numéro, ou ajoutez une nouvelle cliente.
          </AppText>
        </View>
      }
      renderItem={({ item }) => {
        const selected = item.id === selectedClientId;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelectClient(item.id)}
            style={({ pressed }) => [
              styles.clientRow,
              selected && styles.selectedRow,
              pressed && styles.pressedRow,
            ]}
          >
            <View style={[styles.avatar, selected && styles.selectedAvatar]}>
              <AppText variant="rowTitle" style={styles.avatarText}>
                {getClientInitial(item)}
              </AppText>
            </View>
            <View style={styles.rowCopy}>
              <AppText variant="rowTitle" numberOfLines={1}>
                {getClientDisplayName(item)}
              </AppText>
              {item.phone ? (
                <AppText variant="metadata" numberOfLines={1} style={styles.phoneLine}>
                  {item.phone}
                </AppText>
              ) : null}
            </View>
            {selected && (
              <SymbolView
                name={{ ios: 'checkmark', android: 'check' }}
                size={16}
                tintColor={semanticColors.accent}
              />
            )}
          </Pressable>
        );
      }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      style={styles.stepList}
    />
  );
}

const styles = StyleSheet.create({
  stepList: { flex: 1 },
  listContent: { paddingBottom: spacing.lg },
  listHeader: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.lg,
  },
  addAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.small,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  addActionPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  addActionText: { color: semanticColors.accent },
  clientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginHorizontal: horizontalGutter,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectedRow: {
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.medium,
  },
  pressedRow: {
    backgroundColor: semanticColors.surface,
    borderRadius: radii.medium,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 36,
  },
  selectedAvatar: { backgroundColor: semanticColors.borderLavender },
  avatarText: { color: semanticColors.accent },
  rowCopy: { flex: 1, minWidth: 0 },
  phoneLine: { color: foregroundSoft },
  emptyState: { alignItems: 'center', padding: spacing.xl },
  emptyStateText: {
    color: foregroundSoft,
    marginTop: spacing.sm,
    paddingHorizontal: horizontalGutter,
    textAlign: 'center',
  },
});
