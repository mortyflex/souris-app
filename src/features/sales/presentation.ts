// Souris — Sale presentation helpers
//
// Derivations and formatting shared by Sale creation and the Client Profile
// purchases section. Everything reads Sale snapshots only — never the current
// Product catalog — so historical purchases stay stable after catalog edits.

import type { Sale, SaleCompletionIssue } from '@/domain/sales';

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
  }
}
