// Souris — Accueil
//
// The landing tab: what today holds, read top-down.
//
//   [ Souris wordmark ]              Lundi 5 octobre
//   Bonjour
//   Votre journée en un coup d’œil.
//   [ PROCHAIN RENDEZ-VOUS — the one tinted hero card ]   → Appointment Details
//   Aujourd’hui                       Résumé du jour ›
//   [ 2  Rendez-vous ]   [ 100 €  CA potentiel ]          the two primary figures
//   [ Encaissements du jour · 0 € encaissé | 100 € restant ]   secondary
//   Actions rapides
//   ( Rendez-vous ) ( Client ) ( Produit ) ( Vente )      light shortcuts: they CREATE
//   Cette semaine                Résumé de la semaine ›
//   [ 12 rendez-vous | Déjà encaissé 860 € · CA potentiel 1 120 € ]   secondary
//   Pilotage
//   [ Créer une estimation › / Tops & tendances › ]       existing tools, consulted
//
// A composition of what Souris already knows — never a second Agenda and
// never new analytics. Today's figures are the domain day summary
// (`getAppointmentDaySummary`), the week's are the domain period summary of
// the Agenda week (`getAppointmentPeriodSummary`, Monday → Sunday) — the very
// figures of « Résumé du jour » and « Résumé de la semaine », which the
// section links open. The actions and tools open the existing flows.
// Nothing is stored, nothing is selected: the Agenda stays the place to
// browse days.

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { getAppointmentDaySummary, getAppointmentPeriodSummary } from '@/domain/appointments';
import { getWeekDays } from '@/features/agenda/calendar/week';
import { DaySummaryTicket } from '@/features/agenda/day-summary/DaySummaryTicket';
import { WeekSummaryTicket } from '@/features/agenda/day-summary/WeekSummaryTicket';
import { formatDaySummaryDate } from '@/features/agenda/day-summary/day-summary-receipt';
import { formatWeekSummaryRange } from '@/features/agenda/day-summary/week-summary-receipt';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { BusinessInsightsTicket } from '@/features/insights/BusinessInsightsTicket';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { estimationIcon } from '@/shared/icons/estimation-icon';
import { insightsIcon } from '@/shared/icons/insights-icon';
import type { PlatformSymbolName } from '@/shared/icons/payment-method-icons';
import { formatCompactEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  bottomClearance,
  foregroundSoft,
  gutter,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { HomeCollectionSummary } from './components/HomeCollectionSummary';
import { HomeHeader } from './components/HomeHeader';
import { HomeKpiCard } from './components/HomeKpiCard';
import { HomeQuickAction } from './components/HomeQuickAction';
import { HOME_TOOL_ROW_SEPARATOR_INSET, HomeToolRow } from './components/HomeToolRow';
import { HomeWeekSummary } from './components/HomeWeekSummary';
import { NextAppointmentCard } from './components/NextAppointmentCard';
import { formatHomeGreeting, getNextAppointment } from './presentation';

const statIcons = {
  appointments: { ios: 'calendar', android: 'calendar_today' },
  potential: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up' },
} as const satisfies Record<string, PlatformSymbolName>;

// The glyphs of the same actions on the Agenda, Clientèle and Produits tabs.
const actionIcons = {
  appointment: { ios: 'calendar.badge.plus', android: 'event' },
  client: { ios: 'person.badge.plus', android: 'person_add' },
  product: { ios: 'shippingbox', android: 'inventory_2' },
  sale: { ios: 'bag', android: 'shopping_bag' },
} as const satisfies Record<string, PlatformSymbolName>;

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
const bottomPadding = Platform.OS === 'android' ? bottomClearance.android : bottomClearance.ios;

export function HomeScreen() {
  const router = useRouter();
  const { appointments, deposits } = useAppointmentSession();
  const { sales } = useSaleSession();
  const { getClientById } = useClientSession();
  // The device clock, never frozen at mount: refreshed on focus, on return
  // from background and every minute, so « today » and « next » stay true.
  const [now, setNow] = useState(() => new Date());
  const [addClientVisible, setAddClientVisible] = useState(false);
  const [daySummaryVisible, setDaySummaryVisible] = useState(false);
  const [weekSummaryVisible, setWeekSummaryVisible] = useState(false);
  const [insightsVisible, setInsightsVisible] = useState(false);

  const refreshNow = useCallback(() => setNow(new Date()), []);
  useFocusEffect(refreshNow);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshNow();
    });
    const timer = setInterval(refreshNow, 60_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [refreshNow]);

  const sources = { appointments: appointments.map((entry) => entry.appointment), sales, deposits };
  const summary = getAppointmentDaySummary(sources, now);
  // The Agenda week of today: the same seven days as « Résumé de la semaine ».
  const weekDays = getWeekDays(now);
  const weekSummary = getAppointmentPeriodSummary(sources, {
    firstDay: weekDays[0],
    lastDay: weekDays[6],
  });
  const next = getNextAppointment(appointments, now);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']} testID="home-screen">
      <ScrollView
        // The native tab bar overlays the page: the system bottom inset keeps
        // the last row scrollable above it.
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <HomeHeader dateLabel={formatDaySummaryDate(now)} greeting={formatHomeGreeting(now)} />

          {next ? (
            <NextAppointmentCard
              appointment={next.appointment}
              client={getClientById(next.appointment.clientId)}
              now={now}
              onPress={() =>
                router.push({
                  pathname: '/appointments/[appointmentId]',
                  params: { appointmentId: next.appointment.id },
                })
              }
            />
          ) : (
            // Nothing to come: one quiet line, never a hero-sized empty card.
            <View accessible style={styles.emptyNext} testID="home-next-appointment-empty">
              <SymbolView
                name={statIcons.appointments}
                size={16}
                tintColor={semanticColors.foregroundMuted}
              />
              <AppText variant="metadata" style={styles.emptyNextText}>
                Aucun rendez-vous à venir.
              </AppText>
            </View>
          )}

          <View>
            <SectionHeader style={styles.sectionHeader} title="Aujourd’hui">
              <SectionLink
                label="Résumé du jour"
                onPress={() => setDaySummaryVisible(true)}
                testID="home-day-summary"
              />
            </SectionHeader>
            <View style={styles.figures}>
              <View style={styles.row}>
                <HomeKpiCard
                  accessibilityLabel="Rendez-vous aujourd’hui"
                  icon={statIcons.appointments}
                  label="Rendez-vous"
                  testID="home-stat-appointments"
                  value={String(summary.appointmentCount)}
                />
                <HomeKpiCard
                  accessibilityLabel="CA potentiel aujourd’hui"
                  icon={statIcons.potential}
                  label="CA potentiel"
                  testID="home-stat-potential"
                  value={formatCompactEuroCents(summary.potentialRevenueCents)}
                />
              </View>
              <HomeCollectionSummary
                collected={formatCompactEuroCents(summary.collectedCents)}
                remaining={formatCompactEuroCents(summary.remainingToCollectCents)}
              />
            </View>
          </View>

          <View>
            <SectionHeader style={styles.sectionHeader} title="Actions rapides" />
            <View style={styles.row} testID="home-quick-actions">
              <HomeQuickAction
                accessibilityLabel="Nouveau rendez-vous"
                icon={actionIcons.appointment}
                label="Rendez-vous"
                onPress={() => router.push('/appointments/new')}
                testID="home-new-appointment"
              />
              <HomeQuickAction
                accessibilityLabel="Ajouter un client"
                icon={actionIcons.client}
                label="Client"
                onPress={() => setAddClientVisible(true)}
                testID="home-new-client"
              />
              <HomeQuickAction
                accessibilityLabel="Ajouter un produit"
                icon={actionIcons.product}
                plusBadge
                label="Produit"
                onPress={() => router.push('/products/new')}
                testID="home-new-product"
              />
              <HomeQuickAction
                accessibilityLabel="Nouvelle vente"
                icon={actionIcons.sale}
                plusBadge
                label="Vente"
                onPress={() => router.push('/sales/new')}
                testID="home-new-sale"
              />
            </View>
          </View>

          <View>
            <SectionHeader style={styles.sectionHeader} title="Cette semaine">
              <SectionLink
                label="Résumé de la semaine"
                onPress={() => setWeekSummaryVisible(true)}
                testID="home-week-summary-link"
              />
            </SectionHeader>
            <HomeWeekSummary
              appointmentCount={weekSummary.appointmentCount}
              collected={formatCompactEuroCents(weekSummary.collectedCents)}
              potential={formatCompactEuroCents(weekSummary.potentialRevenueCents)}
              rangeLabel={formatWeekSummaryRange(weekDays[0])}
            />
          </View>

          <View>
            <SectionHeader style={styles.sectionHeader} title="Pilotage" />
            <GroupedSurface style={styles.tools} testID="home-tools">
              <HomeToolRow
                description="Chiffrer des prestations pour un client"
                icon={estimationIcon}
                onPress={() => router.push('/estimations/new')}
                testID="home-estimation"
                title="Créer une estimation"
              />
              <GroupedSeparator inset={HOME_TOOL_ROW_SEPARATOR_INSET} />
              <HomeToolRow
                description="Voir ce qui fonctionne le mieux"
                icon={insightsIcon}
                onPress={() => setInsightsVisible(true)}
                testID="home-insights"
                title="Tops & tendances"
              />
            </GroupedSurface>
          </View>
        </View>
      </ScrollView>

      <ClientFormSheet
        mode="create"
        onClose={() => setAddClientVisible(false)}
        onSubmitted={() => setAddClientVisible(false)}
        visible={addClientVisible}
      />
      <DaySummaryTicket
        day={now}
        onClose={() => setDaySummaryVisible(false)}
        visible={daySummaryVisible}
      />
      <WeekSummaryTicket
        day={now}
        onClose={() => setWeekSummaryVisible(false)}
        visible={weekSummaryVisible}
      />
      <BusinessInsightsTicket
        anchor={now}
        onClose={() => setInsightsVisible(false)}
        visible={insightsVisible}
      />
    </SafeAreaView>
  );
}

/** The quiet accent link facing a section title; it opens an existing summary. */
function SectionLink({
  label,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
      testID={testID}
    >
      <AppText variant="control" style={styles.linkText}>
        {label}
      </AppText>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={12}
        tintColor={semanticColors.accent}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screen, flex: 1 },
  scrollContent: { paddingBottom: bottomPadding, paddingTop: spacing.base },
  content: { gap: spacing.xl, paddingHorizontal: horizontalGutter },
  sectionHeader: { marginBottom: spacing.sm },
  figures: { gap: spacing.sm },
  // Borderless like every other card of the page.
  tools: { borderWidth: 0 },
  row: { flexDirection: 'row', gap: spacing.sm },
  emptyNext: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  emptyNextText: { color: foregroundSoft },
  link: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  linkPressed: { opacity: interaction.pressedOpacity },
  linkText: { color: semanticColors.accent },
});
