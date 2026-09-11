import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { usePersistence } from '@/providers/PersistenceProvider';
import { AppText } from '@/shared/ui/AppText';
import { Screen } from '@/shared/ui/Screen';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

export function PlusScreen() {
  const router = useRouter();
  const { services } = useServiceCatalog();
  const serviceCountLabel = `${services.length} prestation${services.length > 1 ? 's' : ''}`;

  return (
    <Screen>
      <AppText variant="screenTitle" accessibilityRole="header">
        Plus
      </AppText>
      <View style={styles.managementSection}>
        <SectionHeader title="Gestion" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Prestations et tarifs, ${serviceCountLabel}`}
          onPress={() => router.push('/services')}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.iconSurface}>
            <SymbolView
              name={{ ios: 'scissors', android: 'content_cut' }}
              size={19}
              tintColor={semanticColors.accent}
            />
          </View>
          <View style={styles.copy}>
            <AppText variant="rowTitle">Prestations & tarifs</AppText>
            <AppText variant="metadata" style={styles.meta}>
              {serviceCountLabel}
            </AppText>
          </View>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right' }}
            size={15}
            tintColor={semanticColors.foregroundMuted}
          />
        </Pressable>
      </View>
      {__DEV__ && <DevelopmentSection />}
    </Screen>
  );
}

/**
 * Development builds only: resets the local database to its first-run seed.
 * Compiled out of production bundles by the `__DEV__` guard above.
 */
function DevelopmentSection() {
  const { resetForDevelopment } = usePersistence();

  const requestReset = () => {
    Alert.alert(
      'Réinitialiser les données locales ?',
      'Toutes les données enregistrées sur cet appareil seront supprimées et les données initiales rechargées. Réservé au développement.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Réinitialiser', style: 'destructive', onPress: resetForDevelopment },
      ],
    );
  };

  return (
    <View style={styles.developmentSection}>
      <SectionHeader title="Développement" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Réinitialiser les données locales"
        onPress={requestReset}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        testID="development-reset-database"
      >
        <View style={styles.copy}>
          <AppText variant="rowTitle" style={styles.developmentTitle}>
            Réinitialiser les données locales
          </AppText>
          <AppText variant="metadata" style={styles.meta}>
            Supprime la base SQLite et recharge les données initiales
          </AppText>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  managementSection: { gap: spacing.sm, paddingTop: spacing['2xl'] },
  developmentSection: { gap: spacing.sm, paddingTop: spacing['2xl'] },
  developmentTitle: { color: rose.rose600 },
  row: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 68,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    opacity: interaction.pressedOpacity,
  },
  iconSurface: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  meta: { color: semanticColors.foregroundSoft },
});
