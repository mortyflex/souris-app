import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatBusinessActivityType } from '@/features/business/presentation';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { usePersistence } from '@/providers/PersistenceProvider';
import { AppText } from '@/shared/ui/AppText';
import { BrandComposition } from '@/shared/ui/BrandMark';
import { MainScreenHeader } from '@/shared/ui/MainScreenHeader';
import { Screen } from '@/shared/ui/Screen';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { AccountSheet } from './components/AccountSheet';

export function PlusScreen() {
  const router = useRouter();
  const { services } = useServiceCatalog();
  const business = useCurrentBusiness();
  const [accountVisible, setAccountVisible] = useState(false);
  // Plus does not scroll and the native tab bar overlays the page, so the
  // content keeps clear of the bar through the tab's own bottom safe area
  // (Expo Router scopes it to the tab screen; on a home-indicator device it
  // already includes the indicator).
  const insets = useSafeAreaInsets();
  const serviceCountLabel = `${services.length} prestation${services.length > 1 ? 's' : ''}`;
  const activityLabel = formatBusinessActivityType(business.activityType);

  return (
    <Screen
      header={<MainScreenHeader title="Plus" watermark="settings" />}
      style={{ paddingBottom: insets.bottom }}
      testID="plus-content"
    >
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
      <View style={styles.accountSection}>
        <SectionHeader title="Compte" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Compte, ${business.name}, ${activityLabel}`}
          onPress={() => setAccountVisible(true)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          testID="plus-account"
        >
          <View style={styles.iconSurface}>
            <SymbolView
              name={{ ios: 'person.crop.circle', android: 'account_circle' }}
              size={19}
              tintColor={semanticColors.accent}
            />
          </View>
          <View style={styles.copy}>
            <AppText variant="rowTitle" numberOfLines={1}>
              {business.name}
            </AppText>
            <AppText variant="metadata" style={styles.meta}>
              {activityLabel}
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
      <BrandSection version={Constants.expoConfig?.version} />
      <AccountSheet onClose={() => setAccountVisible(false)} visible={accountVisible} />
    </Screen>
  );
}

/** "Version 1.0.0" from the application manifest; nothing when unknown. */
export function formatAppVersion(version: string | undefined): string | undefined {
  const trimmed = version?.trim();
  return trimmed ? `Version ${trimmed}` : undefined;
}

/**
 * Restrained Souris identity at the bottom of Plus: the canonical mark +
 * wordmark composition, then the installed version. The composition exposes
 * exactly one accessible "Souris".
 */
function BrandSection({ version }: { readonly version: string | undefined }) {
  const versionLabel = formatAppVersion(version);

  return (
    <View style={styles.brandSection} testID="plus-brand">
      <BrandComposition size={128} />
      {versionLabel && (
        <AppText variant="metadata" style={styles.brandVersion}>
          {versionLabel}
        </AppText>
      )}
    </View>
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
  accountSection: { gap: spacing.sm, paddingTop: spacing['2xl'] },
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
  brandSection: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 'auto',
    paddingBottom: spacing.lg,
    paddingTop: spacing['3xl'],
  },
  brandVersion: { color: semanticColors.foregroundMuted },
});
