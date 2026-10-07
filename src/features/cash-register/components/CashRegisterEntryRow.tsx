// BeautIzzy — Cash Register entry row
//
// ONE counted payment of the « Encaissements » list:
//
//     09:00   Alexia Alleaume             95,00 €   ›
//             Balayage + Brushing           Carte
//
// Primary: who paid and how much. Secondary: when, what generated the
// payment and how it was received. An Appointment checkout reads its item
// snapshots and opens the existing Appointment Details; a deposit reads
// « Acompte » + its Appointment's services and opens the same Details; a
// standalone Sale reads its item snapshots and stays read-only — no Sale
// detail exists, so no chevron is drawn. Month mode adds the day above the
// time.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CashRegisterEntry } from '@/domain/cash-register';
import {
  formatAppointmentServiceSummary,
  formatAppointmentTime,
} from '@/features/appointments/presentation';
import { formatSaleSummary } from '@/features/sales/presentation';
import { formatEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

import {
  formatCashRegisterEntryDay,
  formatCashRegisterEntryMethods,
  type CashRegisterPeriod,
} from '../presentation';

/** A standalone Sale is named as such next to its products. */
const SALE_SOURCE_LABEL = 'Vente';
/** A deposit is named as such next to its Appointment's services. */
const DEPOSIT_SOURCE_LABEL = 'Acompte';
/** A walk-in Sale has no Client to name; nothing is invented. */
export const WALK_IN_SALE_LABEL = 'Vente sans client';

const WHEN_COLUMN = 58;
const CHEVRON_COLUMN = 14;
/** Separators start under the names: row padding + time column + gap. */
export const CASH_REGISTER_ENTRY_SEPARATOR_INSET = spacing.base + WHEN_COLUMN + spacing.md;

/** A stable list key and testID suffix for any counted entry. */
export function getCashRegisterEntryKey(entry: CashRegisterEntry): string {
  switch (entry.kind) {
    case 'APPOINTMENT':
      return `appointment-${entry.appointment.id}`;
    case 'SALE':
      return `sale-${entry.sale.id}`;
    case 'DEPOSIT':
      return `deposit-${entry.deposit.id}`;
  }
}

function formatEntrySource(entry: CashRegisterEntry): string {
  switch (entry.kind) {
    case 'APPOINTMENT':
      return formatAppointmentServiceSummary(entry.appointment);
    case 'SALE':
      return [SALE_SOURCE_LABEL, formatSaleSummary(entry.sale)].filter(Boolean).join(' · ');
    case 'DEPOSIT':
      return [DEPOSIT_SOURCE_LABEL, entry.appointment ? formatAppointmentServiceSummary(entry.appointment) : '']
        .filter(Boolean)
        .join(' · ');
  }
}

interface CashRegisterEntryRowProps {
  readonly entry: CashRegisterEntry;
  readonly period: CashRegisterPeriod;
  /** Resolved display name, or undefined for a walk-in Sale. */
  readonly clientName: string | undefined;
  /** Present only when the entry has an existing detail destination. */
  readonly onPress?: () => void;
}

export function CashRegisterEntryRow({ entry, period, clientName, onPress }: CashRegisterEntryRowProps) {
  const { payment } = entry;
  const id =
    entry.kind === 'APPOINTMENT'
      ? entry.appointment.id
      : entry.kind === 'SALE'
        ? entry.sale.id
        : entry.deposit.id;
  const time = formatAppointmentTime(payment.paidAt);
  const day = period === 'month' ? formatCashRegisterEntryDay(payment.paidAt) : undefined;
  const name = clientName ?? WALK_IN_SALE_LABEL;
  const source = formatEntrySource(entry);
  const amount = formatEuroCents(payment.cardAmountCents + payment.cashAmountCents);
  const methods = formatCashRegisterEntryMethods(payment);

  const accessibilityLabel = [
    day ? `${day} à ${time}` : time,
    name,
    source,
    amount,
    methods,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
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
        {source.length > 0 && (
          <AppText variant="metadata" numberOfLines={1} style={styles.secondary}>
            {source}
          </AppText>
        )}
      </View>
      <View style={styles.money}>
        <AppText variant="control" style={styles.amount} testID={`cash-register-entry-amount-${id}`}>
          {amount}
        </AppText>
        {methods.length > 0 && (
          <AppText variant="metadata" numberOfLines={1} style={styles.secondary}>
            {methods}
          </AppText>
        )}
      </View>
      <View style={styles.chevron}>
        {onPress && (
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right' }}
            size={13}
            tintColor={semanticColors.foregroundMuted}
          />
        )}
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        style={styles.row}
        testID={`cash-register-entry-${id}`}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={`cash-register-entry-${id}`}
    >
      {content}
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
  money: { alignItems: 'flex-end', flexShrink: 0, gap: 2, maxWidth: '40%' },
  amount: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  chevron: { alignItems: 'center', width: CHEVRON_COLUMN },
});
