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

/** One Product sold to Léa, 2 × the mask, paid by card, `minutesAgo` before now. */
export function createRemoteSale(minutesAgo: number, overrides: Partial<Sale> = {}): Sale {
  return {
    id: SALE_ID,
    businessId: REMOTE_BUSINESS_ID,
    clientId: 'client-lea',
    completedAt: new Date(Date.now() - minutesAgo * 60_000),
    items: [
      {
        id: `${SALE_ID}-item-1`,
        productId: productMask.id,
        productName: productMask.name,
        unitPrice: productMask.price,
        quantity: 2,
      },
    ],
    payment: { paidAt: new Date(Date.now() - minutesAgo * 60_000), cardAmountCents: Math.round(productMask.price * 200), cashAmountCents: 0 },
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
