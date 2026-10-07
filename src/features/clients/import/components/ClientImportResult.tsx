// BeautIzzy — client import result
//
//   8 clients importés
//   [ 2 clients n'ont pas pu être importés + message ]   only after a failure
//   ╭──────────────────────────╮
//   │ Julie Martin             │  one white card listing the Clients
//   │ 06 12 34 56 78           │  ACTUALLY written, as created (the final
//   │──────────────────────────│  corrected values), never a skipped one
//   │ Maya Dupont              │
//   │ Anniversaire : 14 mai    │
//   ╰──────────────────────────╯
//   [ Réessayer ]  [ Terminé ]                            fixed footer
//
// A light confirmation, not another review: name + at most one short line
// (phone · email, else the birthday), no placeholders, no actions. The card
// sizes to its rows and scrolls inside the room above the footer when the
// list is long; nothing is re-parsed or re-classified here.

import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getClientDisplayName, type Client } from '@/domain/clients';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

import { failureMessage, importedClientDetail, importedClientsTitle, pluralClients } from '../presentation';
import type { ClientImportFailureCode } from '../run-client-import';

interface ClientImportResultProps {
  /** The Clients written by this import (every attempt), in import order. */
  readonly imported: readonly Client[];
  /** Clients not written yet (retried by « Réessayer »). */
  readonly failedCount: number;
  readonly failure?: ClientImportFailureCode;
  readonly onRetry: () => void;
  readonly onDone: () => void;
}

export function ClientImportResult({ imported, failedCount, failure, onRetry, onDone }: ClientImportResultProps) {
  return (
    <View style={styles.fill} testID="client-import-result">
      <View style={styles.header}>
        <AppText accessibilityRole="header" testID="client-import-result-title" variant="stateTitle">
          {importedClientsTitle(imported.length)}
        </AppText>
        {failedCount > 0 ? (
          <AppText style={styles.failure} testID="client-import-result-failed" variant="body">
            {`${pluralClients(failedCount)} n’${failedCount === 1 ? 'a' : 'ont'} pas pu être importé${failedCount === 1 ? '' : 's'}`}
          </AppText>
        ) : null}
        {failure ? (
          <AppText style={styles.centeredText} testID="client-import-result-message" variant="metadata">
            {failureMessage(failure)}
          </AppText>
        ) : null}
      </View>
      {imported.length > 0 ? (
        <View style={styles.card} testID="client-import-result-list">
          <FlatList
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            data={imported}
            keyExtractor={(client) => client.id}
            renderItem={({ item }) => <ImportedClientRow client={item} />}
            showsVerticalScrollIndicator={false}
            style={styles.list}
          />
        </View>
      ) : null}
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {failedCount > 0 ? <AppButton onPress={onRetry} testID="client-import-retry" title="Réessayer" /> : null}
        <AppButton
          onPress={onDone}
          testID="client-import-done"
          title="Terminé"
          variant={failedCount > 0 ? 'secondary' : 'primary'}
        />
      </SafeAreaView>
    </View>
  );
}

function ImportedClientRow({ client }: { readonly client: Client }) {
  const detail = importedClientDetail(client);
  return (
    <View accessible style={styles.row} testID={`client-import-result-row-${client.id}`}>
      <AppText numberOfLines={1} variant="rowTitle">
        {getClientDisplayName(client)}
      </AppText>
      {detail ? (
        <AppText numberOfLines={1} testID={`client-import-result-detail-${client.id}`} variant="metadata">
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.lg, paddingTop: spacing.xl },
  centeredText: { textAlign: 'center' },
  // Text on the app background: rose600 falls to ~4.3:1 there.
  failure: { color: rose.rose700, textAlign: 'center' },
  // Sizes to its rows; shrinks and scrolls when the list outgrows the room.
  card: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
    overflow: 'hidden',
  },
  list: { flexGrow: 0 },
  row: { gap: 2, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  separator: {
    backgroundColor: semanticColors.borderSubtle,
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.base,
  },
  // `marginTop: auto` keeps the actions at the bottom whatever the list height.
  footer: { gap: spacing.sm, marginTop: 'auto', paddingBottom: spacing.base, paddingTop: spacing.md },
});
