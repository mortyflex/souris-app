// BeautIzzy — client import: paste a list
//
// A plain multiline field filled with the system Paste action — no clipboard
// API is read. The text stays in component memory only: never persisted,
// never logged, never sent anywhere. « Analyser la liste » stays disabled
// while the field is blank and sits in a fixed footer, reachable above the
// keyboard whatever the length of the pasted list.

import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSurface } from '@/shared/ui/GroupedSurface';
import { TextField } from '@/shared/ui/TextField';
import { spacing } from '@/shared/ui/theme';

interface ClientImportPasteStepProps {
  readonly text: string;
  readonly onChangeText: (text: string) => void;
  readonly onAnalyze: () => void;
  /** Shown when the last analysis found nobody in the text. */
  readonly nothingDetected: boolean;
}

export function ClientImportPasteStep({
  text,
  onChangeText,
  onAnalyze,
  nothingDetected,
}: ClientImportPasteStepProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.fill}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <AppText variant="sectionTitle">Collez une liste de clients</AppText>
          <AppText variant="metadata">
            Vous pouvez copier une liste depuis Notes, WhatsApp, Excel, Numbers ou Google Sheets.
          </AppText>
        </View>
        <TextField
          accessibilityLabel="Liste de clients"
          error={nothingDetected ? 'Aucun client détecté dans ce texte.' : undefined}
          label="Liste"
          multiline
          onChangeText={onChangeText}
          placeholder="Collez votre liste ici"
          placement="page"
          testID="client-import-paste-input"
          value={text}
        />
        <GroupedSurface style={styles.example} testID="client-import-example">
          <AppText variant="eyebrow">Exemple</AppText>
          <AppText style={styles.exampleText} variant="metadata">
            {'Sophie Martin 06 12 34 56 78\nNadia 07 45 67 89 12'}
          </AppText>
        </GroupedSurface>
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <AppButton
          disabled={text.trim().length === 0}
          onPress={onAnalyze}
          testID="client-import-analyze"
          title="Analyser la liste"
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  intro: { gap: spacing.xs },
  example: { gap: spacing.xs, padding: spacing.base },
  exampleText: { lineHeight: 22 },
  footer: { paddingBottom: spacing.base, paddingTop: spacing.md },
});
