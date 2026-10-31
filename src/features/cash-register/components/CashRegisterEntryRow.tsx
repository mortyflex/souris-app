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
// standalone Sale reads its item snapshots and opens its read-only Sale
// detail (the caller decides: without a handler no chevron is drawn); a
// settled refund reads « Remboursement · products » with a signed amount
// (« −32,00 € ») and opens its Sale; a reversal reads « Remboursement annulé ».
// An exceptional outflow (money really returned beyond a server refusal) reads
// « Sortie exceptionnelle ». A refund not yet synchronized, or refused by the
// server, carries a short note under its source (`syncNote`).
// Month mode adds the day above the time.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CashRegisterEntry } from '@/domain/cash-register';
import { isSaleRefundOutflow } from '@/domain/sales';
import {
  formatAppointmentServiceSummary,
  formatAppointmentTime,
} from '@/features/appointments/presentation';
import { formatSaleSummary } from '@/features/sales/presentation';
import { formatEuroCents, formatSignedEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, rose, semanticColors, spacing } from '@/shared/ui/theme';

import {
  formatCashRegisterEntryDay,
  formatCashRegisterEntryMethods,
  type CashRegisterPeriod,
} from '../presentation';

/** A standalone Sale is named as such next to its products. */
const SALE_SOURCE_LABEL = 'Vente';
/** A deposit is named as such next to its Appointment's services. */
const DEPOSIT_SOURCE_LABEL = 'Acompte';
/** A settled Sale refund, and its compensating reversal. */
export const REFUND_SOURCE_LABEL = 'Remboursement';
/** A mistaken refund neutralised on its own day, and money that came back. */
export const RECORDED_IN_ERROR_SOURCE_LABEL = 'Correction de saisie';
export const REFUND_RETURNED_SOURCE_LABEL = 'Remboursement rendu';
/** Money really returned beyond a server refusal (outside the Sale's refundable ceiling). */
export const REFUND_OUTFLOW_SOURCE_LABEL = 'Sortie exceptionnelle';
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
    case 'SALE_ADJUSTMENT':
      return `adjustment-${entry.adjustment.id}`;
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
    case 'SALE_ADJUSTMENT':
      return [
        entry.adjustment.kind === 'REFUND'
          ? isSaleRefundOutflow(entry.adjustment)
            ? REFUND_OUTFLOW_SOURCE_LABEL
            : REFUND_SOURCE_LABEL
          : entry.adjustment.reason === 'REFUND_RETURNED'
            ? REFUND_RETURNED_SOURCE_LABEL
            : RECORDED_IN_ERROR_SOURCE_LABEL,
        entry.sale ? formatSaleSummary(entry.sale) : '',
      ]
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
  /**
   * A refund this device has not synchronized yet, or one the server refused:
   * the money it records is counted (it left), the line says it is not settled
   * with the server.
   */
  readonly syncNote?: { readonly text: string; readonly tone: 'neutral' | 'warning' };
}

export function CashRegisterEntryRow({ entry, period, clientName, onPress, syncNote }: CashRegisterEntryRowProps) {
  const { payment } = entry;
  const id =
    entry.kind === 'APPOINTMENT'
      ? entry.appointment.id
      : entry.kind === 'SALE'
        ? entry.sale.id
        : entry.kind === 'DEPOSIT'
          ? entry.deposit.id
          : entry.adjustment.id;
  const time = formatAppointmentTime(payment.paidAt);
  const day = period === 'month' ? formatCashRegisterEntryDay(payment.paidAt) : undefined;
  const name = clientName ?? WALK_IN_SALE_LABEL;
  const source = formatEntrySource(entry);
  const totalCents = payment.cardAmountCents + payment.cashAmountCents;
  // A refund is written with its sign (« −32,00 € »), never as money received.
  const amount = entry.kind === 'SALE_ADJUSTMENT' ? formatSignedEuroCents(totalCents) : formatEuroCents(totalCents);
  const methods = formatCashRegisterEntryMethods({
    cardAmountCents: Math.abs(payment.cardAmountCents),
    cashAmountCents: Math.abs(payment.cashAmountCents),
  });

  const accessibilityLabel = [
    day ? `${day} à ${time}` : time,
    name,
    source,
    amount,
    methods,
    syncNote?.text,
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
        {syncNote && (
          <AppText
            variant="metadata"
            numberOfLines={2}
            style={syncNote.tone === 'warning' ? styles.warning : styles.secondary}
            testID={`cash-register-entry-sync-${id}`}
          >
            {syncNote.text}
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
  warning: { color: rose.rose600 },
  money: { alignItems: 'flex-end', flexShrink: 0, gap: 2, maxWidth: '40%' },
  amount: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  chevron: { alignItems: 'center', width: CHEVRON_COLUMN },
});
