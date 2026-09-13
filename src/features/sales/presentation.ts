// Souris — Sale presentation helpers
//
// Derivations and formatting shared by Sale creation and the Client Profile
// purchases section. Everything reads Sale snapshots only — never the current
// Product catalog — so historical purchases stay stable after catalog edits.

import { getSaleItemTotal, type Sale, type SaleCompletionIssue, type SaleItem } from '@/domain/sales';

/** Completed Sales attached to one Client, newest first. Never mutates the source. */
export function getClientSales(sales: readonly Sale[], clientId: string): readonly Sale[] {
  return sales
    .filter((sale) => sale.clientId === clientId)
    .sort(
      (a, b) =>
        b.completedAt.getTime() - a.completedAt.getTime() || b.id.localeCompare(a.id),
    );
}

/** Sales sold during one Appointment (« Revente »), in completion order. */
export function getAppointmentSales(sales: readonly Sale[], appointmentId: string): readonly Sale[] {
  return sales.filter((sale) => sale.appointmentId === appointmentId);
}

/** One displayed Product line of an Appointment: snapshot name, unit price, merged quantity. */
export interface AppointmentSaleLine {
  readonly key: string;
  readonly productName: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly total: number;
}

/**
 * The Products sold during an Appointment as ONE concise list, read from
 * Sale snapshots only. Several Sales from the same Appointment are merged
 * per identical snapshot (same Product, name and unit price) so the same
 * Product bought twice reads as one line with its summed quantity.
 */
export function getAppointmentSaleLines(
  sales: readonly Sale[],
  appointmentId: string,
): readonly AppointmentSaleLine[] {
  const lines = new Map<string, AppointmentSaleLine>();
  for (const sale of getAppointmentSales(sales, appointmentId)) {
    for (const item of sale.items) {
      const key = `${item.productId}\u0000${item.productName}\u0000${item.unitPrice}`;
      const existing = lines.get(key);
      const quantity = (existing?.quantity ?? 0) + item.quantity;
      lines.set(key, {
        key,
        productName: item.productName,
        unitPrice: item.unitPrice,
        quantity,
        total: getSaleItemTotal({ unitPrice: item.unitPrice, quantity }),
      });
    }
  }
  return [...lines.values()];
}

/** Derived snapshot total of every Product sold during the Appointment. */
export function getAppointmentSalesTotal(sales: readonly Sale[], appointmentId: string): number {
  return getAppointmentSales(sales, appointmentId).reduce(
    (total, sale) =>
      total + sale.items.reduce((saleTotal, item: SaleItem) => saleTotal + getSaleItemTotal(item), 0),
    0,
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
    case 'INVALID_PAYMENT':
      return 'Montant encaissé invalide.';
    case 'LINKED_SALE_PAYMENT':
      return 'Une vente liée à un rendez-vous est encaissée avec le rendez-vous.';
  }
}
