// Souris — Client directory (Clientes tab)
//
// The complete Client directory: search + SectionList over the shared Client
// session source, split into Actives / Archivées (archived Clients stay
// discoverable, visually secondary, never error-like). With no archived
// Client the list is the plain « Actives » section. With at least one, the
// shared SegmentedControl — the Produits Actifs / Inactifs switcher (the
// Services / Techniques look, counts of the session's whole collections) —
// shows one group at a time, without a heading repeating the tab, and search
// narrows only the selected group. Rows stay clean and
// light (ClientAvatar thumbnail: her photo, or her initials, in the same
// rounded square as the Produits list thumbnail, resolved per mounted row
// from the shared media cache; strong name, soft phone) — no per-client cards, no
// fake metrics. Without tabs, « Actives » opens with the shared SectionHeader
// of the Produits list (count pill of the rows it heads: search narrows it,
// exactly like « Actifs »); the screen title is identity only.
// A recorded birthday shows as a compact trailing « 21 sept. »
// with a cake glyph: secondary, never a placeholder when absent, and the row
// keeps its height either way. When TODAY is her birthday the same slot
// becomes a static blush « Aujourd'hui » badge (cake glyph + word, never
// colour alone, never animated: the list stays light to scroll), and the row
// says so to assistive technology. Notes never appear in the list. The
// shared floating + opens the shared creation sheet, the single way to add a
// Client. The header follows the Produits reference:
// large title, no eyebrow, no count, search right below (MainScreenHeader).

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
import { SymbolView } from 'expo-symbols';

import {
  formatClientBirthday,
  formatClientBirthdayCompact,
  getClientDisplayName,
  isClientArchived,
  isClientBirthdayOnDate,
  type Client,
} from '@/domain/clients';
import { ClientAvatar } from '@/features/clients/avatar/ClientAvatar';
import { DIRECTORY_BIRTHDAY_TODAY_LABEL } from '@/features/clients/birthday/presentation';
import { useToday } from '@/features/clients/birthday/use-today';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import {
  buildClientDirectorySections,
  type ClientDirectoryGroup,
  type ClientDirectorySection,
} from '@/features/clients/directory/directory-sections';
import { useClientPhotoUri } from '@/features/clients/photo/use-client-photo-uri';
import { ARCHIVED_CLIENT_LABEL } from '@/features/clients/presentation';
import { birthdayIcon } from '@/shared/icons/birthday-icon';
import { AppText } from '@/shared/ui/AppText';
import { FloatingCreateButton } from '@/shared/ui/FloatingCreateButton';
import { MainScreenHeader } from '@/shared/ui/MainScreenHeader';
import { SearchField } from '@/shared/ui/SearchField';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import {
  bottomClearance,
  foregroundSoft,
  gutter,
  interaction,
  listThumbnail,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function ClientDirectoryScreen() {
  const router = useRouter();
  const { clients, activeClients, archivedClients } = useClientSession();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<ClientDirectoryGroup>('ACTIVE');
  const [addClientVisible, setAddClientVisible] = useState(false);
  const today = useToday();

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
      label: 'Actives',
      count: activeClients.length,
      selectedColor: semanticColors.accent,
      testID: 'client-tab-active',
    },
    {
      value: 'ARCHIVED',
      label: 'Archivées',
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <MainScreenHeader
        testID="clients-header"
        title="Clientes"
        watermark="clients"
      />

      <View style={styles.searchWrap}>
        <SearchField
          accessibilityLabel="Rechercher une cliente"
          onChangeText={setQuery}
          placeholder="Rechercher une cliente"
          value={query}
        />
      </View>

      {showsTabs && (
        <View style={styles.tabsWrap}>
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
              style={styles.sectionHeader}
              testID={`client-group-${section.key.toLowerCase()}`}
              title={section.title}
            />
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <AppText variant="stateTitle">
              {searching
                ? 'Aucune cliente trouvée'
                : clients.length > 0
                  ? 'Aucune cliente active'
                  : 'Aucune cliente'}
            </AppText>
            <AppText variant="metadata" style={styles.emptyStateText}>
              {searching
                ? 'Essayez un autre nom ou numéro.'
                : 'Ajoutez votre première cliente pour commencer.'}
            </AppText>
          </View>
        }
        renderItem={({ item }) => (
          <ClientRow client={item} onPress={() => openProfile(item.id)} today={today} />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      <FloatingCreateButton
        accessibilityLabel="Ajouter une cliente"
        onPress={() => setAddClientVisible(true)}
        testID="add-client-directory"
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
  /** Today's local date: decides the birthday-today state of the row. */
  readonly today: Date;
}

function ClientRow({ client, onPress, today }: ClientRowProps) {
  const archived = isClientArchived(client);
  // Only this mounted row resolves its own photo (cache first, else one
  // download); undefined meanwhile → the initials hold the same frame.
  const photoUri = useClientPhotoUri(client.photoPath);
  const metadata = archived
    ? [ARCHIVED_CLIENT_LABEL, client.phone].filter(Boolean).join(' · ')
    : client.phone;
  const birthday = client.birthday;
  // An archived Client stays visually secondary: her row never celebrates.
  const birthdayToday = !archived && isClientBirthdayOnDate(client, today);
  const birthdayAccessibilityText = !birthday
    ? ''
    : birthdayToday
      ? ", anniversaire aujourd'hui"
      : `, anniversaire le ${formatClientBirthday(birthday)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir la fiche de ${getClientDisplayName(client)}${
        archived ? `, ${ARCHIVED_CLIENT_LABEL.toLowerCase()}` : ''
      }${birthdayAccessibilityText}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}
      testID={`client-row-${client.id}`}
    >
      <View style={styles.avatar}>
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
      {birthday && birthdayToday ? (
        <View
          style={[styles.birthday, styles.birthdayToday]}
          testID={`client-row-birthday-today-${client.id}`}
        >
          <SymbolView name={birthdayIcon} size={14} tintColor={rose.rose700} />
          <AppText variant="chip" style={styles.birthdayTodayText}>
            {DIRECTORY_BIRTHDAY_TODAY_LABEL}
          </AppText>
        </View>
      ) : birthday ? (
        <View style={styles.birthday} testID={`client-row-birthday-${client.id}`}>
          <SymbolView
            name={birthdayIcon}
            size={14}
            tintColor={archived ? foregroundSoft : semanticColors.accent}
          />
          <AppText variant="metadata" style={styles.birthdayText}>
            {formatClientBirthdayCompact(birthday)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  searchWrap: {
    paddingBottom: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  tabsWrap: {
    paddingBottom: spacing.xs,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.md,
  },
  listContent: { paddingBottom: bottomClearance[Platform.OS === 'android' ? 'android' : 'ios'] },
  // Produits spacing above/below; aligned with the row content (thumbnail and
  // birthday edges), as the Produits header is with its rows.
  sectionHeader: {
    marginTop: spacing['2xl'],
    paddingBottom: spacing.sm,
    paddingHorizontal: horizontalGutter + spacing.md,
  },
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
  // The Produits row gap between thumbnail and copy.
  avatar: { marginRight: spacing.sm },
  rowCopy: { flex: 1, minWidth: 0 },
  clientName: { color: semanticColors.foreground },
  archivedClientName: { color: foregroundSoft },
  phoneLine: { color: foregroundSoft },
  birthday: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginLeft: spacing.sm,
  },
  birthdayText: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  // Same slot, same row height: a blush pill instead of the compact date.
  birthdayToday: {
    backgroundColor: rose.rose100,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  birthdayTodayText: { color: rose.rose700 },
  emptyState: { alignItems: 'center', padding: spacing.xl },
  emptyStateText: { color: foregroundSoft, marginTop: spacing.sm, textAlign: 'center' },
});
