// Souris — Sale presentation helpers
//
// Derivations and formatting shared by Sale creation, the Client Profile
// purchases section and the Appointment « Produits vendus » section.
// Everything reads Sale snapshots only — never the current Product catalog —
// so historical purchases stay stable after catalog edits. The Appointment
// Product rows themselves are a domain derivation (`getAppointmentProductLines`).

import { getSaleUnitCount, type Sale, type SaleCompletionIssue } from '@/domain/sales';

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
