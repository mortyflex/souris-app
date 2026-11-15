import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SubscriptionStatusSection } from '@/features/access/status/SubscriptionStatusSection';
import { formatBusinessActivityType } from '@/features/business/presentation';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { ONLINE_BOOKING_ROW_META, ONLINE_BOOKING_ROW_TITLE } from '@/features/online-booking/presentation';
import {
  WORKING_HOURS_ROW_META,
  WORKING_HOURS_ROW_TITLE,
} from '@/features/online-booking/working-hours/presentation';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { usePersistence } from '@/providers/PersistenceProvider';
import { cashRegisterIcon } from '@/shared/icons/payment-method-icons';
import { AppText } from '@/shared/ui/AppText';
import { BrandMark } from '@/shared/ui/BrandMark';
import { MainScreenHeader } from '@/shared/ui/MainScreenHeader';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  gutter,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { AccountSheet } from './components/AccountSheet';

// Development sync control (Cloud Sync V1C test bench). Required inside a
// `__DEV__` branch — never imported statically — so Metro drops the module
// and everything only it pulls in from release bundles: a TestFlight / App
// Store binary contains no sync control, reachable or not.
const DevelopmentSyncSheet = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./development/DevelopmentSyncSheet') as typeof import('./development/DevelopmentSyncSheet'))
      .DevelopmentSyncSheet
  : undefined;

// BeautIzzy Plus paywall preview (design test bench, fixtures included):
// the same release boundary — a `require` inside a `__DEV__` branch only.
const PaywallPreviewSheet = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/features/access/paywall/development/PaywallPreviewSheet') as typeof import('@/features/access/paywall/development/PaywallPreviewSheet'))
      .PaywallPreviewSheet
  : undefined;

// Accueil brand row preview (the « Plus » mark beside the logo, both states):
// the same release boundary — a `require` inside a `__DEV__` branch only.
const HomeBrandPreviewSheet = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/features/home/development/HomeBrandPreviewSheet') as typeof import('@/features/home/development/HomeBrandPreviewSheet'))
      .HomeBrandPreviewSheet
  : undefined;

// BeautIzzy Plus subscription status preview (every status over fixtures):
// the same release boundary — a `require` inside a `__DEV__` branch only.
const SubscriptionStatusPreviewSheet = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/features/access/status/development/SubscriptionStatusPreviewSheet') as typeof import('@/features/access/status/development/SubscriptionStatusPreviewSheet'))
      .SubscriptionStatusPreviewSheet
  : undefined;

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function PlusScreen() {
  const router = useRouter();
  const { services } = useServiceCatalog();
  const business = useCurrentBusiness();
  const [accountVisible, setAccountVisible] = useState(false);
  // The native tab bar overlays the page, so the scroll content ends with the
  // tab's own bottom safe area (Expo Router scopes it to the tab screen; on a
  // home-indicator device it already includes the indicator): the last
  // element scrolls completely above the bar.
  const insets = useSafeAreaInsets();
  const serviceCountLabel = `${services.length} prestation${services.length > 1 ? 's' : ''}`;
  const activityLabel = formatBusinessActivityType(business.activityType);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/*
        ONE vertical scroll for the whole page, header included. The content
        keeps its natural height and grows to the viewport when it is shorter,
        so the identity block rests above the tab bar on a tall screen and
        simply follows the last section when the page has to scroll.
      */}
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom }]}
        showsVerticalScrollIndicator={false}
        testID="plus-scroll"
      >
        <MainScreenHeader title="Plus" watermark="settings" />
        <View style={styles.content} testID="plus-content">
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rappels clients, rappels par e-mail"
              onPress={() => router.push('/reminder-settings')}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              testID="plus-reminder-settings"
            >
              <View style={styles.iconSurface}>
                <SymbolView
                  name={{ ios: 'bell', android: 'notifications' }}
                  size={19}
                  tintColor={semanticColors.accent}
                />
              </View>
              <View style={styles.copy}>
                <AppText variant="rowTitle">Rappels clients</AppText>
                <AppText variant="metadata" style={styles.meta}>
                  Rappels par e-mail
                </AppText>
              </View>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right' }}
                size={15}
                tintColor={semanticColors.foregroundMuted}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${ONLINE_BOOKING_ROW_TITLE}, ${ONLINE_BOOKING_ROW_META}`}
              onPress={() => router.push('/online-booking-settings')}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              testID="plus-online-booking-settings"
            >
              <View style={styles.iconSurface}>
                <SymbolView
                  name={{ ios: 'globe', android: 'language' }}
                  size={19}
                  tintColor={semanticColors.accent}
                />
              </View>
              <View style={styles.copy}>
                <AppText variant="rowTitle">{ONLINE_BOOKING_ROW_TITLE}</AppText>
                <AppText variant="metadata" style={styles.meta}>
                  {ONLINE_BOOKING_ROW_META}
                </AppText>
              </View>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right' }}
                size={15}
                tintColor={semanticColors.foregroundMuted}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${WORKING_HOURS_ROW_TITLE}, ${WORKING_HOURS_ROW_META}`}
              onPress={() => router.push('/working-hours-settings')}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              testID="plus-working-hours-settings"
            >
              <View style={styles.iconSurface}>
                <SymbolView
                  name={{ ios: 'clock', android: 'schedule' }}
                  size={19}
                  tintColor={semanticColors.accent}
                />
              </View>
              <View style={styles.copy}>
                <AppText variant="rowTitle">{WORKING_HOURS_ROW_TITLE}</AppText>
                <AppText variant="metadata" style={styles.meta}>
                  {WORKING_HOURS_ROW_META}
                </AppText>
              </View>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right' }}
                size={15}
                tintColor={semanticColors.foregroundMuted}
              />
            </Pressable>
            {/*
              SMS fidélisation (SMS pivot Phase 2) — DEVELOPMENT builds only for
              now: the app cannot know whether the server SMS transport is
              configured, so the entry stays invisible in production until the
              controlled deployment step (fail-safe, §38 of the Phase 2 plan).
              The screen and its server surface are fully functional; server-side
              both automations default OFF for every Business.
            */}
            {__DEV__ && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="SMS fidélisation, offres anniversaires et clients inactifs"
                onPress={() => router.push('/lifecycle-sms-settings')}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                testID="plus-lifecycle-sms-settings"
              >
                <View style={styles.iconSurface}>
                  <SymbolView
                    name={{ ios: 'gift', android: 'featured_seasonal_and_gifts' }}
                    size={19}
                    tintColor={semanticColors.accent}
                  />
                </View>
                <View style={styles.copy}>
                  <AppText variant="rowTitle">SMS fidélisation</AppText>
                  <AppText variant="metadata" style={styles.meta}>
                    Anniversaires et clients inactifs
                  </AppText>
                </View>
                <SymbolView
                  name={{ ios: 'chevron.right', android: 'chevron_right' }}
                  size={15}
                  tintColor={semanticColors.foregroundMuted}
                />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Caisse, encaissements du jour et du mois"
              onPress={() => router.push('/cash-register')}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              testID="plus-cash-register"
            >
              <View style={styles.iconSurface}>
                <SymbolView name={cashRegisterIcon} size={19} tintColor={semanticColors.accent} />
              </View>
              <View style={styles.copy}>
                <AppText variant="rowTitle">Caisse</AppText>
                <AppText variant="metadata" style={styles.meta}>
                  Encaissements du jour et du mois
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
          {/* The verified BeautIzzy Plus status of the signed-in account: read-only, no action yet. */}
          <SubscriptionStatusSection />
          {__DEV__ && <DevelopmentSection />}
          <BrandSection version={Constants.expoConfig?.version} />
        </View>
      </ScrollView>
      <AccountSheet onClose={() => setAccountVisible(false)} visible={accountVisible} />
    </SafeAreaView>
  );
}

/** "Version 1.0.0" from the application manifest; nothing when unknown. */
export function formatAppVersion(version: string | undefined): string | undefined {
  const trimmed = version?.trim();
  return trimmed ? `Version ${trimmed}` : undefined;
}

/**
 * Restrained BeautIzzy identity at the bottom of Plus: the editorial logo,
 * then the installed version. It exposes exactly one accessible "BeautIzzy".
 */
function BrandSection({ version }: { readonly version: string | undefined }) {
  const versionLabel = formatAppVersion(version);

  return (
    <View style={styles.brandSection} testID="plus-brand">
      <BrandMark variant="editorial" size={125} />
      {versionLabel && (
        <AppText variant="metadata" style={styles.brandVersion}>
          {versionLabel}
        </AppText>
      )}
    </View>
  );
}

/**
 * Development builds only: resets the local database to its first-run seed,
 * and opens the Cloud Sync V1C test control. Compiled out of production
 * bundles by the `__DEV__` guard above.
 */
function DevelopmentSection() {
  const { resetForDevelopment } = usePersistence();
  const [syncControlVisible, setSyncControlVisible] = useState(false);
  const [paywallPreviewVisible, setPaywallPreviewVisible] = useState(false);
  const [statusPreviewVisible, setStatusPreviewVisible] = useState(false);
  const [brandPreviewVisible, setBrandPreviewVisible] = useState(false);

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
      {DevelopmentSyncSheet && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Contrôle Sync V1C, développement"
            onPress={() => setSyncControlVisible(true)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            testID="development-sync-open"
          >
            <View style={styles.copy}>
              <AppText variant="rowTitle" style={styles.developmentTitle}>
                Sync V1C (test)
              </AppText>
              <AppText variant="metadata" style={styles.meta}>
                État, approbation de l’envoi initial, push manuel
              </AppText>
            </View>
          </Pressable>
          <DevelopmentSyncSheet
            onClose={() => setSyncControlVisible(false)}
            visible={syncControlVisible}
          />
        </>
      )}
      {PaywallPreviewSheet && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aperçu BeautIzzy Plus, développement"
            onPress={() => setPaywallPreviewVisible(true)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            testID="development-paywall-preview-open"
          >
            <View style={styles.copy}>
              <AppText variant="rowTitle" style={styles.developmentTitle}>
                Aperçu BeautIzzy Plus (test)
              </AppText>
              <AppText variant="metadata" style={styles.meta}>
                États du paywall, offres fictives sans achat, offre RevenueCat réelle avec achat de test
              </AppText>
            </View>
          </Pressable>
          <PaywallPreviewSheet
            onClose={() => setPaywallPreviewVisible(false)}
            visible={paywallPreviewVisible}
          />
        </>
      )}
      {SubscriptionStatusPreviewSheet && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Statut BeautIzzy Plus, développement"
            onPress={() => setStatusPreviewVisible(true)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            testID="development-subscription-status-preview-open"
          >
            <View style={styles.copy}>
              <AppText variant="rowTitle" style={styles.developmentTitle}>
                Statut BeautIzzy Plus (test)
              </AppText>
              <AppText variant="metadata" style={styles.meta}>
                États de « Mon abonnement » avec des statuts fictifs
              </AppText>
            </View>
          </Pressable>
          <SubscriptionStatusPreviewSheet
            onClose={() => setStatusPreviewVisible(false)}
            visible={statusPreviewVisible}
          />
        </>
      )}
      {HomeBrandPreviewSheet && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aperçu badge Plus, développement"
            onPress={() => setBrandPreviewVisible(true)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            testID="development-home-brand-preview-open"
          >
            <View style={styles.copy}>
              <AppText variant="rowTitle" style={styles.developmentTitle}>
                Aperçu badge Plus (test)
              </AppText>
              <AppText variant="metadata" style={styles.meta}>
                Logo d’Accueil avec et sans le badge « Plus »
              </AppText>
            </View>
          </Pressable>
          <HomeBrandPreviewSheet onClose={() => setBrandPreviewVisible(false)} visible={brandPreviewVisible} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: semanticColors.screen, flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { flexGrow: 1, paddingHorizontal: horizontalGutter },
  managementSection: { gap: spacing.sm, paddingTop: spacing['2xl'] },
  accountSection: { gap: spacing.sm, paddingTop: spacing['2xl'] },
  developmentSection: { gap: spacing.sm, paddingTop: spacing['2xl'] },
  developmentTitle: { color: rose.rose700 },
  row: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 68,
    paddingVertical: spacing.sm,
  },
  // Flat rows on the app background: the stronger lavender step keeps the press visible.
  rowPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
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
