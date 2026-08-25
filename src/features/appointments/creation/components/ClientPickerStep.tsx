// Souris — Client picker step (Appointment Creation)
//
// Search + virtualized list over the complete normalized client dataset.
// No display cap: FlatList virtualization keeps the list fast without
// limiting the business dataset.

import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import {
  colors,
  foregroundSoft,
  lavender,
  spacing,
} from '@/shared/ui/theme';
import type { NormalizedClient } from '@/features/clients/adapters/legacy-clients-adapter';

import { SearchField } from './SearchField';

const horizontalGutter = Platform.OS === 'android' ? 16 : 20;

interface ClientPickerStepProps {
  readonly clients: readonly NormalizedClient[];
  readonly query: string;
  readonly selectedClientId: string | undefined;
  readonly onChangeQuery: (query: string) => void;
  readonly onSelectClient: (clientId: string) => void;
}

export function ClientPickerStep({
  clients,
  query,
  selectedClientId,
  onChangeQuery,
  onSelectClient,
}: ClientPickerStepProps) {
  return (
    <FlatList
      data={clients}
      keyExtractor={(client) => client.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <SearchField
            accessibilityLabel="Rechercher une cliente"
            onChangeText={onChangeQuery}
            placeholder="Rechercher une cliente"
            value={query}
          />
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <AppText variant="stateTitle">Aucune cliente trouvée</AppText>
          <AppText variant="metadata" style={styles.emptyStateText}>
            Essayez un autre nom ou numéro.
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
                {item.firstName.charAt(0).toUpperCase()}
              </AppText>
            </View>
            <View style={styles.rowCopy}>
              <AppText variant="rowTitle" numberOfLines={1}>
                {getClientDisplayName(item.firstName, item.lastName)}
              </AppText>
              {item.phone ? (
                <AppText variant="metadata" numberOfLines={1}>
                  {item.phone}
                </AppText>
              ) : null}
            </View>
            {selected && (
              <AppText variant="control" style={styles.checkmark}>
                ✓
              </AppText>
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

export function getClientDisplayName(
  firstName: string,
  lastName: string | undefined,
): string {
  return `${firstName} ${lastName ?? ''}`.trim();
}

const styles = StyleSheet.create({
  stepList: { flex: 1 },
  listContent: { paddingBottom: spacing.lg },
  listHeader: {
    paddingHorizontal: horizontalGutter,
    paddingBottom: spacing.sm,
    paddingTop: spacing.lg,
  },
  clientRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginHorizontal: horizontalGutter,
    minHeight: 64,
    paddingVertical: spacing.sm,
  },
  selectedRow: { backgroundColor: lavender.lav025 },
  pressedRow: { opacity: 0.76 },
  avatar: {
    alignItems: 'center',
    backgroundColor: lavender.lav100,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 40,
  },
  selectedAvatar: { backgroundColor: lavender.lav200 },
  avatarText: { color: lavender.lav700 },
  rowCopy: { flex: 1, minWidth: 0 },
  checkmark: { color: lavender.lav700, paddingLeft: spacing.sm },
  emptyState: { alignItems: 'center', padding: spacing.xl },
  emptyStateText: { color: foregroundSoft, marginTop: spacing.sm },
});
