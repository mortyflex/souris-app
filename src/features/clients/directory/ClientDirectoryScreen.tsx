// Souris — Client directory (Clientes tab)
//
// The complete Client directory: search + SectionList over the shared Client
// session source, split into Actives / Archivées (archived Clients stay
// discoverable, visually secondary, never error-like). With no archived
// Client the list is the plain « Actives » section. With at least one, the
// shared SegmentedControl — the Produits Actifs / Inactifs switcher (the
// Services / Techniques look, counts of the session's whole collections) —
// shows one group at a time, without a heading repeating the tab, and search
// narrows only the selected group. The grid — gutter, search, tabs,
// section header, row rhythm, hairline separators — is the Produits one
// (shared directoryListStyles), so switching tabs never moves it. Rows stay clean and
// light (ClientAvatar thumbnail: her photo, or her initials, in the same
// rounded square as the Produits list thumbnail, resolved per mounted row
// from the shared media cache; strong name, soft phone) — no per-client cards, no
// fake metrics. Without tabs, « Actives » opens with the shared SectionHeader
// of the Produits list (count pill of the rows it heads: search narrows it,
// exactly like « Actifs »); the screen title is identity only.
// Every row ends with the Produits NavigationChevron (thumbnail → copy →
// chevron); the whole row is the one action. Birthdays and notes never appear
// in the list: the Client Profile shows them. The
// shared floating + opens the shared creation sheet, the single way to add a
// Client. The header follows the Produits reference:
// large title, no eyebrow, no count, search right below (MainScreenHeader).

import { useMemo, useState } from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';
import { useRouter } from 'expo-router';

import {
  getClientDisplayName,
  isClientArchived,
  type Client,
} from '@/domain/clients';
import { ClientAvatar } from '@/features/clients/avatar/ClientAvatar';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import {
  buildClientDirectorySections,
  type ClientDirectoryGroup,
  type ClientDirectorySection,
} from '@/features/clients/directory/directory-sections';
import { useClientPhotoUri } from '@/features/clients/photo/use-client-photo-uri';
import { ARCHIVED_CLIENT_LABEL } from '@/features/clients/presentation';
import { AppText } from '@/shared/ui/AppText';
import { directoryListStyles } from '@/shared/ui/directory-list';
import { FloatingCreateButton } from '@/shared/ui/FloatingCreateButton';
import { MainScreenHeader } from '@/shared/ui/MainScreenHeader';
import { NavigationChevron } from '@/shared/ui/NavigationChevron';
import { Screen } from '@/shared/ui/Screen';
import { SearchField } from '@/shared/ui/SearchField';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import { foregroundSoft, listThumbnail, semanticColors } from '@/shared/ui/theme';

export function ClientDirectoryScreen() {
  const router = useRouter();
  const { clients, activeClients, archivedClients } = useClientSession();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<ClientDirectoryGroup>('ACTIVE');
  const [addClientVisible, setAddClientVisible] = useState(false);

  const showsTabs = archivedClients.length > 0;
  // No archived Client → no tab to be on: back to Actives, so the next
  // archive reopens on Actives (adjusted while rendering).
  if (!showsTabs && group !== 'ACTIVE') setGroup('ACTIVE');
  const shownGroup: ClientDirectoryGroup = showsTabs ? group : 'ACTIVE';

  const searching = query.trim().length > 0;
  const sections: readonly SectionListData<Client, ClientDirectorySection>[] = useMemo(
    () =>
      buildClientDirectorySections(clients, query).filter((section) => section.key === shownGroup),
    [clients, query, shownGroup],
  );
  // Tab counts are the session's whole collections, never the search results.
  const tabOptions: readonly SegmentedControlOption<ClientDirectoryGroup>[] = [
    {
      value: 'ACTIVE',
      label: 'Actifs',
      count: activeClients.length,
      selectedColor: semanticColors.accent,
      testID: 'client-tab-active',
    },
    {
      value: 'ARCHIVED',
      label: 'Archivés',
      count: archivedClients.length,
      selectedColor: semanticColors.accent,
      testID: 'client-tab-archived',
    },
  ];

  const openProfile = (clientId: string) => {
    router.push({
      pathname: '/clients/[clientId]',
      params: { clientId },
    });
  };

  return (
    <Screen
      header={<MainScreenHeader testID="clients-header" title="Clientèle" watermark="clients" />}
    >
      <View style={directoryListStyles.searchArea}>
        <SearchField
          accessibilityLabel="Rechercher un client"
          onChangeText={setQuery}
          placeholder="Rechercher un client"
          placement="page"
          testID="client-directory-search"
          value={query}
        />
      </View>

      {showsTabs && (
        <View style={directoryListStyles.tabsArea}>
          <SegmentedControl
            onChange={setGroup}
            options={tabOptions}
            stretch
            testID="client-tabs"
            value={shownGroup}
          />
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(client) => client.id}
        // The native tab bar overlays the page: the system bottom inset keeps
        // the last row scrollable above it (bottomClearance then clears the
        // floating +).
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        // The Produits section header: the count is the rows of the group.
        // With tabs, the selected tab already names the list.
        renderSectionHeader={({ section }) =>
          showsTabs ? null : (
            <SectionHeader
              count={section.data.length}
              style={directoryListStyles.sectionHeader}
              testID={`client-group-${section.key.toLowerCase()}`}
              title={section.title}
            />
          )
        }
        ListEmptyComponent={
          <View style={directoryListStyles.emptyState}>
            <AppText variant="stateTitle">
              {searching
                ? 'Aucun client trouvé'
                : clients.length > 0
                  ? 'Aucun client actif'
                  : 'Aucun client'}
            </AppText>
            <AppText variant="metadata" style={directoryListStyles.emptyStateText}>
              {searching
                ? 'Essayez un autre nom ou numéro.'
                : 'Ajoutez votre premier client pour commencer.'}
            </AppText>
          </View>
        }
        renderItem={({ item }) => (
          <ClientRow client={item} onPress={() => openProfile(item.id)} />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={directoryListStyles.listContent}
      />

      <FloatingCreateButton
        accessibilityLabel="Ajouter un client"
        onPress={() => setAddClientVisible(true)}
        testID="add-client-directory"
      />

      <ClientFormSheet
        mode="create"
        onClose={() => setAddClientVisible(false)}
        onSubmitted={() => setAddClientVisible(false)}
        visible={addClientVisible}
      />
    </Screen>
  );
}

interface ClientRowProps {
  readonly client: Client;
  readonly onPress: () => void;
}

function ClientRow({ client, onPress }: ClientRowProps) {
  const archived = isClientArchived(client);
  // Only this mounted row resolves its own photo (cache first, else one
  // download); undefined meanwhile → the initials hold the same frame.
  const photoUri = useClientPhotoUri(client.photoPath);
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
      style={({ pressed }) => [directoryListStyles.row, pressed && directoryListStyles.rowPressed]}
      testID={`client-row-${client.id}`}
    >
      {/* The row already speaks for the Client: the avatar stays silent. */}
      <ClientAvatar
        accessible={false}
        client={client}
        photoUri={photoUri}
        shape="thumbnail"
        size={listThumbnail.size}
        testID={`client-directory-avatar-${client.id}`}
        tone={archived ? 'muted' : 'default'}
      />
      <View style={directoryListStyles.rowCopy}>
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
      <NavigationChevron testID={`client-directory-chevron-${client.id}`} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clientName: { color: semanticColors.foreground },
  archivedClientName: { color: foregroundSoft },
  phoneLine: { color: foregroundSoft },
});
