// BeautIzzy — the « Démo » tab of a Playground demo (development ONLY)
//
// What the Plus tab is to the product, this tab is to the demo: the
// Business being explored, what the dataset holds, the entries the product
// keeps in Plus — « Prestations & tarifs », « Caisse » (the same pushed
// screens) and « Tops & tendances » (the same ticket as Accueil) — and the
// three demo controls — reset, change profession, leave. It reads the same
// session providers as every other screen, so the counts follow every edit,
// sale and payment made in the demo at once.
//
// « Premiers pas »: the established demo offers to switch to a just-onboarded
// Business of the same profession; a first-use demo lists its stages
// (scenarios/first-use.ts) — each one a NEW generation seeded at that stage,
// the identity typed in the onboarding preview kept — and a way back to the
// established demo. The runtime remounts on Accueil, where the card shows.
//
// Reset asks first (the canonical destructive dialog), then starts a new
// generation of the same profession: the runtime remounts on the original
// dataset. Changing profession and leaving both dismiss the demo group —
// the landing or the Discovery entry below is untouched — and the runtime
// clears the session as it unmounts.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { formatBusinessActivityType } from '@/features/business/presentation';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { BusinessInsightsTicket } from '@/features/insights/BusinessInsightsTicket';
import { useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { insightsIcon } from '@/shared/icons/insights-icon';
import { cashRegisterIcon } from '@/shared/icons/payment-method-icons';
import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { MainScreenHeader } from '@/shared/ui/MainScreenHeader';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { gutter, interaction, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

import { PLAYGROUND_MODE_LABEL } from '../mode-label';
import { FIRST_USE_STAGES, type FirstUseStage } from './scenarios';
import { usePlaygroundDemoSession } from './session';

export const RESET_DEMO_TITLE = 'Réinitialiser la démonstration';
export const CHANGE_PROFESSION_TITLE = 'Changer de métier';
export const LEAVE_PLAYGROUND_TITLE = 'Quitter le Playground';
export const PREVIEW_FIRST_STEPS_TITLE = 'Prévisualiser les premiers pas';

/** What the demo is, and what it deliberately does not do. */
export const DEMO_NOTICE =
  'Données fictives en mémoire : aucun compte, aucune synchronisation, rien n’est conservé à la sortie. Les encaissements sont un simple suivi : aucun paiement réel. Photos, rappels et SMS sont désactivés.';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export function PlaygroundDemoHubScreen() {
  const router = useRouter();
  const { reset, start, scenario } = usePlaygroundDemoSession();
  const firstUse = scenario?.firstUse;
  const business = useCurrentBusiness();
  const { activeClients, archivedClients } = useClientSession();
  const { services } = useServiceCatalog();
  const { appointments } = useAppointmentSession();
  const { products } = useProductCatalog();
  const { sales } = useSaleSession();
  const [insightsVisible, setInsightsVisible] = useState(false);

  const summary = [
    plural(activeClients.length, 'client'),
    plural(services.length, 'prestation'),
    plural(appointments.length, 'rendez-vous', 'rendez-vous'),
    plural(products.length, 'produit'),
    plural(sales.length, 'vente'),
  ].join(' · ');

  const confirmReset = () => {
    haptics.action();
    Alert.alert(
      RESET_DEMO_TITLE,
      'Les modifications faites dans cette démonstration seront perdues et les données d’origine de ce métier restaurées.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Réinitialiser', style: 'destructive', onPress: reset },
      ],
    );
  };

  // A NEW generation at that stage: the runtime remounts on the fresh data.
  const startFirstUse = (stage: FirstUseStage) => {
    if (scenario === null) return;
    haptics.action();
    start(scenario.activityType, { stage, origin: firstUse?.origin });
  };

  const backToEstablishedDemo = () => {
    if (scenario === null) return;
    haptics.action();
    start(scenario.activityType);
  };

  const changeProfession = () => {
    haptics.action();
    router.dismissTo('/playground');
  };

  const leavePlayground = () => {
    haptics.action();
    router.dismissTo('/');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea} testID="playground-demo-hub">
      <ScrollView contentContainerStyle={styles.scrollContent} contentInsetAdjustmentBehavior="automatic">
        <MainScreenHeader eyebrow={PLAYGROUND_MODE_LABEL} title="Démo" watermark="settings" />
        <View style={styles.content}>
          <View
            accessible
            accessibilityLabel={`${business.name}, ${formatBusinessActivityType(business.activityType)}. ${summary}.`}
            style={styles.businessCard}
            testID="playground-demo-business"
          >
            <AppText style={styles.businessActivity} variant="eyebrow">
              {formatBusinessActivityType(business.activityType).toUpperCase()}
            </AppText>
            <AppText variant="sectionTitle">{business.name}</AppText>
            <AppText style={styles.businessSummary} variant="metadata">
              {summary}
              {archivedClients.length > 0 ? ` · ${plural(archivedClients.length, 'archivée')}` : ''}
            </AppText>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Gestion" />
            <HubRow
              accessibilityLabel={`Prestations et tarifs, ${plural(services.length, 'prestation')}`}
              icon={{ ios: 'scissors', android: 'content_cut' }}
              meta={plural(services.length, 'prestation')}
              onPress={() => router.push('/services')}
              testID="playground-demo-services"
              title="Prestations & tarifs"
            />
            <HubRow
              icon={cashRegisterIcon}
              meta="Encaissements du jour et du mois"
              onPress={() => router.push('/cash-register')}
              testID="playground-demo-cash-register"
              title="Caisse"
            />
            <HubRow
              icon={insightsIcon}
              meta="Classements calculés sur cette démonstration"
              onPress={() => setInsightsVisible(true)}
              testID="playground-demo-insights"
              title="Tops & tendances"
            />
          </View>

          <View style={styles.section} testID="playground-demo-first-steps">
            <SectionHeader title="Premiers pas" />
            {firstUse ? (
              <>
                {FIRST_USE_STAGES.map((option) => {
                  const current = option.stage === firstUse.stage;
                  return (
                    <HubRow
                      accessibilityLabel={`${option.title}, ${option.description}${current ? ', état affiché' : ''}`}
                      icon={
                        current
                          ? { ios: 'checkmark.circle.fill', android: 'check_circle' }
                          : { ios: 'circle', android: 'radio_button_unchecked' }
                      }
                      key={option.stage}
                      meta={option.description}
                      onPress={() => startFirstUse(option.stage)}
                      testID={`playground-demo-first-use-${option.stage}`}
                      title={option.title}
                    />
                  );
                })}
                <HubRow
                  icon={{ ios: 'building.2', android: 'store' }}
                  meta="Revenir au salon établi de ce métier"
                  onPress={backToEstablishedDemo}
                  testID="playground-demo-established"
                  title="Activité établie"
                />
              </>
            ) : (
              <HubRow
                icon={{ ios: 'sparkles', android: 'auto_awesome' }}
                meta="Une activité tout juste créée, avec la carte d’Accueil"
                onPress={() => startFirstUse('just-onboarded')}
                testID="playground-demo-preview-first-steps"
                title={PREVIEW_FIRST_STEPS_TITLE}
              />
            )}
          </View>

          <View style={styles.section}>
            <SectionHeader title="Démonstration" />
            <HubRow
              icon={{ ios: 'arrow.counterclockwise', android: 'restart_alt' }}
              meta="Restaure les données d’origine de ce métier"
              onPress={confirmReset}
              testID="playground-demo-reset"
              title={RESET_DEMO_TITLE}
            />
            <HubRow
              icon={{ ios: 'arrow.left.arrow.right', android: 'swap_horiz' }}
              meta="Retour au choix du métier ; cette démonstration est abandonnée"
              onPress={changeProfession}
              testID="playground-demo-change-profession"
              title={CHANGE_PROFESSION_TITLE}
            />
            <HubRow
              icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout' }}
              meta="Retour à l’accueil, sans compte"
              onPress={leavePlayground}
              testID="playground-demo-leave"
              title={LEAVE_PLAYGROUND_TITLE}
            />
          </View>

          <View
            accessible
            accessibilityLabel={`Outil interne de développement. ${DEMO_NOTICE}`}
            style={styles.notice}
            testID="playground-demo-notice"
          >
            <AppText style={styles.noticeTitle} variant="control">
              Outil interne de développement
            </AppText>
            <AppText style={styles.noticeBody} variant="metadata">
              {DEMO_NOTICE}
            </AppText>
          </View>
        </View>
      </ScrollView>
      <BusinessInsightsTicket
        anchor={new Date()}
        onClose={() => setInsightsVisible(false)}
        visible={insightsVisible}
      />
    </SafeAreaView>
  );
}

interface HubRowProps {
  readonly title: string;
  readonly meta: string;
  readonly icon: SymbolViewProps['name'];
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  readonly testID: string;
}

function HubRow({ title, meta, icon, onPress, accessibilityLabel, testID }: HubRowProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? `${title}, ${meta}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={testID}
    >
      <View style={styles.iconSurface}>
        <SymbolView name={icon} size={19} tintColor={semanticColors.accent} />
      </View>
      <View style={styles.copy}>
        <AppText variant="rowTitle">{title}</AppText>
        <AppText style={styles.meta} variant="metadata">
          {meta}
        </AppText>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={15}
        tintColor={semanticColors.foregroundMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screen, flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { flexGrow: 1, gap: spacing.lg, paddingBottom: spacing['3xl'], paddingHorizontal: horizontalGutter },
  businessCard: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  businessActivity: { color: semanticColors.accent },
  businessSummary: { color: semanticColors.foregroundSoft },
  section: { gap: spacing.sm },
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
  notice: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  noticeTitle: { color: rose.rose700 },
  noticeBody: { color: semanticColors.foregroundSoft },
});
