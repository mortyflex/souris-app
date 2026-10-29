// BeautIzzy — Caisse (Cash Register)
//
// In ONE glance: the money ACTUALLY received on the selected local day or
// calendar month — « Total encaissé », its card / cash split, then the
// « Encaissements » that make it up. Derived on every render from the
// canonical sessions — explicit Appointment checkouts (`appointment.payment`,
// the final checkout only), standalone Sale payments (`sale.payment`, Sales
// without Appointment) and ACTIVE Appointment deposits, each on the day the
// money was received (`paidAt`) — a deposit paid on the 22nd counts on the
// 22nd, never again on the Appointment day. A VOIDED deposit counts nowhere.
// A Sale sold during an Appointment is never counted separately: the
// Appointment checkout already recorded that money. Totals and list come
// from the same domain selection, so a listed payment is always a counted
// one. Next to the « Encaissements » count, a second pill counts the DISTINCT
// identified clients behind those same entries (`countCashRegisterPayingClients`,
// stable ids): a client who paid a service and bought products in the period
// counts once; a walk-in Sale counts nobody. Nothing is stored, cached or
// charted; planned or potential revenue belongs to « Résumé du jour », never
// here.
//
// Mois adds two derived readings (`getCashRegisterMonthInsights`, the SAME
// selection over explicit local windows): under « Total encaissé », how the
// month compares with the equivalent span of the previous month (and, quietly,
// of the same month a year earlier) — month-to-date against the same elapsed
// days and time, a completed month against the whole previous month. When no
// comparison can be offered for a month that collected money, one quiet
// sentence says why (the history does not cover the reference month, or the
// reference month has no such day); an empty month, a future month or two
// empty spans say nothing. And a « Produits vendus » card: the units sold
// (quantities, Reventes included), their unit trend, and the money received for
// DIRECT sales only. Jour shows the day's products without any comparison.
//
// The day is chosen through the shared month calendar (the Agenda's), each
// day haloed by the money received on it relative to the best day of the
// displayed month — from `getCashRegisterDailyTotals`, the same selection
// and arithmetic as the day summary, so calendar and detail never disagree.
// On its first opening, a compact card explains the halos (until « Compris »,
// remembered on this device only); a quiet ⓘ under the grid reopens it.

import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  countCashRegisterPayingClients,
  getCashRegisterDailyTotals,
  getCashRegisterDayEntries,
  getCashRegisterDayProductSummary,
  getCashRegisterDaySummary,
  getCashRegisterEntryClientId,
  getCashRegisterMonthEntries,
  getCashRegisterMonthInsights,
  getCashRegisterMonthSummary,
  type CashRegisterEntry,
  type CashRegisterSummary,
} from "@/domain/cash-register";
import { useAppointmentSession } from "@/features/appointments/session/AppointmentSessionProvider";
import { getResolvedClientDisplayName } from "@/features/clients/presentation";
import { useClientSession } from "@/features/clients/session/ClientSessionProvider";
import { useSaleSession } from "@/features/sales/session/SaleSessionProvider";
import { usePersistence } from "@/providers/PersistenceProvider";
import {
  cashRegisterIcon,
  paymentMethodIcons,
  paymentMethodLabels,
  type PaymentMethod,
} from "@/shared/icons/payment-method-icons";
import { formatEuroCents } from "@/shared/lib/money";
import { AppText } from "@/shared/ui/AppText";
import { DateNavigator } from "@/shared/ui/DateNavigator";
import { GroupedSeparator, GroupedSurface } from "@/shared/ui/GroupedSurface";
import { MonthCalendarSheet } from "@/shared/ui/MonthCalendarSheet";
import {
  PeriodNavigator,
  PeriodNavigatorCopy,
  PeriodNavigatorLink,
  PeriodNavigatorNote,
} from "@/shared/ui/PeriodNavigator";
import {
  GlassIconButton,
  glassIconButtonSize,
  glassIcons,
} from "@/shared/ui/GlassIconButton";
import { PushedScreenWatermark } from "@/shared/ui/ScreenWatermarkIcon";
import { SectionCountChip, SectionHeader } from "@/shared/ui/SectionHeader";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import {
  foregroundSoft,
  gutter,
  radii,
  semanticColors,
  spacing,
} from "@/shared/ui/theme";

import {
  CashRegisterEntryRow,
  CASH_REGISTER_ENTRY_SEPARATOR_INSET,
  getCashRegisterEntryKey,
} from "./components/CashRegisterEntryRow";
import { CashRegisterProductsCard } from "./components/CashRegisterProductsCard";
import {
  CashRegisterComparisonNote,
  CashRegisterTrendNote,
  CashRegisterTrendRow,
} from "./components/CashRegisterTrendBadge";
import {
  RevenueHeatmapHint,
  RevenueHeatmapInfoButton,
} from "./components/RevenueHeatmapHint";
import {
  hasSeenCashRegisterHeatmapHint,
  markCashRegisterHeatmapHintSeen,
} from "./heatmap-hint";
import {
  describeCashRegisterComparisonUnavailability,
  describeCashRegisterTrend,
  formatCashRegisterCaption,
  formatCashRegisterEmptyTitle,
  formatCashRegisterMonth,
  formatCheckoutCount,
  formatPayingClientCount,
  isSameLocalDay,
  isSameLocalMonth,
  shiftLocalDay,
  shiftLocalMonth,
  startOfLocalDay,
  startOfLocalMonth,
  type CashRegisterPeriod,
} from "./presentation";
import { decorateRevenueMonth } from "./revenue-calendar";

const horizontalGutter =
  Platform.OS === "android" ? gutter.android : gutter.ios;

const PERIOD_OPTIONS = [
  { value: "day", label: "Jour" },
  { value: "month", label: "Mois" },
] as const;

/** The breakdown lists every method the checkout records, in this order. */
const PAYMENT_METHODS: readonly PaymentMethod[] = ["CARD", "CASH"];

const EMPTY_SUPPORTING_COPY = "Les paiements encaissés apparaîtront ici.";

export function CashRegisterScreen() {
  const router = useRouter();
  const { appointments, deposits } = useAppointmentSession();
  const { sales } = useSaleSession();
  const { getClientById } = useClientSession();
  const [period, setPeriod] = useState<CashRegisterPeriod>("day");
  const [selectedDay, setSelectedDay] = useState(() =>
    startOfLocalDay(new Date()),
  );
  const [selectedMonth, setSelectedMonth] = useState(() =>
    startOfLocalMonth(new Date()),
  );
  const [monthCalendarVisible, setMonthCalendarVisible] = useState(false);
  const { database } = usePersistence();
  // Read once per mount; written only by « Compris ».
  const [heatmapHintSeen, setHeatmapHintSeen] = useState(() =>
    hasSeenCashRegisterHeatmapHint(database),
  );
  const [heatmapHintVisible, setHeatmapHintVisible] = useState(false);
  const heatmapInfoRef = useRef<View>(null);

  // Every opening shows the hint until it has been understood once.
  const openMonthCalendar = () => {
    setHeatmapHintVisible(!heatmapHintSeen);
    setMonthCalendarVisible(true);
  };
  const closeMonthCalendar = () => {
    setMonthCalendarVisible(false);
    setHeatmapHintVisible(false);
  };
  // Hides the card only: the calendar, its month and the selected day stay.
  const dismissHeatmapHint = () => {
    if (!heatmapHintSeen) {
      markCashRegisterHeatmapHintSeen(database);
      setHeatmapHintSeen(true);
    }
    setHeatmapHintVisible(false);
    // Focus returns to the control that reopens it.
    requestAnimationFrame(() => {
      if (heatmapInfoRef.current) {
        AccessibilityInfo.sendAccessibilityEvent(heatmapInfoRef.current, "focus");
      }
    });
  };

  const now = new Date();
  const sources = useMemo(
    () => ({
      appointments: appointments.map(({ appointment }) => appointment),
      sales,
      deposits,
    }),
    [appointments, sales, deposits],
  );
  // ONE pass over the counted payments per data change, never a query per day.
  const dailyTotals = useMemo(() => getCashRegisterDailyTotals(sources), [sources]);
  const decorateCalendarMonth = useCallback(
    (month: Date) => decorateRevenueMonth(dailyTotals, month),
    [dailyTotals],
  );
  const summary: CashRegisterSummary =
    period === "day"
      ? getCashRegisterDaySummary(sources, selectedDay)
      : getCashRegisterMonthSummary(sources, selectedMonth);
  const entries =
    period === "day"
      ? getCashRegisterDayEntries(sources, selectedDay)
      : getCashRegisterMonthEntries(sources, selectedMonth);
  // Over the period's entries: exactly the payments the totals count.
  const payingClientCount = countCashRegisterPayingClients(entries);
  const isCurrentPeriod =
    period === "day"
      ? isSameLocalDay(selectedDay, now)
      : isSameLocalMonth(selectedMonth, now);

  const shiftDay = (amount: number) =>
    setSelectedDay((current) => shiftLocalDay(current, amount));
  const shiftMonth = (amount: number) =>
    setSelectedMonth((current) => shiftLocalMonth(current, amount));

  // Mois: the comparisons and the month's products; Jour: the day's products
  // only (no daily comparison — see docs/product/PRODUCT.md, Caisse).
  const monthInsights =
    period === "month"
      ? getCashRegisterMonthInsights(sources, selectedMonth, now)
      : undefined;
  const products =
    monthInsights?.products ??
    getCashRegisterDayProductSummary(sources, selectedDay);
  const cashTrend = monthInsights?.cashTrend;
  const cashYearTrend = monthInsights?.cashYearTrend;
  // Why Mois shows no comparison — only for a month that collected something:
  // an empty month explains nothing, and browsing empty history stays silent.
  const comparisonNote =
    monthInsights !== undefined && summary.checkoutCount > 0
      ? describeCashRegisterComparisonUnavailability(monthInsights.cashComparison, now)
      : undefined;

  const caption = formatCashRegisterCaption(period, isCurrentPeriod);
  const total = formatEuroCents(summary.totalCents);
  // Spoken with the KPI, direction in words: « Total encaissé ce mois-ci :
  // 1 240,00 €. En hausse de 12,4 % par rapport à la période du 1er au 29 septembre ».
  const totalLabel = [
    `Total ${caption} : ${total}`,
    ...(cashTrend ? [describeCashRegisterTrend(cashTrend, "cents")] : []),
    ...(cashYearTrend ? [describeCashRegisterTrend(cashYearTrend, "cents")] : []),
    ...(comparisonNote ? [comparisonNote] : []),
  ].join(". ");

  const clientNameOf = (entry: CashRegisterEntry): string | undefined => {
    const clientId = getCashRegisterEntryClientId(entry);
    return clientId === undefined
      ? undefined
      : getResolvedClientDisplayName(getClientById(clientId));
  };
  // An Appointment checkout and a deposit open their Appointment Details; a
  // standalone Sale has no detail screen.
  const openEntry = (entry: CashRegisterEntry) => {
    const appointmentId = entry.kind === "SALE" ? undefined : entry.appointment?.id;
    return appointmentId === undefined
      ? undefined
      : () =>
          router.push({
            pathname: "/appointments/[appointmentId]",
            params: { appointmentId },
          });
  };

  return (
    <SafeAreaView
      edges={["top"]}
      style={styles.safeArea}
      testID="cash-register-screen"
    >
      <View style={styles.topBar}>
        <GlassIconButton
          accessibilityLabel="Retour"
          icon={glassIcons.back}
          onPress={() => router.back()}
        />
        <AppText variant="eyebrow" style={styles.eyebrow}>
          GESTION
        </AppText>
        <View style={styles.topBarSpacer} />
      </View>
      <PushedScreenWatermark kind="cashRegister" titleOffset={spacing.sm} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AppText accessibilityRole="header" variant="screenTitle">
          Caisse
        </AppText>

        <SegmentedControl
          onChange={setPeriod}
          options={PERIOD_OPTIONS}
          testID="cash-register-period"
          value={period}
        />

        {period === "day" ? (
          // The SAME selected day drives the summary below: arrows and
          // calendar are two ways to reach one state.
          <DateNavigator
            date={selectedDay}
            isToday={isCurrentPeriod}
            onGoToToday={() => setSelectedDay(startOfLocalDay(new Date()))}
            onNext={() => shiftDay(1)}
            onOpenCalendar={openMonthCalendar}
            onPressDate={openMonthCalendar}
            onPrevious={() => shiftDay(-1)}
            testID="cash-register"
          />
        ) : (
          <PeriodNavigator
            nextLabel="Mois suivant"
            onNext={() => shiftMonth(1)}
            onPrevious={() => shiftMonth(-1)}
            previousLabel="Mois précédent"
            testID="cash-register"
          >
            <PeriodNavigatorCopy
              secondary={
                isCurrentPeriod ? (
                  <PeriodNavigatorNote testID="cash-register-this-month">
                    Ce mois-ci
                  </PeriodNavigatorNote>
                ) : (
                  <PeriodNavigatorLink
                    label="Revenir à ce mois-ci"
                    onPress={() =>
                      setSelectedMonth(startOfLocalMonth(new Date()))
                    }
                    testID="cash-register-current"
                  />
                )
              }
              title={formatCashRegisterMonth(selectedMonth)}
              titleTestID="cash-register-period-label"
            />
          </PeriodNavigator>
        )}

        <View
          accessible
          accessibilityLabel={totalLabel}
          style={styles.totalCard}
          testID="cash-register-total-card"
        >
          <AppText variant="body" style={styles.totalLabel}>
            Total encaissé
          </AppText>
          <AppText
            selectable
            style={styles.totalValue}
            testID="cash-register-total"
            variant="display"
          >
            {total}
          </AppText>
          {(cashTrend !== undefined ||
            cashYearTrend !== undefined ||
            comparisonNote !== undefined) && (
            <View style={styles.totalTrends} testID="cash-register-trends">
              {cashTrend && (
                <CashRegisterTrendRow
                  testID="cash-register-trend"
                  trend={cashTrend}
                  unit="cents"
                />
              )}
              {cashYearTrend && (
                <CashRegisterTrendNote
                  testID="cash-register-trend-year"
                  trend={cashYearTrend}
                  unit="cents"
                />
              )}
              {comparisonNote && (
                <CashRegisterComparisonNote testID="cash-register-comparison-note">
                  {comparisonNote}
                </CashRegisterComparisonNote>
              )}
            </View>
          )}
        </View>

        <GroupedSurface style={styles.methods} testID="cash-register-methods">
          {PAYMENT_METHODS.map((method, index) => (
            <View key={method} style={styles.methodColumn}>
              {index > 0 && <View style={styles.methodDivider} />}
              <MethodCell
                cents={
                  method === "CARD" ? summary.cardCents : summary.cashCents
                }
                method={method}
              />
            </View>
          ))}
        </GroupedSurface>

        <CashRegisterProductsCard
          summary={products}
          testID="cash-register-products"
          unitTrend={monthInsights?.productUnitTrend}
        />

        <View style={styles.entriesSection}>
          <View
            accessible
            accessibilityLabel={`Encaissements, ${formatCheckoutCount(summary.checkoutCount)}, ${formatPayingClientCount(payingClientCount)}`}
            accessibilityRole="header"
            testID="cash-register-count"
          >
            <SectionHeader
              count={summary.checkoutCount}
              style={styles.entriesHeader}
              title="Encaissements"
            >
              <View style={styles.clientCounter} testID="cash-register-client-count">
                <AppText variant="metadata" style={styles.clientCounterLabel}>
                  Clients
                </AppText>
                <SectionCountChip
                  count={payingClientCount}
                  testID="cash-register-client-count-value"
                />
              </View>
            </SectionHeader>
          </View>

          {entries.length === 0 ? (
            <View
              accessible
              accessibilityLabel={`${formatCashRegisterEmptyTitle(period, isCurrentPeriod)}. ${EMPTY_SUPPORTING_COPY}`}
              style={styles.emptyState}
              testID="cash-register-empty"
            >
              <View style={styles.emptyIcon}>
                <SymbolView
                  name={cashRegisterIcon}
                  size={20}
                  tintColor={semanticColors.accent}
                />
              </View>
              <AppText variant="control" style={styles.emptyTitle}>
                {formatCashRegisterEmptyTitle(period, isCurrentPeriod)}
              </AppText>
              <AppText variant="metadata" style={styles.emptyCopy}>
                {EMPTY_SUPPORTING_COPY}
              </AppText>
            </View>
          ) : (
            <GroupedSurface testID="cash-register-entries">
              {entries.map((entry, index) => (
                <View
                  key={getCashRegisterEntryKey(entry)}
                >
                  {index > 0 && (
                    <GroupedSeparator
                      inset={CASH_REGISTER_ENTRY_SEPARATOR_INSET}
                    />
                  )}
                  <CashRegisterEntryRow
                    clientName={clientNameOf(entry)}
                    entry={entry}
                    onPress={openEntry(entry)}
                    period={period}
                  />
                </View>
              ))}
            </GroupedSurface>
          )}
        </View>
      </ScrollView>

      <MonthCalendarSheet
        day={selectedDay}
        decorateMonth={decorateCalendarMonth}
        footer={
          <RevenueHeatmapInfoButton
            onPress={() => setHeatmapHintVisible(true)}
            ref={heatmapInfoRef}
            testID="cash-register-heatmap-info"
          />
        }
        gridOverlay={
          <RevenueHeatmapHint
            onDismiss={dismissHeatmapHint}
            testID="cash-register-heatmap-hint"
            visible={heatmapHintVisible}
          />
        }
        onClose={closeMonthCalendar}
        onSelect={(day) => {
          setSelectedDay(day);
          closeMonthCalendar();
        }}
        testID="cash-register-month-calendar"
        today={startOfLocalDay(now)}
        visible={monthCalendarVisible}
      />
    </SafeAreaView>
  );
}

function MethodCell({
  method,
  cents,
}: {
  readonly method: PaymentMethod;
  readonly cents: number;
}) {
  const label = paymentMethodLabels[method];
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${formatEuroCents(cents)}`}
      style={styles.methodCell}
      testID={`cash-register-${method.toLowerCase()}`}
    >
      <View style={styles.methodIcon}>
        <SymbolView
          name={paymentMethodIcons[method]}
          size={17}
          tintColor={semanticColors.accent}
        />
      </View>
      <AppText variant="metadata" style={styles.methodLabel}>
        {label}
      </AppText>
      <AppText
        variant="summaryValue"
        numberOfLines={1}
        selectable
        style={styles.methodValue}
      >
        {formatEuroCents(cents)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: horizontalGutter,
    paddingVertical: spacing.sm,
  },
  // Mirrors the back button so the eyebrow stays centred.
  topBarSpacer: { height: glassIconButtonSize, width: glassIconButtonSize },
  eyebrow: { color: semanticColors.accent },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing["3xl"],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  // A primary white card on the app background (DESIGN_OVERRIDES.md §39).
  totalCard: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: "continuous",
    borderRadius: radii.large,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  totalLabel: { color: foregroundSoft },
  totalValue: {
    color: semanticColors.foreground,
    fontVariant: ["tabular-nums"],
  },
  // The comparison under the amount: the badge row, then the quiet year line.
  totalTrends: { gap: spacing.sm, marginTop: spacing.xs },
  methods: { flexDirection: "row" },
  methodColumn: { flex: 1, flexDirection: "row", minWidth: 0 },
  methodDivider: {
    alignSelf: "stretch",
    backgroundColor: semanticColors.borderSubtle,
    marginVertical: spacing.base,
    width: StyleSheet.hairlineWidth,
  },
  methodCell: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
  },
  methodIcon: {
    alignItems: "center",
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: "continuous",
    borderRadius: radii.medium,
    height: 34,
    justifyContent: "center",
    marginBottom: spacing.xs,
    width: 34,
  },
  methodLabel: { color: foregroundSoft },
  methodValue: {
    color: semanticColors.foreground,
    fontVariant: ["tabular-nums"],
  },
  entriesSection: { gap: spacing.md, marginTop: spacing.xs },
  // Two counters after the title. On a narrow phone with large text the
  // counters wrap under the title as a group instead of truncating it.
  entriesHeader: {
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "flex-start",
  },
  // « Clients [n] »: a quiet label then the same chip as the Encaissements count.
  clientCounter: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  clientCounterLabel: { color: foregroundSoft },
  // Quieter than the figures: a white card, a small lavender glyph, two lines.
  emptyState: {
    alignItems: "center",
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: "continuous",
    borderRadius: radii.large,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: "center",
    marginBottom: spacing.xs,
    width: 44,
  },
  emptyTitle: { color: semanticColors.foreground, textAlign: "center" },
  emptyCopy: { color: foregroundSoft, textAlign: "center" },
});
