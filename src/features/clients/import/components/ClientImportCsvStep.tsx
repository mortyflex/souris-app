// Souris — client import: choose a CSV file
//
// The CSV source step. The system file picker opens as soon as the source is
// chosen and again from « Choisir un fichier »; this step is what stays on
// screen when the picker is cancelled or the file cannot be used — a plain
// French message, and another file can be chosen at once. The file is read
// in memory only: never copied, persisted, logged or sent anywhere.

import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSurface } from '@/shared/ui/GroupedSurface';
import { rose, spacing } from '@/shared/ui/theme';

interface ClientImportCsvStepProps {
  readonly onPickFile: () => void;
  /** The picker is open or the chosen file is being read. */
  readonly picking: boolean;
  /** Why the last file gave nothing to review. */
  readonly error?: string;
}

export function ClientImportCsvStep({ onPickFile, picking, error }: ClientImportCsvStepProps) {
  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <AppText variant="sectionTitle">Importez un fichier CSV</AppText>
          <AppText variant="metadata">
            Exportez votre liste au format CSV depuis Excel, Numbers, Google Sheets ou votre ancien
            logiciel, puis choisissez le fichier.
          </AppText>
        </View>
        {error ? (
          <AppText accessibilityLiveRegion="polite" style={styles.error} testID="client-import-csv-error" variant="metadata">
            {error}
          </AppText>
        ) : null}
        <GroupedSurface style={styles.example} testID="client-import-csv-example">
          <AppText variant="eyebrow">Colonnes reconnues</AppText>
          <AppText style={styles.exampleText} variant="metadata">
            {'Prénom · Nom · Téléphone · Email · Anniversaire'}
          </AppText>
        </GroupedSurface>
        <AppText variant="metadata">
          Vous vérifiez la liste avant d’importer. Les autres colonnes sont ignorées.
        </AppText>
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <AppButton
          disabled={picking}
          onPress={onPickFile}
          testID="client-import-csv-pick"
          title={error ? 'Choisir un autre fichier' : 'Choisir un fichier'}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  intro: { gap: spacing.xs },
  // rose700: small error text stays readable on the page background.
  error: { color: rose.rose700 },
  example: { gap: spacing.xs, padding: spacing.base },
  exampleText: { lineHeight: 22 },
  footer: { paddingBottom: spacing.base, paddingTop: spacing.md },
});
