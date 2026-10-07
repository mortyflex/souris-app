// BeautIzzy — Client history, unknown client
//
// The restrained not-found state of the pushed history screens (a stale
// route after a permanent deletion): the header stays, so back still works.

import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

import { ClientHistoryHeader } from './ClientHistoryHeader';

export function ClientHistoryNotFound({ title }: { readonly title: string }) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ClientHistoryHeader title={title} />
      <View style={styles.notFound}>
        <AppText variant="stateTitle">Client introuvable</AppText>
        <AppText variant="metadata" style={styles.text}>
          Ce client n&apos;existe plus.
        </AppText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  text: { color: foregroundSoft, marginTop: spacing.sm, textAlign: 'center' },
});
