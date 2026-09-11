import { applyStockDecrements, type Product } from '../index';

const products: readonly Product[] = [
  { id: 'a', businessId: 'b', name: 'A', price: 10, stockQuantity: 5, active: true },
  { id: 'b', businessId: 'b', name: 'B', price: 10, stockQuantity: 1, active: true },
];

describe('applyStockDecrements', () => {
  it('returns a new collection with decremented stock and untouched other Products', () => {
    const next = applyStockDecrements(products, [{ productId: 'a', quantity: 2 }]);

    expect(next.find((product) => product.id === 'a')?.stockQuantity).toBe(3);
    expect(next.find((product) => product.id === 'b')).toBe(products[1]);
    expect(products[0].stockQuantity).toBe(5);
  });

  it('allows reaching exactly zero', () => {
    const next = applyStockDecrements(products, [{ productId: 'b', quantity: 1 }]);
    expect(next.find((product) => product.id === 'b')?.stockQuantity).toBe(0);
  });

  it('never lets stock become negative and applies nothing when one decrement fails', () => {
    expect(() =>
      applyStockDecrements(products, [
        { productId: 'a', quantity: 1 },
        { productId: 'b', quantity: 2 },
      ]),
    ).toThrow(RangeError);
    expect(products[0].stockQuantity).toBe(5);
    expect(products[1].stockQuantity).toBe(1);
  });

  it('sums decrements targeting the same Product', () => {
    expect(() =>
      applyStockDecrements(products, [
        { productId: 'a', quantity: 3 },
        { productId: 'a', quantity: 3 },
      ]),
    ).toThrow(RangeError);
    const next = applyStockDecrements(products, [
      { productId: 'a', quantity: 2 },
      { productId: 'a', quantity: 3 },
    ]);
    expect(next.find((product) => product.id === 'a')?.stockQuantity).toBe(0);
  });

  it('rejects missing Products and invalid quantities', () => {
    expect(() => applyStockDecrements(products, [{ productId: 'zzz', quantity: 1 }])).toThrow(
      'not found',
    );
    expect(() => applyStockDecrements(products, [{ productId: 'a', quantity: 0 }])).toThrow(
      RangeError,
    );
    expect(() => applyStockDecrements(products, [{ productId: 'a', quantity: 1.5 }])).toThrow(
      RangeError,
    );
  });

  it('returns the same collection for an empty batch', () => {
    expect(applyStockDecrements(products, [])).toBe(products);
  });
});
