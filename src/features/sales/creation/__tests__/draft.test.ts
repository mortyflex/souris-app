import type { SaleDraftLine } from '@/domain/sales';

import {
  addProductToDraft,
  getDraftQuantity,
  getRemainingStock,
  removeDraftLine,
  setDraftLineQuantity,
} from '../draft';

const shampoo = { id: 'p-a', stockQuantity: 2, active: true };
const care = { id: 'p-b', stockQuantity: 5, active: true };

let sequence = 0;
const nextId = () => {
  sequence += 1;
  return `line-${sequence}`;
};

describe('Sale draft rules', () => {
  beforeEach(() => {
    sequence = 0;
  });

  it('adds a new line the first time and increments the same Product afterwards', () => {
    const first = addProductToDraft([], shampoo, nextId);
    expect(first).toEqual({
      lines: [{ id: 'line-1', productId: 'p-a', quantity: 1 }],
      outcome: 'added',
    });

    const second = addProductToDraft(first.lines, shampoo, nextId);
    expect(second.outcome).toBe('incremented');
    expect(second.lines).toEqual([{ id: 'line-1', productId: 'p-a', quantity: 2 }]);
    expect(second.lines).toHaveLength(1);
  });

  it('never exceeds the current stock and reports out-of-stock', () => {
    const lines: readonly SaleDraftLine[] = [{ id: 'line-1', productId: 'p-a', quantity: 2 }];

    const result = addProductToDraft(lines, shampoo, nextId);

    expect(result).toEqual({ lines, outcome: 'out-of-stock' });
    expect(addProductToDraft([], { ...shampoo, stockQuantity: 0 }, nextId).outcome).toBe(
      'out-of-stock',
    );
  });

  it('refuses inactive Products', () => {
    const result = addProductToDraft([], { ...shampoo, active: false }, nextId);
    expect(result).toEqual({ lines: [], outcome: 'inactive' });
  });

  it('keeps distinct Products as distinct lines in addition order', () => {
    const lines = addProductToDraft(addProductToDraft([], shampoo, nextId).lines, care, nextId).lines;
    expect(lines.map((line) => line.productId)).toEqual(['p-a', 'p-b']);
  });

  it('sets valid quantities only and removes lines explicitly', () => {
    const lines: readonly SaleDraftLine[] = [{ id: 'line-1', productId: 'p-a', quantity: 1 }];

    expect(setDraftLineQuantity(lines, 'line-1', 3)[0].quantity).toBe(3);
    expect(setDraftLineQuantity(lines, 'line-1', 0)).toBe(lines);
    expect(setDraftLineQuantity(lines, 'line-1', 1.5)).toBe(lines);
    expect(removeDraftLine(lines, 'line-1')).toEqual([]);
    expect(lines[0].quantity).toBe(1);
  });

  it('derives requested quantity and remaining stock per Product', () => {
    const lines: readonly SaleDraftLine[] = [
      { id: 'line-1', productId: 'p-a', quantity: 1 },
      { id: 'line-2', productId: 'p-b', quantity: 4 },
    ];

    expect(getDraftQuantity(lines, 'p-a')).toBe(1);
    expect(getDraftQuantity(lines, 'p-zzz')).toBe(0);
    expect(getRemainingStock(lines, shampoo)).toBe(1);
    expect(getRemainingStock(lines, care)).toBe(1);
  });
});
