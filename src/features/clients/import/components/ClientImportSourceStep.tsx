// Souris — client import: choose a source
//
// The entry of every import source. « Coller une liste » is the only one
// today; files, phone contacts and photos are future adapters of the same
// pipeline and are deliberately NOT listed before they exist.
//
// While ONE source is enabled, the import opens straight on it and this step
// is never shown (ClientImportScreen). Enabling a second source in
// ENABLED_CLIENT_IMPORT_SOURCES brings the choice back as the first step.

import { ScrollView, StyleSheet } from 'react-native';

import { ActionGroup, type DetailAction } from '@/shared/ui/ActionGroup';
import { AppText } from '@/shared/ui/AppText';
import { spacing } from '@/shared/ui/theme';

export type ClientImportSourceKey = 'PASTE';

/** The sources offered, in order. More than one → the import opens on the choice. */
export const ENABLED_CLIENT_IMPORT_SOURCES: readonly ClientImportSourceKey[] = ['PASTE'];

const SOURCE_ACTIONS: Record<ClientImportSourceKey, DetailAction<ClientImportSourceKey>> = {
  PASTE: {
    key: 'PASTE',
    label: 'Coller une liste',
    icon: { ios: 'doc.on.clipboard', android: 'content_paste' },
    tone: 'normal',
    testID: 'client-import-source-paste',
  },
};

interface ClientImportSourceStepProps {
  readonly sources?: readonly ClientImportSourceKey[];
  readonly onSelect: (source: ClientImportSourceKey) => void;
}

export function ClientImportSourceStep({
  sources = ENABLED_CLIENT_IMPORT_SOURCES,
  onSelect,
}: ClientImportSourceStepProps) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <AppText variant="body">Ajoutez en une fois les clients que vous suivez déjà.</AppText>
      <ActionGroup actions={sources.map((source) => SOURCE_ACTIONS[source])} onSelect={onSelect} />
      <AppText variant="metadata">
        Seuls le nom, le téléphone, l’email et l’anniversaire sont importés.
      </AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.base, paddingBottom: spacing['3xl'], paddingTop: spacing.sm },
});
