import { isUuidV4 } from '@/shared/lib/uuid';

import { createSaleId, createSaleItemId } from '../runtime-ids';

describe('Sale runtime ids', () => {
  it('emits a globally unique UUID v4 for every new Sale', () => {
    const ids = Array.from({ length: 200 }, () => createSaleId());

    expect(ids.every(isUuidV4)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps deriving item ids from the parent id, unique inside the Sale', () => {
    const saleId = createSaleId();

    expect(createSaleItemId(saleId, 1)).toBe(`${saleId}-item-1`);
    expect(createSaleItemId(saleId, 2)).toBe(`${saleId}-item-2`);
  });
});
