// BeautIzzy — DaySummaryReceipt
//
// The paper of « Résumé du jour » and « Résumé de la semaine »
// (DESIGN_OVERRIDES.md §25): a warm near-white slip with torn edges, read top
// to bottom like a receipt —
//
//   header     glyph, the title, the selected date or week, the count
//   list       day: one line per Appointment: time, services + client, amount
//              week: the outcome lines (Réalisés · Prévus · Annulés · Absences)
//   total      « CA potentiel » — THE strongest value of the paper
//   breakdown  Déjà encaissé · Reste à encaisser · Temps total · Panier moyen
//
//   footer     the BeautIzzy symbol, the closing signature, inside the paper
//
// It renders the receipt model as is and computes nothing. The paper is as
// tall as its content — nothing scrolls inside it: on a long day or a short
// screen the printer scrolls the whole receipt. BeautIzzy typography and
// tokens throughout — no texture, no grain, no serif.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { daySummaryIcon } from '@/shared/icons/day-summary-icon';
import { AppText } from '@/shared/ui/AppText';
import { BrandMark } from '@/shared/ui/BrandMark';
import { RECEIPT_SIGNATURE_SIZE, ReceiptPaper, ReceiptTearLine } from '@/shared/ui/ReceiptPaper';
import {
  foregroundSoft,
  lavender,
  mint,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type {
  DaySummaryReceiptActivity,
  DaySummaryReceiptModel,
  DaySummaryReceiptRow,
} from './day-summary-receipt';

interface DaySummaryReceiptProps {
  readonly model: DaySummaryReceiptModel;
  readonly width: number;
  /** Prefix of every testID: `day-summary` (default) or `week-summary`. */
  readonly testID?: string;
}

export function DaySummaryReceipt({
  model,
  width,
  testID = 'day-summary',
}: DaySummaryReceiptProps) {
  return (
    <ReceiptPaper testID={`${testID}-receipt`} width={width}>
      <View style={styles.header}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.badge}
        >
          <SymbolView name={daySummaryIcon} size={20} tintColor={semanticColors.accent} />
        </View>
        <AppText accessibilityRole="header" variant="sheetTitle">
          {model.title}
        </AppText>
        <AppText variant="control" style={styles.date} testID={`${testID}-date`}>
          {model.dateLabel}
        </AppText>
        <AppText variant="metadata" testID={`${testID}-count`}>
          {model.countLabel}
        </AppText>
      </View>

      <ReceiptTearLine />

      {model.activity ? (
        <View style={styles.activity} testID={`${testID}-activity`}>
          {model.activity.map((line) => (
            <ActivityLine key={line.key} line={line} testID={`${testID}-activity-${line.key}`} />
          ))}
        </View>
      ) : model.isEmpty ? (
        <View accessible style={styles.empty} testID={`${testID}-empty`}>
          <AppText variant="stateTitle" style={styles.centered}>
            Cette journée est libre
          </AppText>
          <AppText variant="metadata" style={styles.centered}>
            Aucun rendez-vous prévu.
          </AppText>
        </View>
      ) : (
        <View style={styles.list} testID={`${testID}-list`}>
          {model.rows.map((row) => (
            <ReceiptRow key={row.key} row={row} />
          ))}
        </View>
      )}

      <ReceiptTearLine />

      <View
        accessible
        accessibilityLabel={`CA potentiel, ${model.potentialRevenue}`}
        style={styles.total}
        testID={`${testID}-total`}
      >
        <AppText variant="eyebrow" style={styles.totalLabel}>
          CA potentiel
        </AppText>
        <AppText adjustsFontSizeToFit numberOfLines={1} variant="display" style={styles.totalValue}>
          {model.potentialRevenue}
        </AppText>
      </View>

      <View style={styles.metrics}>
        {model.metrics.map((metric) => (
          <View
            accessible
            accessibilityLabel={`${metric.label}, ${metric.value}`}
            key={metric.key}
            style={styles.metric}
            testID={`${testID}-metric-${metric.key}`}
          >
            <AppText variant="body" style={styles.metricLabel}>
              {metric.label}
            </AppText>
            <AppText
              variant="control"
              style={[styles.metricValue, metric.key === 'collected' && styles.collectedValue]}
            >
              {metric.value}
            </AppText>
          </View>
        ))}
      </View>

      <BrandMark decorative size={RECEIPT_SIGNATURE_SIZE} style={styles.brand} variant="symbol" />
    </ReceiptPaper>
  );
}

function ActivityLine({
  line,
  testID,
}: {
  readonly line: DaySummaryReceiptActivity;
  readonly testID: string;
}) {
  return (
    <View accessible accessibilityLabel={line.accessibilityLabel} style={styles.metric} testID={testID}>
      <AppText variant="body" style={styles.metricLabel}>
        {line.label}
      </AppText>
      <AppText variant="control" style={styles.metricValue}>
        {line.value}
      </AppText>
    </View>
  );
}

function ReceiptRow({ row }: { readonly row: DaySummaryReceiptRow }) {
  return (
    <View accessible accessibilityLabel={row.accessibilityLabel} style={styles.row}>
      <AppText variant="chip" style={styles.rowTime}>
        {row.time}
      </AppText>
      <View style={styles.rowBody}>
        <AppText numberOfLines={1} variant="rowTitle">
          {row.serviceLabel}
        </AppText>
        <AppText numberOfLines={1} variant="metadata">
          {row.clientLabel}
        </AppText>
      </View>
      <View style={styles.rowAmount}>
        {/* Never colour alone: the check says « encaissé », and so does the label. */}
        {row.collected && (
          <SymbolView
            name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }}
            size={14}
            tintColor={mint.mint600}
          />
        )}
        <AppText variant="control" style={styles.tabular}>
          {row.amount}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 2 },
  badge: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 40,
  },
  date: { color: lavender.lav700, marginTop: 2 },
  centered: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  activity: { gap: spacing.sm, paddingVertical: spacing.xs },
  list: { gap: spacing.md, paddingVertical: spacing.xs },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  rowTime: { color: foregroundSoft, fontVariant: ['tabular-nums'], width: 40 },
  rowBody: { flex: 1, minWidth: 0 },
  rowAmount: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  tabular: { fontVariant: ['tabular-nums'] },
  total: {
    alignItems: 'center',
    backgroundColor: lavender.lav050,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  totalLabel: { color: semanticColors.accent },
  totalValue: {
    color: lavender.lav700,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  metrics: { gap: spacing.sm, marginTop: spacing.base },
  metric: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  metricLabel: { color: foregroundSoft },
  metricValue: { fontVariant: ['tabular-nums'] },
  collectedValue: { color: mint.mint700 },
  brand: { alignSelf: 'center', marginTop: spacing.md, opacity: 0.85 },
});
