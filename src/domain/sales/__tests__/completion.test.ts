import type { Product } from '@/domain/products';

import { prepareSaleCompletion, type SaleDraft } from '../index';

const shampoo: Product = {
  id: 'product-a',
  businessId: 'business',
  name: 'Shampooing',
  price: 20,
  stockQuantity: 5,
  active: true,
};

const care: Product = {
  id: 'product-b',
  businessId: 'business',
  name: 'Soin',
  price: 18,
  stockQuantity: 1,
  active: true,
};

const completedAt = new Date(2026, 8, 11, 14, 30);

function draft(lines: SaleDraft['lines'], clientId?: string): SaleDraft {
  return { id: 'sale-1', businessId: 'business', clientId, completedAt, lines };
}

describe('prepareSaleCompletion', () => {
  it('builds the Sale snapshot and the exact stock decrements on success', () => {
    const result = prepareSaleCompletion(
      draft([{ id: 'sale-1-item-1', productId: 'product-a', quantity: 2 }], 'client-1'),
      [shampoo, care],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sale).toEqual({
      id: 'sale-1',
      businessId: 'business',
      clientId: 'client-1',
      completedAt,
      items: [
        {
          id: 'sale-1-item-1',
          productId: 'product-a',
          productName: 'Shampooing',
          unitPrice: 20,
          quantity: 2,
        },
      ],
    });
    expect(result.stockDecrements).toEqual([{ productId: 'product-a', quantity: 2 }]);
  });

  it('never mutates the draft or the Products', () => {
    const lines = [{ id: 'item-1', productId: 'product-a', quantity: 2 }];
    const products = [shampoo, care];
    const draftSnapshot = JSON.stringify(draft(lines));
    const productsSnapshot = JSON.stringify(products);

    prepareSaleCompletion(draft(lines), products);

    expect(JSON.stringify(draft(lines))).toBe(draftSnapshot);
    expect(JSON.stringify(products)).toBe(productsSnapshot);
    expect(shampoo.stockQuantity).toBe(5);
  });

  it('allows a walk-in Sale without Client', () => {
    const result = prepareSaleCompletion(
      draft([{ id: 'item-1', productId: 'product-a', quantity: 1 }]),
      [shampoo],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sale.clientId).toBeUndefined();
  });

  it('rejects an empty draft', () => {
    const result = prepareSaleCompletion(draft([]), [shampoo]);

    expect(result).toEqual({ ok: false, issues: [{ kind: 'EMPTY_SALE' }] });
  });

  it('blocks completion and names the Product when stock is insufficient', () => {
    const result = prepareSaleCompletion(
      draft([{ id: 'item-1', productId: 'product-b', quantity: 2 }]),
      [shampoo, care],
    );

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          kind: 'INSUFFICIENT_STOCK',
          productId: 'product-b',
          productName: 'Soin',
          requested: 2,
          available: 1,
        },
      ],
    });
  });

  it('fails as a whole when ONE of several Products is insufficient', () => {
    const result = prepareSaleCompletion(
      draft([
        { id: 'item-1', productId: 'product-a', quantity: 2 },
        { id: 'item-2', productId: 'product-b', quantity: 2 },
      ]),
      [shampoo, care],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ kind: 'INSUFFICIENT_STOCK', productId: 'product-b' });
  });

  it('merges lines of the same Product before checking stock', () => {
    const result = prepareSaleCompletion(
      draft([
        { id: 'item-1', productId: 'product-a', quantity: 3 },
        { id: 'item-2', productId: 'product-a', quantity: 3 },
      ]),
      [shampoo],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatchObject({ kind: 'INSUFFICIENT_STOCK', requested: 6, available: 5 });
  });

  it('fails atomically when a referenced Product is missing', () => {
    const result = prepareSaleCompletion(
      draft([
        { id: 'item-1', productId: 'product-a', quantity: 1 },
        { id: 'item-2', productId: 'product-deleted', quantity: 1 },
      ]),
      [shampoo],
    );

    expect(result).toEqual({
      ok: false,
      issues: [{ kind: 'PRODUCT_MISSING', productId: 'product-deleted' }],
    });
  });

  it('refuses inactive Products', () => {
    const result = prepareSaleCompletion(
      draft([{ id: 'item-1', productId: 'product-a', quantity: 1 }]),
      [{ ...shampoo, active: false }],
    );

    expect(result).toEqual({
      ok: false,
      issues: [{ kind: 'PRODUCT_INACTIVE', productId: 'product-a', productName: 'Shampooing' }],
    });
  });

  it('refuses invalid quantities', () => {
    const result = prepareSaleCompletion(
      draft([{ id: 'item-1', productId: 'product-a', quantity: 0 }]),
      [shampoo],
    );

    expect(result).toEqual({
      ok: false,
      issues: [{ kind: 'INVALID_QUANTITY', productId: 'product-a', quantity: 0 }],
    });
  });

  it('allows a Sale to consume the exact remaining stock', () => {
    const result = prepareSaleCompletion(
      draft([{ id: 'item-1', productId: 'product-b', quantity: 1 }]),
      [care],
    );

    expect(result.ok).toBe(true);
  });
});

describe('prepareSaleCompletion — payment', () => {
  const lines = [{ id: 'sale-1-item-1', productId: 'product-a', quantity: 2 }]; // 40 €

  it.each([
    ['card only', { cardAmountCents: 4000, cashAmountCents: 0 }],
    ['cash only', { cardAmountCents: 0, cashAmountCents: 4000 }],
    ['mixed', { cardAmountCents: 2500, cashAmountCents: 1500 }],
  ])('records a standalone Sale payment (%s) at the completion instant', (_label, payment) => {
    const result = prepareSaleCompletion({ ...draft(lines), payment }, [shampoo]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sale.payment).toEqual({ paidAt: completedAt, ...payment });
    expect(result.sale.payment?.paidAt).not.toBe(completedAt);
  });

  it('tolerates a received total that differs from the Sale total', () => {
    const result = prepareSaleCompletion(
      { ...draft(lines), payment: { cardAmountCents: 3500, cashAmountCents: 0 } },
      [shampoo],
    );
    expect(result.ok).toBe(true);
  });

  it('rejects nothing received for a positive Sale total, and invalid cents', () => {
    expect(
      prepareSaleCompletion({ ...draft(lines), payment: { cardAmountCents: 0, cashAmountCents: 0 } }, [shampoo]),
    ).toEqual({ ok: false, issues: [{ kind: 'INVALID_PAYMENT' }] });
    expect(
      prepareSaleCompletion({ ...draft(lines), payment: { cardAmountCents: -1, cashAmountCents: 4000 } }, [shampoo]),
    ).toEqual({ ok: false, issues: [{ kind: 'INVALID_PAYMENT' }] });
    expect(
      prepareSaleCompletion({ ...draft(lines), payment: { cardAmountCents: 10.5, cashAmountCents: 0 } }, [shampoo]),
    ).toEqual({ ok: false, issues: [{ kind: 'INVALID_PAYMENT' }] });
  });

  it('keeps a Sale without payment valid (historical, or sold during an Appointment)', () => {
    const standalone = prepareSaleCompletion(draft(lines), [shampoo]);
    expect(standalone.ok && 'payment' in standalone.sale).toBe(false);

    const linked = prepareSaleCompletion({ ...draft(lines), appointmentId: 'appointment-1' }, [shampoo]);
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    expect(linked.sale.appointmentId).toBe('appointment-1');
    expect(linked.sale.payment).toBeUndefined();
  });

  it('refuses a payment on a Sale sold during an Appointment', () => {
    expect(
      prepareSaleCompletion(
        { ...draft(lines), appointmentId: 'appointment-1', payment: { cardAmountCents: 4000, cashAmountCents: 0 } },
        [shampoo],
      ),
    ).toEqual({ ok: false, issues: [{ kind: 'LINKED_SALE_PAYMENT', appointmentId: 'appointment-1' }] });
  });
});
