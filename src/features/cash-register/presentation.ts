// BeautIzzy — Cash Register presentation helpers
//
// Local civil calendar navigation and French labels for the Caisse screen.
// Money formatting comes from the shared money helpers; totals come from
// the Appointment domain (cash-register derivation).

import { paymentMethodLabels } from '@/shared/icons/payment-method-icons';

export type CashRegisterPeriod = 'day' | 'month';

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function shiftLocalDay(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function shiftLocalMonth(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameLocalMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** `Septembre 2026` */
export function formatCashRegisterMonth(date: Date): string {
  return capitalize(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date));
}

/**
 * Caption under the big total. BeautIzzy records what was received; it never
 * claims accounting-grade turnover.
 *   Day   → « encaissé aujourd'hui » / « encaissé ce jour »
 *   Month → « encaissé ce mois-ci » / « encaissé ce mois »
 */
export function formatCashRegisterCaption(period: CashRegisterPeriod, isCurrent: boolean): string {
  if (period === 'day') return isCurrent ? 'encaissé aujourd’hui' : 'encaissé ce jour';
  return isCurrent ? 'encaissé ce mois-ci' : 'encaissé ce mois';
}

/** `Aucun encaissement` / `1 encaissement` / `3 encaissements` */
export function formatCheckoutCount(count: number): string {
  if (count === 0) return 'Aucun encaissement';
  return `${count} encaissement${count > 1 ? 's' : ''}`;
}

/**
 * `Aucun client` / `1 client` / `7 clients` — the distinct identified clients
 * behind the period's payments (`countCashRegisterPayingClients`).
 */
export function formatPayingClientCount(count: number): string {
  if (count === 0) return 'Aucun client';
  return `${count} client${count > 1 ? 's' : ''}`;
}

/**
 * Empty « Encaissements » heading, worded for the selected period.
 *   Day   → « Aucun encaissement aujourd’hui » / « Aucun encaissement ce jour »
 *   Month → « Aucun encaissement ce mois-ci » / « Aucun encaissement ce mois »
 */
export function formatCashRegisterEmptyTitle(period: CashRegisterPeriod, isCurrent: boolean): string {
  if (period === 'day') return isCurrent ? 'Aucun encaissement aujourd’hui' : 'Aucun encaissement ce jour';
  return isCurrent ? 'Aucun encaissement ce mois-ci' : 'Aucun encaissement ce mois';
}

/**
 * How ONE payment was received, from its own recorded amounts:
 * `Carte`, `Espèces`, or `Carte + Espèces` for a mixed payment.
 * A payment with no amount on either side names no method.
 */
export function formatCashRegisterEntryMethods(payment: {
  readonly cardAmountCents: number;
  readonly cashAmountCents: number;
}): string {
  const methods: string[] = [];
  if (payment.cardAmountCents > 0) methods.push(paymentMethodLabels.CARD);
  if (payment.cashAmountCents > 0) methods.push(paymentMethodLabels.CASH);
  return methods.join(' + ');
}

/** `22 sept.` — the day of an entry listed in Month mode. */
export function formatCashRegisterEntryDay(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date);
}
