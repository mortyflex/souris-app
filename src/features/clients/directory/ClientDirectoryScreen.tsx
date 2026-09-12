// Souris — Client directory (Clientes tab)
//
// The complete Client directory: search + SectionList over the shared Client
// session source, grouped into Actives / Archivées (archived Clients stay
// discoverable, visually secondary, never error-like). Rows stay clean and
// light (initial avatar, strong name, soft phone) — no per-client cards, no
// fake metrics. The shared creation sheet is the single way to add a Client.

import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import {
  getClientDisplayName,
  getClientInitial,
  isClientArchived,
  type Client,
} from '@/domain/clients';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import {
  buildClientDirectorySections,
  type ClientDirectorySection,
} from '@/features/clients/directory/directory-sections';
import { ARCHIVED_CLIENT_LABEL } from '@/features/clients/presentation';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SearchField } from '@/shared/ui/SearchField';
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function ClientDirectoryScreen() {
  const router = useRouter();
  const { clients } = useClientSession();
  const [query, setQuery] = useState('');
  const [addClientVisible, setAddClientVisible] = useState(false);

  const sections: readonly SectionListData<Client, ClientDirectorySection>[] = useMemo(
    () => buildClientDirectorySections(clients, query),
    [clients, query],
  );

  const openProfile = (clientId: string) => {
    router.push({
      pathname: '/clients/[clientId]',
      params: { clientId },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="eyebrow" style={styles.eyebrow}>
          CLIENTES
        </AppText>
        <View style={styles.titleRow}>
          <AppText variant="screenTitle" accessibilityRole="header" style={styles.title}>
            Clientes
          </AppText>
          <AppButton
            accessibilityLabel="Ajouter une cliente"
            onPress={() => setAddClientVisible(true)}
            style={styles.addButton}
            testID="add-client-directory"
            title="Ajouter une cliente"
            variant="tertiary"
          />
        </View>
      </View>

      <View style={styles.searchWrap}>
        <SearchField
          accessibilityLabel="Rechercher une cliente"
          onChangeText={setQuery}
          placeholder="Rechercher une cliente"
          value={query}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(client) => client.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <AppText
              variant="eyebrow"
              style={section.key === 'ARCHIVED' ? styles.archivedGroupLabel : styles.groupLabel}
              testID={`client-group-${section.key.toLowerCase()}`}
            >
              {section.title}
            </AppText>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <AppText variant="stateTitle">
              {query.trim().length > 0 ? 'Aucune cliente trouvée' : 'Aucune cliente'}
            </AppText>
            <AppText variant="metadata" style={styles.emptyStateText}>
              {query.trim().length > 0
                ? 'Essayez un autre nom ou numéro.'
                : 'Ajoutez votre première cliente pour commencer.'}
            </AppText>
          </View>
        }
        renderItem={({ item }) => (
          <ClientRow client={item} onPress={() => openProfile(item.id)} />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      <ClientFormSheet
        mode="create"
        onClose={() => setAddClientVisible(false)}
        onSubmitted={() => setAddClientVisible(false)}
        visible={addClientVisible}
      />
    </SafeAreaView>
  );
}

interface ClientRowProps {
  readonly client: Client;
  readonly onPress: () => void;
}

function ClientRow({ client, onPress }: ClientRowProps) {
  const archived = isClientArchived(client);
  const metadata = archived
    ? [ARCHIVED_CLIENT_LABEL, client.phone].filter(Boolean).join(' · ')
    : client.phone;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir la fiche de ${getClientDisplayName(client)}${
        archived ? `, ${ARCHIVED_CLIENT_LABEL.toLowerCase()}` : ''
      }`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}
      testID={`client-row-${client.id}`}
    >
      <View style={[styles.avatar, archived && styles.archivedAvatar]}>
        <AppText variant="rowTitle" style={archived ? styles.archivedAvatarText : styles.avatarText}>
          {getClientInitial(client)}
        </AppText>
      </View>
      <View style={styles.rowCopy}>
        <AppText
          variant="rowTitle"
          numberOfLines={1}
          style={archived ? styles.archivedClientName : styles.clientName}
        >
          {getClientDisplayName(client)}
        </AppText>
        {metadata ? (
          <AppText variant="metadata" numberOfLines={1} style={styles.phoneLine}>
            {metadata}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  header: {
    gap: spacing.xs,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  eyebrow: { color: semanticColors.accent },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: { color: semanticColors.foreground, flexShrink: 1 },
  addButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  searchWrap: {
    paddingBottom: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.md,
  },
  listContent: { paddingBottom: spacing.xl },
  sectionHeader: {
    paddingBottom: spacing.xs,
    paddingHorizontal: horizontalGutter + spacing.md,
    paddingTop: spacing.md,
  },
  groupLabel: { color: foregroundSoft },
  archivedGroupLabel: { color: semanticColors.foregroundMuted },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    marginHorizontal: horizontalGutter,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressedRow: {
    backgroundColor: semanticColors.surface,
    borderRadius: radii.medium,
    transform: [{ scale: interaction.cardPressedScale }],
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
  archivedAvatar: { backgroundColor: semanticColors.surface },
  avatarText: { color: semanticColors.accent },
  archivedAvatarText: { color: foregroundSoft },
  rowCopy: { flex: 1, minWidth: 0 },
  clientName: { color: semanticColors.foreground },
  archivedClientName: { color: foregroundSoft },
  phoneLine: { color: foregroundSoft },
  emptyState: { alignItems: 'center', padding: spacing.xl },
  emptyStateText: { color: foregroundSoft, marginTop: spacing.sm, textAlign: 'center' },
});
