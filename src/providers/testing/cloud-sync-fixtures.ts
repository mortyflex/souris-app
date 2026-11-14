// BeautIzzy — the records the two-device screen tests exchange (never imported by app code)
//
// Written on "device A" through the STORES (what its session providers do),
// so they carry outbox entries and travel to this device through the remote.

import { prepareSaleAdjustment, type Sale, type SaleAdjustmentDraft } from '@/domain/sales';
import type { SourisDatabase } from '@/persistence/database';
import { recordSaleAdjustment, loadSaleAdjustments } from '@/persistence/stores/sale-adjustments';
import { completeSale, findSale } from '@/persistence/stores/sales';
import { productMask } from '@/persistence/testing/fixtures';

import { REMOTE_BUSINESS_ID } from './cloud-sync-harness';

export const SALE_ID = 'c1a2b3d4-1111-4222-8333-444455556666';
export const REFUND_ID = 'd1a2b3d4-1111-4222-8333-444455556677';

/**
 * The instant of a record made "earlier today": `minutesAgo` before `now`, but
 * never before the start of `now`'s LOCAL calendar day — the day the screens
 * mean by « aujourd'hui » (`startOfLocalDay`). Without the floor, a run in the
 * first minutes after midnight dates the record on the previous day and every
 * "today" figure reads zero. The floor is built from the local calendar
 * fields, so it is the right midnight in any time zone, on the two daylight
 * saving days of Europe/Paris included; the result is never after `now`.
 */
export function earlierTodayAt(minutesAgo: number, now: Date = new Date()): Date {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return new Date(Math.max(now.getTime() - minutesAgo * 60_000, startOfToday));
}

/** One Product sold to Léa, 2 × the mask, paid by card, earlier today (`minutesAgo` before now when the day allows). */
export function createRemoteSale(minutesAgo: number, overrides: Partial<Sale> = {}): Sale {
  const soldAt = earlierTodayAt(minutesAgo);
  return {
    id: SALE_ID,
    businessId: REMOTE_BUSINESS_ID,
    clientId: 'client-lea',
    completedAt: soldAt,
    items: [
      {
        id: `${SALE_ID}-item-1`,
        productId: productMask.id,
        productName: productMask.name,
        unitPrice: productMask.price,
        quantity: 2,
      },
    ],
    payment: { paidAt: soldAt, cardAmountCents: Math.round(productMask.price * 200), cashAmountCents: 0 },
    ...overrides,
  };
}

/** Device A sells the mask: stock decremented, Sale recorded, both enqueued. */
export function sellOnDevice(db: SourisDatabase, sale: Sale): void {
  completeSale(db, sale, [{ productId: productMask.id, quantity: sale.items[0]!.quantity }]);
}

/** Device A refunds `cents` by card on the Sale (settled now), enqueued. */
export function refundOnDevice(db: SourisDatabase, saleId: string, cents: number, id = REFUND_ID): void {
  const sale = findSale(db, saleId);
  if (!sale) throw new Error(`refundOnDevice: Sale "${saleId}" missing`);
  const now = new Date();
  const draft: SaleAdjustmentDraft = {
    id,
    businessId: REMOTE_BUSINESS_ID,
    staffMemberId: 'staff-a',
    reason: 'CUSTOMER_REFUND',
    lines: [],
    refundCardCents: cents,
    refundCashCents: 0,
    settlement: 'SETTLED',
    refundedAt: now,
  };
  const prepared = prepareSaleAdjustment(
    { sale, adjustments: loadSaleAdjustments(db), appointmentSettled: true, productExists: () => true, now },
    draft,
  );
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.issues));
  recordSaleAdjustment(db, draft, prepared.adjustment, prepared.restorations, now);
}
