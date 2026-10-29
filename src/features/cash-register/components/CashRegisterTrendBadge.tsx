// BeautIzzy — Caisse trend badge, row and note
//
// How a Cash Register comparison is shown (DESIGN_OVERRIDES.md §31):
//
//   CashRegisterTrendBadge   the pill — a small direction glyph and the figure
//                            (« +12,4 % », « −8,0 % », « +3 », « Stable ») on the
//                            matching StatePill tone: mint for a rise, rose for a
//                            fall, neutral when nothing moved. The glyph and the
//                            written figure always go with the colour.
//   CashRegisterTrendRow     the badge followed by the compared window in quiet
//                            metadata (« vs 1er–29 sept. »); wraps on a narrow
//                            phone with large text instead of overflowing.
//   CashRegisterTrendNote    the secondary, one-line form of the year-over-year
//                            comparison: a tiny tinted glyph and one metadata
//                            line (« +8,2 % vs 1er–29 oct. 2025 »).
//   CashRegisterComparisonNote
//                            why no comparison is shown, when saying so helps
//                            (`describeCashRegisterComparisonUnavailability`):
//                            a small soft info glyph and one metadata sentence
//                            (« Historique insuffisant pour comparer avec
//                            septembre ») — no tone, no banner, wraps freely.
//
// Speech is the parent's job: these elements sit inside an `accessible` card
// whose label already reads `describeCashRegisterTrend` or the explanation —
// grouped, they are never focused on their own.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import type { CashRegisterTrend, CashRegisterTrendDirection } from '@/domain/cash-register';
import { trendIcons } from '@/shared/icons/trend-icons';
import { AppText } from '@/shared/ui/AppText';
import { statePillTones, type StatePillColors } from '@/shared/ui/StatePill';
import { foregroundSoft, radii, spacing } from '@/shared/ui/theme';

import {
  formatCashRegisterComparisonReference,
  formatCashRegisterTrendValue,
  type CashRegisterTrendUnit,
} from '../presentation';

/** THE tone of each direction — the existing state tones, never a new colour. */
export const trendTones: Readonly<Record<CashRegisterTrendDirection, StatePillColors>> = {
  UP: statePillTones.positive,
  DOWN: statePillTones.exception,
  FLAT: statePillTones.neutral,
};

interface CashRegisterTrendBadgeProps {
  readonly direction: CashRegisterTrendDirection;
  readonly label: string;
  readonly testID?: string;
}

export function CashRegisterTrendBadge({ direction, label, testID }: CashRegisterTrendBadgeProps) {
  const tone = trendTones[direction];
  return (
    <View
      style={[styles.badge, { backgroundColor: tone.fill }]}
      testID={testID}
    >
      <SymbolView name={trendIcons[direction]} size={12} tintColor={tone.dot} weight="bold" />
      <AppText
        numberOfLines={1}
        style={[styles.badgeLabel, { color: tone.text }]}
        testID={testID === undefined ? undefined : `${testID}-value`}
        variant="chip"
      >
        {label}
      </AppText>
    </View>
  );
}

interface CashRegisterTrendProps {
  readonly trend: CashRegisterTrend;
  readonly unit: CashRegisterTrendUnit;
  readonly testID: string;
}

export function CashRegisterTrendRow({ trend, unit, testID }: CashRegisterTrendProps) {
  return (
    <View
      style={styles.row}
      testID={testID}
    >
      <CashRegisterTrendBadge
        direction={trend.direction}
        label={formatCashRegisterTrendValue(trend, unit)}
        testID={`${testID}-badge`}
      />
      <AppText style={styles.reference} testID={`${testID}-reference`} variant="metadata">
        {formatCashRegisterComparisonReference(trend.comparison)}
      </AppText>
    </View>
  );
}

export function CashRegisterTrendNote({ trend, unit, testID }: CashRegisterTrendProps) {
  const tone = trendTones[trend.direction];
  return (
    <View
      style={styles.note}
      testID={testID}
    >
      <SymbolView name={trendIcons[trend.direction]} size={11} tintColor={tone.dot} weight="bold" />
      <AppText style={styles.noteText} testID={`${testID}-value`} variant="metadata">
        {`${formatCashRegisterTrendValue(trend, unit)} ${formatCashRegisterComparisonReference(trend.comparison)}`}
      </AppText>
    </View>
  );
}

/** The shared info glyph of the Caisse (the heatmap hint uses the same one). */
const comparisonNoteIcon = { ios: 'info.circle', android: 'info' } as const;

interface CashRegisterComparisonNoteProps {
  readonly children: string;
  readonly testID: string;
}

export function CashRegisterComparisonNote({ children, testID }: CashRegisterComparisonNoteProps) {
  return (
    <View style={styles.comparisonNote} testID={testID}>
      <View style={styles.comparisonNoteIcon}>
        <SymbolView name={comparisonNoteIcon} size={13} tintColor={foregroundSoft} />
      </View>
      <AppText style={styles.comparisonNoteText} testID={`${testID}-text`} variant="metadata">
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 26,
    paddingHorizontal: spacing.sm + 2,
  },
  badgeLabel: { fontVariant: ['tabular-nums'] },
  row: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
  },
  reference: { color: foregroundSoft, flexShrink: 1 },
  note: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  noteText: { color: foregroundSoft, flexShrink: 1, fontVariant: ['tabular-nums'] },
  // The glyph stays on the first line while the sentence wraps on a narrow phone.
  comparisonNote: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  // Centred on the metadata line height (13.5 pt text, ~18 pt line).
  comparisonNoteIcon: { height: 18, justifyContent: 'center' },
  comparisonNoteText: { color: foregroundSoft, flex: 1 },
});
