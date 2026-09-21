// Souris — DaySummaryReceipt
//
// The paper of « Résumé du jour » (DESIGN_OVERRIDES.md §25): a warm near-white
// slip with torn edges, read top to bottom like a receipt —
//
//   header     glyph, « Résumé du jour », the selected date, the count
//   list       one line per Appointment: time, services + client, amount
//   total      « CA potentiel » — THE strongest value of the paper
//   breakdown  Déjà encaissé · Reste à encaisser · Temps total · Panier moyen
//
// It renders the receipt model as is and computes nothing. On a long day only
// the LIST scrolls: the header and the totals never leave the paper. Souris
// typography and tokens throughout — no texture, no grain, no serif.

import { SymbolView } from 'expo-symbols';
import { ScrollView, StyleSheet, View } from 'react-native';

import { daySummaryIcon } from '@/shared/icons/day-summary-icon';
import { AppText } from '@/shared/ui/AppText';
import { BrandMark } from '@/shared/ui/BrandMark';
import {
  foregroundSoft,
  lavender,
  mint,
  nativeShadows,
  radii,
  receiptPaper,
  receiptPrinter,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type { DaySummaryReceiptModel, DaySummaryReceiptRow } from './day-summary-receipt';

interface DaySummaryReceiptProps {
  readonly model: DaySummaryReceiptModel;
  readonly width: number;
  readonly maxHeight: number;
}

export function DaySummaryReceipt({ model, width, maxHeight }: DaySummaryReceiptProps) {
  // The top teeth are drawn LAST, over the room kept for them here, so the
  // shadow of the paper never tints them.
  const topEdgeRoom = getToothWidth(width) / 2 - StyleSheet.hairlineWidth;

  return (
    <View style={{ maxHeight, paddingTop: topEdgeRoom, width }} testID="day-summary-receipt">
      <View style={styles.paper}>
        <View style={styles.header}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.badge}
          >
            <SymbolView name={daySummaryIcon} size={20} tintColor={semanticColors.accent} />
          </View>
          <AppText accessibilityRole="header" variant="sheetTitle">
            Résumé du jour
          </AppText>
          <AppText variant="control" style={styles.date} testID="day-summary-date">
            {model.dateLabel}
          </AppText>
          <AppText variant="metadata" testID="day-summary-count">
            {model.countLabel}
          </AppText>
        </View>

        <TearLine />

        {model.isEmpty ? (
          <View accessible style={styles.empty} testID="day-summary-empty">
            <AppText variant="stateTitle" style={styles.centered}>
              Cette journée est libre
            </AppText>
            <AppText variant="metadata" style={styles.centered}>
              Aucun rendez-vous prévu.
            </AppText>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            style={styles.list}
            testID="day-summary-list"
          >
            {model.rows.map((row) => (
              <ReceiptRow key={row.key} row={row} />
            ))}
          </ScrollView>
        )}

        <TearLine />

        <View
          accessible
          accessibilityLabel={`CA potentiel, ${model.potentialRevenue}`}
          style={styles.total}
          testID="day-summary-total"
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
              testID={`day-summary-metric-${metric.key}`}
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

        <BrandMark decorative size={84} style={styles.brand} variant="wordmark" />
      </View>
      <PaperEdge side="bottom" width={width} />
      <PaperEdge side="top" width={width} />
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

/** A dashed tear line. Drawn as a clipped dashed box: a one-sided dashed border is not portable. */
function TearLine() {
  return (
    <View style={styles.tearLine}>
      <View style={styles.tearLineDashes} />
    </View>
  );
}

function getToothCount(width: number): number {
  return Math.max(Math.floor(width / receiptPrinter.toothWidth), 1);
}

/** The teeth tile the paper width exactly, so their real width follows it. */
function getToothWidth(width: number): number {
  return width / getToothCount(width);
}

/**
 * The torn edge of the paper: a row of paper-coloured teeth. Each tooth is a
 * square turned 45°, centred on the edge of the paper and clipped to its outer
 * half, so the row tiles the width exactly whatever the device.
 */
function PaperEdge({ side, width }: { readonly side: 'top' | 'bottom'; readonly width: number }) {
  const count = getToothCount(width);
  const toothWidth = getToothWidth(width);
  const toothHeight = toothWidth / 2;
  const square = toothWidth / Math.SQRT2;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.edge, { height: toothHeight }, side === 'top' ? styles.edgeTop : styles.edgeBottom]}
    >
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={{ height: toothHeight, width: toothWidth }}>
          <View
            style={[
              styles.tooth,
              {
                height: square,
                left: (toothWidth - square) / 2,
                top: side === 'top' ? toothHeight - square / 2 : -square / 2,
                width: square,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: receiptPaper.surface,
    flexShrink: 1,
    paddingBottom: spacing.base,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    ...nativeShadows.lifted,
  },
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
  date: { color: semanticColors.brandForeground, marginTop: 2 },
  centered: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { gap: spacing.md, paddingVertical: spacing.xs },
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
    color: semanticColors.brandForeground,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  metrics: { gap: spacing.sm, marginTop: spacing.base },
  metric: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  metricLabel: { color: foregroundSoft },
  metricValue: { fontVariant: ['tabular-nums'] },
  collectedValue: { color: mint.mint700 },
  brand: { alignSelf: 'center', marginTop: spacing.md, opacity: 0.85 },
  tearLine: { height: 1, marginVertical: spacing.base, overflow: 'hidden' },
  tearLineDashes: {
    borderColor: receiptPaper.separator,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 2,
  },
  edge: { flexDirection: 'row', overflow: 'hidden' },
  edgeTop: { left: 0, position: 'absolute', right: 0, top: 0 },
  // The paper is drawn before the bottom edge: tuck the teeth under its last
  // hairline so no seam can open between the two.
  edgeBottom: { marginTop: -StyleSheet.hairlineWidth },
  tooth: {
    backgroundColor: receiptPaper.surface,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
});
