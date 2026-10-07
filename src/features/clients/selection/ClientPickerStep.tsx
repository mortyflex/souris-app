// BeautIzzy — Client picker step (shared Client selection)
//
// Search + virtualized list over the SHARED Client session source (the
// ACTIVE Clients of the Clientes directory — archived Clients are excluded
// upstream by the session), embedded by Appointment Creation and by the
// shared ClientPickerSheet. No display cap: FlatList
// virtualization keeps the list fast without limiting the business dataset.
// A restrained "Ajouter un client" action opens the shared creation sheet
// when the person is not in the directory. An optional `header` scrolls
// above the search inside the same list, so the step keeps ONE vertical
// scroll. Rows are a plain list: avatar + name, hairline separators.

import type { ReactNode } from 'react';
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
  /** Context shown above the search, inside the one scroll. */
  readonly header?: ReactNode;
}

export function ClientPickerStep({
  clients,
  query,
  selectedClientId,
  onChangeQuery,
  onSelectClient,
  onAddClientPress,
  header,
}: ClientPickerStepProps) {
  return (
    <FlatList
      data={clients}
      keyExtractor={(client) => client.id}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.listHeader}>
          {header && <View style={styles.header}>{header}</View>}
          <SearchField
            accessibilityLabel="Rechercher un client"
            onChangeText={onChangeQuery}
            placeholder="Rechercher un client"
            value={query}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter un client"
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
              Ajouter un client
            </AppText>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <AppText variant="stateTitle">Aucun client trouvé</AppText>
          <AppText variant="metadata" style={styles.emptyStateText}>
            Essayez un autre nom ou numéro, ou ajoutez un nouveau client.
          </AppText>
        </View>
      }
      ItemSeparatorComponent={RowSeparator}
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
      testID="client-picker-list"
    />
  );
}

function RowSeparator() {
  return <View style={styles.separator} />;
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
  header: { paddingBottom: spacing.md },
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
  separator: {
    backgroundColor: semanticColors.borderSubtle,
    height: StyleSheet.hairlineWidth,
    marginHorizontal: horizontalGutter,
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
