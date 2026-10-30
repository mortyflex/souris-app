// BeautIzzy — Sale presentation helpers
//
// Derivations and formatting shared by Sale creation, the Client Profile
// purchases section, the Appointment « Produits vendus » section and the
// Caisse sale history (list and detail).
// Everything reads Sale snapshots only — never the current Product catalog —
// so historical purchases stay stable after catalog edits. The Appointment
// Product rows themselves are a domain derivation (`getAppointmentProductLines`).

import {
  getSaleUnitCount,
  type Sale,
  type SaleChannel,
  type SaleCompletionIssue,
  type SaleHistoryEntry,
  type SalePaymentAmounts,
} from '@/domain/sales';
import { paymentMethodLabels } from '@/shared/icons/payment-method-icons';

/** Completed Sales attached to one Client, newest first. Never mutates the source. */
export function getClientSales(sales: readonly Sale[], clientId: string): readonly Sale[] {
  return sales
    .filter((sale) => sale.clientId === clientId)
    .sort(
      (a, b) =>
        b.completedAt.getTime() - a.completedAt.getTime() || b.id.localeCompare(a.id),
    );
}

/** `11 sept. 2026` */
export function formatSaleDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** `×2` */
export function formatSaleQuantity(quantity: number): string {
  return `×${quantity}`;
}

/** `0 produit`, `1 produit`, `3 produits` — total units of a Sale draft. */
export function formatSaleUnitCount(count: number): string {
  return `${count} ${count > 1 ? 'produits' : 'produit'}`;
}

const UNKNOWN_PRODUCT_LABEL = 'Un produit';

/**
 * Concise French explanation of one completion issue. `resolveProductName`
 * lets the caller name a Product it still knows (a draft line) when the
 * issue itself carries no name.
 */
export function describeSaleCompletionIssue(
  issue: SaleCompletionIssue,
  resolveProductName: (productId: string) => string | undefined = () => undefined,
): string {
  switch (issue.kind) {
    case 'EMPTY_SALE':
      return 'Ajoutez au moins un produit.';
    case 'INVALID_QUANTITY':
      return `${resolveProductName(issue.productId) ?? UNKNOWN_PRODUCT_LABEL} : quantité invalide.`;
    case 'PRODUCT_MISSING':
      return `${resolveProductName(issue.productId) ?? UNKNOWN_PRODUCT_LABEL} n’est plus disponible dans le catalogue.`;
    case 'PRODUCT_INACTIVE':
      return `${issue.productName} est inactif.`;
    case 'INSUFFICIENT_STOCK':
      return `Stock insuffisant pour ${issue.productName} : ${issue.available} en stock, ${issue.requested} demandé${issue.requested > 1 ? 's' : ''}.`;
    case 'INVALID_PAYMENT':
      return 'Montant encaissé invalide.';
    case 'LINKED_SALE_PAYMENT':
      return 'Une vente liée à un rendez-vous est encaissée avec le rendez-vous.';
  }
}

/**
 * Concise product summary of one Sale, from its snapshots: `Shampooing`,
 * `Shampooing + Soin`, `Shampooing + Soin + 2 autres`.
 */
export function formatSaleSummary(sale: Pick<Sale, 'items'>): string {
  const names = sale.items.map((item) => item.productName.trim()).filter((name) => name.length > 0);
  if (names.length <= 2) return names.join(' + ');
  const remaining = names.length - 2;
  return `${names.slice(0, 2).join(' + ')} + ${remaining} autre${remaining > 1 ? 's' : ''}`;
}

/** `×2` for a single-line Sale, `3 produits` across several lines. */
export function formatSaleQuantitySummary(sale: Pick<Sale, 'items'>): string {
  if (sale.items.length === 1) return formatSaleQuantity(sale.items[0].quantity);
  return formatSaleUnitCount(getSaleUnitCount(sale));
}

// ---------------------------------------------------------------------------
// Sale history (docs/domain/SALES.md §11b, docs/product/PRODUCT.md — Caisse)
// ---------------------------------------------------------------------------

/** `Aucune vente` / `1 vente` / `3 ventes` */
export function formatSaleCount(count: number): string {
  if (count === 0) return 'Aucune vente';
  return `${count} vente${count > 1 ? 's' : ''}`;
}

/** How a Sale was sold, next to its products in a history row. */
export const SALE_CHANNEL_LABELS: Readonly<Record<SaleChannel, string>> = {
  DIRECT: 'Vente directe',
  APPOINTMENT: 'Pendant un rendez-vous',
};

/** The eyebrow of a Sale detail. */
export const SALE_CHANNEL_EYEBROWS: Readonly<Record<SaleChannel, string>> = {
  DIRECT: 'VENTE DIRECTE',
  APPOINTMENT: 'VENDUE PENDANT UN RENDEZ-VOUS',
};

/** A Sale sold during an Appointment: its money is the checkout's. */
export const SALE_PAID_WITH_APPOINTMENT_SHORT = 'Avec le rendez-vous';
export const SALE_PAID_WITH_APPOINTMENT_NOTE =
  'Le montant a été encaissé avec le rendez-vous. Aucun mode de paiement n’est enregistré sur la vente elle-même.';
/** A historical standalone Sale whose payment was never recorded: nothing is invented. */
export const SALE_PAYMENT_UNKNOWN_SHORT = 'Non renseigné';
export const SALE_PAYMENT_UNKNOWN_NOTE =
  'Aucun encaissement n’a été enregistré pour cette vente. Le mode de paiement n’est pas connu.';

/**
 * How ONE recorded Sale payment was received, from its own amounts:
 * `Carte`, `Espèces`, or `Carte + Espèces`. Nothing when both are zero.
 */
export function formatSalePaymentMethods(payment: SalePaymentAmounts): string {
  const methods: string[] = [];
  if (payment.cardAmountCents > 0) methods.push(paymentMethodLabels.CARD);
  if (payment.cashAmountCents > 0) methods.push(paymentMethodLabels.CASH);
  return methods.join(' + ');
}

/**
 * The short payment wording of a history row: the methods of a recorded Sale
 * payment, « Avec le rendez-vous » for a Revente, « Non renseigné » for a
 * historical Sale without any record.
 */
export function formatSalePaymentRecordShort(entry: Pick<SaleHistoryEntry, 'paymentRecord' | 'sale'>): string {
  switch (entry.paymentRecord) {
    case 'SALE_PAYMENT':
      return entry.sale.payment ? formatSalePaymentMethods(entry.sale.payment) : SALE_PAYMENT_UNKNOWN_SHORT;
    case 'APPOINTMENT_CHECKOUT':
      return SALE_PAID_WITH_APPOINTMENT_SHORT;
    case 'NONE':
      return SALE_PAYMENT_UNKNOWN_SHORT;
  }
}

/**
 * Empty « Ventes » heading, worded for the selected period.
 *   Day   → « Aucune vente aujourd’hui » / « Aucune vente ce jour »
 *   Month → « Aucune vente ce mois-ci » / « Aucune vente ce mois »
 */
export function formatSaleHistoryEmptyTitle(period: 'day' | 'month', isCurrent: boolean): string {
  if (period === 'day') return isCurrent ? 'Aucune vente aujourd’hui' : 'Aucune vente ce jour';
  return isCurrent ? 'Aucune vente ce mois-ci' : 'Aucune vente ce mois';
}

export const SALE_HISTORY_EMPTY_COPY = 'Les ventes de produits apparaîtront ici.';

const saleDateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  weekday: 'long',
  year: 'numeric',
});

/** `Lundi 12 octobre 2026 à 14:35` — when the Sale was validated. */
export function formatSaleDateTime(date: Date): string {
  const day = saleDateTimeFormatter.format(date);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} à ${time}`;
}
