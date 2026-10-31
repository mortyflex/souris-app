// BeautIzzy — one Sale of the Caisse sale history
//
//     14:35   Sofia Petit                       45,00 €   ›
//             Vente directe · Shampooing + Soin   Carte
//
// Primary: who bought and how much. Secondary: when, how it was sold and how
// the money was recorded — « Carte », « Espèces », « Carte + Espèces »,
// « Avec le rendez-vous » for a Revente, « Non renseigné » for a historical
// Sale without any record. Everything is read from the Sale snapshot and the
// derived history entry; the current catalog is never consulted. Month mode
// adds the day above the time. A Sale with corrections says so in accent
// (« Remboursée », « Remboursement à effectuer »…). The whole row opens the
// Sale detail.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { SaleHistoryEntry } from '@/domain/sales';
import { formatAppointmentTime } from '@/features/appointments/presentation';
import {
  formatCashRegisterEntryDay,
  type CashRegisterPeriod,
} from '@/features/cash-register/presentation';
import { formatEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

import {
  SALE_CHANNEL_LABELS,
  formatSalePaymentRecordShort,
  formatSaleSummary,
} from '../presentation';

/** A walk-in Sale has no Client to name; nothing is invented. */
export const WALK_IN_SALE_LABEL = 'Vente sans client';

const WHEN_COLUMN = 58;
const CHEVRON_COLUMN = 14;
/** Separators start under the names: row padding + time column + gap. */
export const SALE_HISTORY_ROW_SEPARATOR_INSET = spacing.base + WHEN_COLUMN + spacing.md;

interface SaleHistoryRowProps {
  readonly entry: SaleHistoryEntry;
  readonly period: CashRegisterPeriod;
  /** Resolved display name, or undefined for a walk-in Sale. */
  readonly clientName: string | undefined;
  /** What its corrections say (« Remboursée en partie »), when it has some. */
  readonly adjustmentStatus?: string;
  readonly onPress: () => void;
}

export function SaleHistoryRow({ entry, period, clientName, adjustmentStatus, onPress }: SaleHistoryRowProps) {
  const { sale } = entry;
  const time = formatAppointmentTime(sale.completedAt);
  const day = period === 'month' ? formatCashRegisterEntryDay(sale.completedAt) : undefined;
  const name = clientName ?? WALK_IN_SALE_LABEL;
  const source = [SALE_CHANNEL_LABELS[entry.channel], formatSaleSummary(sale)].filter(Boolean).join(' · ');
  const amount = formatEuroCents(entry.totalCents);
  const paymentRecord = formatSalePaymentRecordShort(entry);

  const accessibilityLabel = [day ? `${day} à ${time}` : time, name, source, amount, paymentRecord, adjustmentStatus]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityHint="Ouvre le détail de la vente"
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={`sale-history-row-${sale.id}`}
    >
      <View style={styles.when}>
        {day && (
          <AppText variant="metadata" numberOfLines={1} style={styles.day}>
            {day}
          </AppText>
        )}
        <AppText variant="control" style={day ? styles.timeSecondary : styles.time}>
          {time}
        </AppText>
      </View>
      <View style={styles.copy}>
        <AppText variant="rowTitle" numberOfLines={1} style={styles.name}>
          {name}
        </AppText>
        <AppText variant="metadata" numberOfLines={1} style={styles.secondary}>
          {source}
        </AppText>
        {adjustmentStatus && (
          <AppText variant="metadata" numberOfLines={1} style={styles.status} testID={`sale-history-status-${sale.id}`}>
            {adjustmentStatus}
          </AppText>
        )}
      </View>
      <View style={styles.money}>
        <AppText variant="control" style={styles.amount} testID={`sale-history-amount-${sale.id}`}>
          {amount}
        </AppText>
        <AppText variant="metadata" numberOfLines={1} style={styles.secondary}>
          {paymentRecord}
        </AppText>
      </View>
      <View style={styles.chevron}>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right' }}
          size={13}
          tintColor={semanticColors.foregroundMuted}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingLeft: spacing.base,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  // Fixed column: names line up from row to row.
  when: { alignSelf: 'flex-start', flexShrink: 0, gap: 1, paddingTop: 2, width: WHEN_COLUMN },
  day: { color: semanticColors.foreground },
  time: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  timeSecondary: { color: foregroundSoft, fontSize: 14, fontVariant: ['tabular-nums'] },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { color: semanticColors.foreground },
  secondary: { color: foregroundSoft },
  status: { color: semanticColors.accent },
  money: { alignItems: 'flex-end', flexShrink: 0, gap: 2, maxWidth: '40%' },
  amount: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  chevron: { alignItems: 'center', width: CHEVRON_COLUMN },
});
