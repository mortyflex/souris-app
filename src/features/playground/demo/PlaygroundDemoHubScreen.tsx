// BeautIzzy — the « Démo » tab of a Playground demo (development ONLY)
//
// What the Plus tab is to the product, this tab is to the demo: the
// Business being explored, what the dataset holds, the entry to
// « Prestations & tarifs » (the same pushed catalogue as the product), and
// the three demo controls — reset, change profession, leave. It reads the
// same session providers as every other screen, so the counts follow every
// edit made in the demo at once.
//
// Reset asks first (the canonical destructive dialog), then starts a new
// generation of the same profession: the runtime remounts on the original
// dataset. Changing profession and leaving both dismiss the demo group —
// the landing or the Discovery entry below is untouched — and the runtime
// clears the session as it unmounts.

import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { formatBusinessActivityType } from '@/features/business/presentation';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { MainScreenHeader } from '@/shared/ui/MainScreenHeader';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { gutter, interaction, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

import { PLAYGROUND_MODE_LABEL } from '../mode-label';
import { usePlaygroundDemoSession } from './session';

export const RESET_DEMO_TITLE = 'Réinitialiser la démonstration';
export const CHANGE_PROFESSION_TITLE = 'Changer de métier';
export const LEAVE_PLAYGROUND_TITLE = 'Quitter le Playground';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export function PlaygroundDemoHubScreen() {
  const router = useRouter();
  const { reset } = usePlaygroundDemoSession();
  const business = useCurrentBusiness();
  const { activeClients, archivedClients } = useClientSession();
  const { services } = useServiceCatalog();
  const { appointments } = useAppointmentSession();

  const summary = [
    plural(activeClients.length, 'client'),
    plural(services.length, 'prestation'),
    plural(appointments.length, 'rendez-vous', 'rendez-vous'),
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
            accessibilityLabel="Outil interne de développement. Données fictives en mémoire : aucun compte, aucune synchronisation, rien n’est conservé à la sortie. Caisse, ventes, produits et statistiques ne font pas partie de cette démonstration."
            style={styles.notice}
            testID="playground-demo-notice"
          >
            <AppText style={styles.noticeTitle} variant="control">
              Outil interne de développement
            </AppText>
            <AppText style={styles.noticeBody} variant="metadata">
              Données fictives en mémoire : aucun compte, aucune synchronisation, rien n’est conservé à la
              sortie. Caisse, ventes, produits et statistiques ne font pas partie de cette démonstration.
            </AppText>
          </View>
        </View>
      </ScrollView>
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
