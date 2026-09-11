import {
  createSaleItemSnapshot,
  getSaleItemTotal,
  getSaleTotal,
  getSaleUnitCount,
  isValidSaleQuantity,
  type Sale,
} from '../index';

describe('Sale domain rules', () => {
  describe('isValidSaleQuantity', () => {
    it('accepts positive integers only', () => {
      expect(isValidSaleQuantity(1)).toBe(true);
      expect(isValidSaleQuantity(12)).toBe(true);
      expect(isValidSaleQuantity(0)).toBe(false);
      expect(isValidSaleQuantity(-1)).toBe(false);
      expect(isValidSaleQuantity(1.5)).toBe(false);
      expect(isValidSaleQuantity(NaN)).toBe(false);
      expect(isValidSaleQuantity(Infinity)).toBe(false);
    });
  });

  describe('derived totals', () => {
    const sale: Sale = {
      id: 'sale-1',
      businessId: 'business',
      completedAt: new Date(2026, 8, 11, 10),
      items: [
        { id: 'sale-1-item-1', productId: 'p-a', productName: 'Shampooing', unitPrice: 25, quantity: 1 },
        { id: 'sale-1-item-2', productId: 'p-b', productName: 'Soin', unitPrice: 18, quantity: 2 },
      ],
    };

    it('derives the line total from unit price × quantity', () => {
      expect(getSaleItemTotal(sale.items[0])).toBe(25);
      expect(getSaleItemTotal(sale.items[1])).toBe(36);
    });

    it('derives the Sale total from its lines and never stores it', () => {
      expect(getSaleTotal(sale)).toBe(61);
      expect(getSaleUnitCount(sale)).toBe(3);
      expect('total' in sale).toBe(false);
    });

    it('is zero for an empty item list', () => {
      expect(getSaleTotal({ items: [] })).toBe(0);
      expect(getSaleUnitCount({ items: [] })).toBe(0);
    });
  });

  describe('createSaleItemSnapshot', () => {
    const product = {
      id: 'product-shampoo',
      name: 'Shampooing',
      price: 20,
      brand: 'Marque',
      imageUri: 'file:///shampoo.png',
      stockQuantity: 5,
      active: true,
    };

    it('copies id, name, price and quantity and nothing else', () => {
      const item = createSaleItemSnapshot({ id: 'item-1', product, quantity: 2 });

      expect(item).toEqual({
        id: 'item-1',
        productId: 'product-shampoo',
        productName: 'Shampooing',
        unitPrice: 20,
        quantity: 2,
      });
      expect('imageUri' in item).toBe(false);
    });

    it('does not keep a reference to the Product: later edits never reach the snapshot', () => {
      const mutable = { ...product };
      const item = createSaleItemSnapshot({ id: 'item-1', product: mutable, quantity: 1 });

      mutable.name = 'Nouveau nom';
      mutable.price = 30;

      expect(item.productName).toBe('Shampooing');
      expect(item.unitPrice).toBe(20);
    });

    it('rejects invalid quantities without producing a line', () => {
      expect(() => createSaleItemSnapshot({ id: 'item-1', product, quantity: 0 })).toThrow(
        RangeError,
      );
      expect(() => createSaleItemSnapshot({ id: 'item-1', product, quantity: 1.5 })).toThrow(
        RangeError,
      );
    });
  });

  it('keeps the Client optional', () => {
    const walkIn: Sale = {
      id: 'sale-walk-in',
      businessId: 'business',
      completedAt: new Date(),
      items: [],
    };
    const attached: Sale = { ...walkIn, id: 'sale-attached', clientId: 'client-1' };

    expect(walkIn.clientId).toBeUndefined();
    expect(attached.clientId).toBe('client-1');
  });
});
