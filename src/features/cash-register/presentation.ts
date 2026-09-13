// Souris — Cash Register presentation helpers
//
// Local civil calendar navigation and French labels for the Caisse screen.
// Money formatting comes from the shared money helpers; totals come from
// the Appointment domain (cash-register derivation).

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

/** `Samedi 12 septembre 2026` */
export function formatCashRegisterDay(date: Date): string {
  return capitalize(
    new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
      year: 'numeric',
    }).format(date),
  );
}

/** `Septembre 2026` */
export function formatCashRegisterMonth(date: Date): string {
  return capitalize(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date));
}

/**
 * Caption under the big total. Souris records what was received; it never
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
