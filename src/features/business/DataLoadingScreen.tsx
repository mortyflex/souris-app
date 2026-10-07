// BeautIzzy — the data of this account is on its way
//
// Shown INSTEAD of the application on a device that holds no data, while BeautIzzy
// finds out what the account already holds and brings it back (first launch
// after a sign-in, a reinstall, a new phone). Usually a moment; a large account
// on a slow network takes longer, hence a real waiting state rather than the
// static brand surface.
//
// No action, no percentage (nothing measurable exists to show), and plain
// product wording only: nothing here names the mechanism behind it. If it
// fails, DataUnavailableScreen takes over.

import { ActivityIndicator, StyleSheet } from 'react-native';

import { AccountStateScreen } from '@/features/auth/components/AccountStateScreen';
import { semanticColors, spacing } from '@/shared/ui/theme';

export function DataLoadingScreen() {
  return (
    <AccountStateScreen
      accessory={
        <ActivityIndicator
          accessibilityLabel="Chargement en cours"
          color={semanticColors.accent}
          size="large"
          style={styles.indicator}
          testID="data-loading-indicator"
        />
      }
      message="Cela peut prendre quelques instants."
      testID="data-loading-screen"
      title="Récupération de vos données…"
    />
  );
}

const styles = StyleSheet.create({
  indicator: { marginTop: spacing.md },
});
