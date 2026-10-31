// BeautIzzy — Caisse sale history (« Produits vendus »)
//
// Every Product Sale completed over the selected local day or calendar month,
// newest first, opened from the Caisse « Produits vendus » card on the period
// the Caisse was showing. The SAME period controls as the Caisse (Jour | Mois,
// the shared DateNavigator with its month calendar, the grouped month
// navigator) and the SAME civil intervals (`getCashRegisterDayInterval`,
// `getCashRegisterMonthInterval`), so the units counted by the card and the
// Sales listed here always agree. Read-only: the Sale snapshots and the
// recorded payments are shown as stored — a direct Sale with its card / cash
// record, a Sale sold during an Appointment as paid with that Appointment, a
// historical Sale without record as « Non renseigné ». Nothing is stored,
// cached, recomputed from the catalog or edited here.
//
// Swipe (docs/design/DESIGN_OVERRIDES.md §48): a row of a Sale that offers
// actions reveals « Actions » when swiped to the right — a reveal only:
// tapping it opens the SAME « Actions de la vente » drawer as the Sale detail
// « ••• » (one drawer for the whole list), whose choices open the existing
// flows with their review and confirmation. No instruction sentence: the
// persistent lavender grip on each such row and the shared one-time peek on
// the first one (never under Reduce Motion) carry the gesture; VoiceOver users
// get the same action on the row, and the Sale detail always shows it as the
// « ••• » button.

import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCashRegisterDayInterval, getCashRegisterMonthInterval } from '@/domain/cash-register';
import {
  isEffectiveSaleRefund,
  getSaleAdjustmentPosition,
  getSaleAdjustments,
  listSaleHistory,
  summarizeSaleHistory,
  type SaleHistoryEntry,
} from '@/domain/sales';
import {
  formatCashRegisterMonth,
  isSameLocalDay,
  isSameLocalMonth,
  shiftLocalDay,
  shiftLocalMonth,
  startOfLocalDay,
  startOfLocalMonth,
  type CashRegisterPeriod,
} from '@/features/cash-register/presentation';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { saleIcon } from '@/shared/icons/sale-icon';
import { AppText } from '@/shared/ui/AppText';
import { DateNavigator } from '@/shared/ui/DateNavigator';
import { GroupedSeparator } from '@/shared/ui/GroupedSurface';
import { MonthCalendarSheet } from '@/shared/ui/MonthCalendarSheet';
import {
  PeriodNavigator,
  PeriodNavigatorCopy,
  PeriodNavigatorLink,
  PeriodNavigatorNote,
} from '@/shared/ui/PeriodNavigator';
import { PushedScreenWatermark } from '@/shared/ui/ScreenWatermarkIcon';
import { SectionCountChip, SectionHeader } from '@/shared/ui/SectionHeader';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { SwipeActionRow, useSwipeActionHintTarget } from '@/shared/ui/SwipeActionRow';
import { groupedListItemStyle } from '@/shared/ui/grouped-list';
import { bottomClearance, foregroundSoft, gutter, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { SaleActionsSheet } from '../adjustments/SaleActionsSheet';
import { getSaleActions } from '../adjustments/sale-actions';
import { useSaleSession } from '../session/SaleSessionProvider';
import {
  SALE_HISTORY_EMPTY_COPY,
  formatSaleCount,
  formatSaleHistoryEmptyTitle,
} from '../presentation';
import { SALE_HISTORY_ROW_SEPARATOR_INSET, SaleHistoryRow } from './SaleHistoryRow';
import { SaleHistoryTopBar } from './SaleHistoryTopBar';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const PERIOD_OPTIONS = [
  { value: 'day', label: 'Jour' },
  { value: 'month', label: 'Mois' },
] as const;

export const SALES_HISTORY_TITLE = 'Produits vendus';

interface SalesHistoryScreenProps {
  /** The period the Caisse was showing; Day on today by default. */
  readonly initialPeriod?: CashRegisterPeriod;
  /** Local midnight of the selected day, or of the 1st of the selected month. */
  readonly initialDate?: Date;
}

export function SalesHistoryScreen({ initialPeriod = 'day', initialDate }: SalesHistoryScreenProps) {
  const router = useRouter();
  const { sales, saleAdjustments, isAppointmentSettled } = useSaleSession();
  const { getClientById } = useClientSession();
  const [period, setPeriod] = useState<CashRegisterPeriod>(initialPeriod);
  const [selectedDay, setSelectedDay] = useState(() => startOfLocalDay(initialDate ?? new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() => startOfLocalMonth(initialDate ?? new Date()));
  const [monthCalendarVisible, setMonthCalendarVisible] = useState(false);

  const now = new Date();
  const interval =
    period === 'day' ? getCashRegisterDayInterval(selectedDay) : getCashRegisterMonthInterval(selectedMonth);
  const entries = useMemo(() => listSaleHistory(sales, interval), [sales, interval]);
  const summary = summarizeSaleHistory(entries);
  const isCurrentPeriod =
    period === 'day' ? isSameLocalDay(selectedDay, now) : isSameLocalMonth(selectedMonth, now);

  const clientNameOf = (entry: SaleHistoryEntry): string | undefined =>
    entry.sale.clientId === undefined
      ? undefined
      : getResolvedClientDisplayName(getClientById(entry.sale.clientId));
  const openSale = (entry: SaleHistoryEntry) =>
    router.push({ pathname: '/sales/[saleId]', params: { saleId: entry.sale.id } });
  // ONE drawer for the whole list: the Sale whose actions are shown.
  const [actionsSale, setActionsSale] = useState<SaleHistoryEntry['sale']>();
  const [actionsVisible, setActionsVisible] = useState(false);
  const openActions = (entry: SaleHistoryEntry) => {
    if (actionsVisible) return;
    setActionsSale(entry.sale);
    setActionsVisible(true);
  };

  // THE selection of the Sale detail « ••• »: a row is swipeable exactly when it offers actions.
  const isAdjustable = (entry: SaleHistoryEntry) =>
    getSaleActions({
      sale: entry.sale,
      adjustments: saleAdjustments,
      appointmentSettled: entry.sale.appointmentId === undefined || isAppointmentSettled(entry.sale.appointmentId),
    }).length > 0;
  const statusOf = (entry: SaleHistoryEntry) => describeAdjustments(entry, saleAdjustments);
  const adjustable = entries.filter(isAdjustable);
  // ONE row per screen instance plays the peek: the first adjustable one present at mount.
  const hintTarget = useSwipeActionHintTarget(adjustable[0]?.sale.id);

  const header = (
    <View style={styles.header}>
      <AppText accessibilityRole="header" variant="screenTitle">
        {SALES_HISTORY_TITLE}
      </AppText>

      <SegmentedControl onChange={setPeriod} options={PERIOD_OPTIONS} testID="sales-history-period" value={period} />

      {period === 'day' ? (
        <DateNavigator
          date={selectedDay}
          isToday={isCurrentPeriod}
          onGoToToday={() => setSelectedDay(startOfLocalDay(new Date()))}
          onNext={() => setSelectedDay((current) => shiftLocalDay(current, 1))}
          onOpenCalendar={() => setMonthCalendarVisible(true)}
          onPressDate={() => setMonthCalendarVisible(true)}
          onPrevious={() => setSelectedDay((current) => shiftLocalDay(current, -1))}
          testID="sales-history"
        />
      ) : (
        <PeriodNavigator
          nextLabel="Mois suivant"
          onNext={() => setSelectedMonth((current) => shiftLocalMonth(current, 1))}
          onPrevious={() => setSelectedMonth((current) => shiftLocalMonth(current, -1))}
          previousLabel="Mois précédent"
          testID="sales-history"
        >
          <PeriodNavigatorCopy
            secondary={
              isCurrentPeriod ? (
                <PeriodNavigatorNote testID="sales-history-this-month">Ce mois-ci</PeriodNavigatorNote>
              ) : (
                <PeriodNavigatorLink
                  label="Revenir à ce mois-ci"
                  onPress={() => setSelectedMonth(startOfLocalMonth(new Date()))}
                  testID="sales-history-current"
                />
              )
            }
            title={formatCashRegisterMonth(selectedMonth)}
            titleTestID="sales-history-period-label"
          />
        </PeriodNavigator>
      )}

      <View
        accessible
        accessibilityLabel={`Ventes, ${formatSaleCount(summary.saleCount)}, ${formatUnitCount(summary.unitCount)}`}
        accessibilityRole="header"
        testID="sales-history-count"
      >
        <SectionHeader count={summary.saleCount} style={styles.sectionHeader} title="Ventes">
          <View style={styles.unitCounter} testID="sales-history-unit-count">
            <AppText variant="metadata" style={styles.unitCounterLabel}>
              Unités
            </AppText>
            <SectionCountChip count={summary.unitCount} testID="sales-history-unit-count-value" />
          </View>
        </SectionHeader>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea} testID="sales-history-screen">
      <SaleHistoryTopBar />
      <PushedScreenWatermark kind="cashRegister" titleOffset={spacing.sm} />

      <FlatList
        contentContainerStyle={styles.content}
        data={entries}
        initialNumToRender={20}
        keyExtractor={(entry) => entry.sale.id}
        ListEmptyComponent={
          <View
            accessible
            accessibilityLabel={`${formatSaleHistoryEmptyTitle(period, isCurrentPeriod)}. ${SALE_HISTORY_EMPTY_COPY}`}
            style={styles.emptyState}
            testID="sales-history-empty"
          >
            <View style={styles.emptyIcon}>
              <SymbolView name={saleIcon} size={20} tintColor={semanticColors.accent} />
            </View>
            <AppText variant="control" style={styles.emptyTitle}>
              {formatSaleHistoryEmptyTitle(period, isCurrentPeriod)}
            </AppText>
            <AppText variant="metadata" style={styles.emptyCopy}>
              {SALE_HISTORY_EMPTY_COPY}
            </AppText>
          </View>
        }
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <View style={groupedListItemStyle(index, entries.length)}>
            {index > 0 && <GroupedSeparator inset={SALE_HISTORY_ROW_SEPARATOR_INSET} />}
            {adjustable.includes(item) ? (
              <SwipeActionRow
                actionIcon={{ ios: 'ellipsis.circle', android: 'more_horiz' }}
                accessibilityActionLabel="Actions de la vente"
                actionLabel="Actions"
                actionTestID={`sale-history-actions-${item.sale.id}`}
                hint={item.sale.id === hintTarget}
                onAction={() => openActions(item)}
                surfaceColor={semanticColors.surfaceElevated}
                testID={`sale-history-swipe-${item.sale.id}`}
              >
                <SaleHistoryRow
                  adjustmentStatus={statusOf(item)}
                  clientName={clientNameOf(item)}
                  entry={item}
                  onPress={() => openSale(item)}
                  period={period}
                />
              </SwipeActionRow>
            ) : (
              <SaleHistoryRow
                adjustmentStatus={statusOf(item)}
                clientName={clientNameOf(item)}
                entry={item}
                onPress={() => openSale(item)}
                period={period}
              />
            )}
          </View>
        )}
        showsVerticalScrollIndicator={false}
        testID="sales-history-list"
      />

      <MonthCalendarSheet
        day={selectedDay}
        onClose={() => setMonthCalendarVisible(false)}
        onSelect={(day) => {
          setSelectedDay(day);
          setMonthCalendarVisible(false);
        }}
        testID="sales-history-month-calendar"
        today={startOfLocalDay(now)}
        visible={monthCalendarVisible}
      />

      <SaleActionsSheet onClose={() => setActionsVisible(false)} sale={actionsSale} visible={actionsVisible} />
    </SafeAreaView>
  );
}

/** What the corrections of a Sale amount to, in a few words; undefined without any. */
function describeAdjustments(
  entry: SaleHistoryEntry,
  allAdjustments: Parameters<typeof getSaleAdjustmentPosition>[1],
): string | undefined {
  const adjustments = getSaleAdjustments(allAdjustments, entry.sale.id).filter(
    (adjustment) => adjustment.status !== 'VOIDED',
  );
  // Refunds neutralised by a reversal no longer count.
  if (!adjustments.some((adjustment) => isEffectiveSaleRefund(adjustment, adjustments))) return undefined;
  const position = getSaleAdjustmentPosition(entry.sale, allAdjustments);
  if (position.pendingCents > 0) return 'Remboursement à effectuer';
  if (position.settledCents > 0) {
    return position.remainingCents === 0 ? 'Remboursée' : 'Remboursée en partie';
  }
  return 'Corrigée';
}

/** `Aucune unité` / `1 unité` / `12 unités` — spoken with the section header. */
function formatUnitCount(count: number): string {
  if (count === 0) return 'Aucune unité';
  return `${count} unité${count > 1 ? 's' : ''}`;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  content: {
    paddingBottom: bottomClearance[Platform.OS === 'android' ? 'android' : 'ios'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  header: { gap: spacing.lg, paddingBottom: spacing.md },
  sectionHeader: { flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-start', marginTop: spacing.xs },
  unitCounter: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  unitCounterLabel: { color: foregroundSoft },
  // The Caisse empty block: a white card, a small lavender glyph, two lines.
  emptyState: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 44,
  },
  emptyTitle: { color: semanticColors.foreground, textAlign: 'center' },
  emptyCopy: { color: foregroundSoft, textAlign: 'center' },
});
