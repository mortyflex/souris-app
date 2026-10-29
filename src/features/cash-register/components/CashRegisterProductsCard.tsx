// BeautIzzy — Caisse « Produits vendus » card
//
// One restrained grouped card under the card / cash breakdown
// (DESIGN_OVERRIDES.md §31): the product UNITS sold over the selected period
// (quantities, standalone Sales and Reventes alike), where they were sold
// when some were sold during an Appointment, the unit trend of the Month
// view (a tap switches it between units and percent, units first), and the
// money received for DIRECT product sales — exactly the Caisse « Vente »
// entries of the period. No product amount is ever derived from an
// Appointment checkout: that checkout records services and products as ONE
// received amount, and a sentence says so whenever Reventes are counted.
// Absent when the period sold nothing and has no unit trend to report.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import type { CashRegisterProductSummary, CashRegisterTrend } from '@/domain/cash-register';
import { saleIcon } from '@/shared/icons/sale-icon';
import { formatEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

import {
  describeCashRegisterTrend,
  formatProductUnitCount,
  formatProductUnitSplit,
} from '../presentation';
import { useCashRegisterTrendDisplay } from '../use-cash-register-trend-display';
import { CashRegisterTrendRow, CashRegisterTrendToggle } from './CashRegisterTrendBadge';

export const PRODUCTS_TITLE = 'Produits vendus';
export const DIRECT_SALES_LABEL = 'Ventes directes encaissées';
export const REVENTE_NOTE = 'Les produits vendus pendant un rendez-vous sont encaissés avec celui-ci.';

interface CashRegisterProductsCardProps {
  readonly summary: CashRegisterProductSummary;
  /** Month view only: units against the equivalent span of the previous month. */
  readonly unitTrend?: CashRegisterTrend;
  readonly testID: string;
}

export function CashRegisterProductsCard({ summary, unitTrend, testID }: CashRegisterProductsCardProps) {
  const trendDisplay = useCashRegisterTrendDisplay('units', [unitTrend]);
  if (summary.unitCount === 0 && unitTrend === undefined) return null;

  const units = formatProductUnitCount(summary.unitCount);
  const split = formatProductUnitSplit(summary);
  const direct = formatEuroCents(summary.standaloneCollectedCents);
  const summaryLabel = [
    `${PRODUCTS_TITLE}, ${units}`,
    ...(split ? [split] : []),
    ...(unitTrend ? [describeCashRegisterTrend(unitTrend, 'units', trendDisplay.display)] : []),
  ].join('. ');
  const directLabel = [
    `${DIRECT_SALES_LABEL} : ${direct}`,
    ...(summary.appointmentUnitCount > 0 ? [REVENTE_NOTE] : []),
  ].join('. ');

  return (
    <GroupedSurface testID={testID}>
      <View
        accessible
        accessibilityLabel={summaryLabel}
        {...trendDisplay.accessibilityProps}
        style={styles.summary}
        testID={`${testID}-summary`}
      >
        <View style={styles.titleRow}>
          <View style={styles.icon}>
            <SymbolView name={saleIcon} size={17} tintColor={semanticColors.accent} />
          </View>
          <AppText style={styles.title} variant="metadata">
            {PRODUCTS_TITLE}
          </AppText>
        </View>
        <View style={styles.valueRow}>
          <AppText selectable style={styles.units} testID={`${testID}-units`} variant="summaryValue">
            {units}
          </AppText>
          {unitTrend && (
            <CashRegisterTrendToggle onToggle={trendDisplay.toggle} testID={`${testID}-trend-toggle`}>
              <CashRegisterTrendRow
                display={trendDisplay.display}
                testID={`${testID}-trend`}
                toggleable={trendDisplay.toggle !== undefined}
                trend={unitTrend}
                unit="units"
              />
            </CashRegisterTrendToggle>
          )}
        </View>
        {split && (
          <AppText style={styles.split} testID={`${testID}-split`} variant="metadata">
            {split}
          </AppText>
        )}
      </View>
      <GroupedSeparator inset={spacing.base} />
      <View accessible accessibilityLabel={directLabel} style={styles.direct} testID={`${testID}-direct`}>
        <View style={styles.directRow}>
          <AppText style={styles.directLabel} variant="body">
            {DIRECT_SALES_LABEL}
          </AppText>
          <AppText selectable style={styles.directValue} testID={`${testID}-direct-value`} variant="control">
            {direct}
          </AppText>
        </View>
        {summary.appointmentUnitCount > 0 && (
          <AppText style={styles.note} testID={`${testID}-note`} variant="metadata">
            {REVENTE_NOTE}
          </AppText>
        )}
      </View>
    </GroupedSurface>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  // The same small lavender tile as the payment methods.
  icon: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  title: { color: foregroundSoft, flexShrink: 1 },
  // The figure first; the badge and its caption follow, or wrap under it.
  valueRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
  },
  units: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  split: { color: foregroundSoft },
  direct: {
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  directRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.xs,
  },
  directLabel: { color: foregroundSoft, flexShrink: 1 },
  directValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  note: { color: foregroundSoft },
});
