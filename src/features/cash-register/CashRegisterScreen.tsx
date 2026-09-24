// Souris — Caisse (Cash Register)
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
// one. Nothing is stored, cached or charted; planned or potential revenue
// belongs to « Résumé du jour », never here.
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
  getCashRegisterDailyTotals,
  getCashRegisterDayEntries,
  getCashRegisterDaySummary,
  getCashRegisterMonthEntries,
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
import { SectionHeader } from "@/shared/ui/SectionHeader";
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
import {
  RevenueHeatmapHint,
  RevenueHeatmapInfoButton,
} from "./components/RevenueHeatmapHint";
import {
  hasSeenCashRegisterHeatmapHint,
  markCashRegisterHeatmapHintSeen,
} from "./heatmap-hint";
import {
  formatCashRegisterCaption,
  formatCashRegisterEmptyTitle,
  formatCashRegisterMonth,
  formatCheckoutCount,
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
  const isCurrentPeriod =
    period === "day"
      ? isSameLocalDay(selectedDay, now)
      : isSameLocalMonth(selectedMonth, now);

  const shiftDay = (amount: number) =>
    setSelectedDay((current) => shiftLocalDay(current, amount));
  const shiftMonth = (amount: number) =>
    setSelectedMonth((current) => shiftLocalMonth(current, amount));

  const caption = formatCashRegisterCaption(period, isCurrentPeriod);
  const total = formatEuroCents(summary.totalCents);

  const clientNameOf = (entry: CashRegisterEntry): string | undefined => {
    const clientId =
      entry.kind === "SALE" ? entry.sale.clientId : entry.appointment?.clientId;
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
          accessibilityLabel={`Total ${caption} : ${total}`}
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

        <View style={styles.entriesSection}>
          <View
            accessible
            accessibilityLabel={`Encaissements, ${formatCheckoutCount(summary.checkoutCount)}`}
            accessibilityRole="header"
            testID="cash-register-count"
          >
            <SectionHeader
              count={summary.checkoutCount}
              style={styles.entriesHeader}
              title="Encaissements"
            />
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
  totalCard: {
    backgroundColor: semanticColors.surfaceLavender,
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
  entriesHeader: { justifyContent: "flex-start", gap: spacing.sm },
  // Quieter than the figures: a light lavender band, a small glyph, two lines.
  emptyState: {
    alignItems: "center",
    backgroundColor: semanticColors.surfaceLavender,
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
