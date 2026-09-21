// Souris — Client directory (Clientes tab)
//
// The complete Client directory: search + SectionList over the shared Client
// session source, grouped into Actives / Archivées (archived Clients stay
// discoverable, visually secondary, never error-like). Rows stay clean and
// light (initial avatar, strong name, soft phone) — no per-client cards, no
// fake metrics. A recorded birthday shows as a compact trailing « 21 sept. »
// with a cake glyph: secondary, never a placeholder when absent, and the row
// keeps its height either way. When TODAY is her birthday the same slot
// becomes a static blush « Aujourd'hui » badge (cake glyph + word, never
// colour alone, never animated: the list stays light to scroll), and the row
// says so to assistive technology. Notes never appear in the list. The
// shared floating + opens the shared creation sheet, the single way to add a
// Client. The header follows the Produits reference:
// large title, no eyebrow, search right below (MainScreenHeader).

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
  getClientInitial,
  isClientArchived,
  isClientBirthdayOnDate,
  type Client,
} from '@/domain/clients';
import { DIRECTORY_BIRTHDAY_TODAY_LABEL } from '@/features/clients/birthday/presentation';
import { useToday } from '@/features/clients/birthday/use-today';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import {
  buildClientDirectorySections,
  type ClientDirectorySection,
} from '@/features/clients/directory/directory-sections';
import { ARCHIVED_CLIENT_LABEL } from '@/features/clients/presentation';
import { birthdayIcon } from '@/shared/icons/birthday-icon';
import { AppText } from '@/shared/ui/AppText';
import { FloatingCreateButton } from '@/shared/ui/FloatingCreateButton';
import { MainScreenHeader } from '@/shared/ui/MainScreenHeader';
import { SearchField } from '@/shared/ui/SearchField';
import {
  bottomClearance,
  foregroundSoft,
  gutter,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

function formatActiveClientCountLabel(count: number): string {
  const plural = count > 1 ? 's' : '';
  return `${count} cliente${plural} active${plural}`;
}

export function ClientDirectoryScreen() {
  const router = useRouter();
  // `activeClients` is derived by the session from the same `clients`: the
  // header total can never drift from the list, and search never touches it.
  const { clients, activeClients } = useClientSession();
  const [query, setQuery] = useState('');
  const [addClientVisible, setAddClientVisible] = useState(false);
  const today = useToday();

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
      <MainScreenHeader
        count={activeClients.length}
        countAccessibilityLabel={formatActiveClientCountLabel(activeClients.length)}
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
  listContent: { paddingBottom: bottomClearance[Platform.OS === 'android' ? 'android' : 'ios'] },
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
