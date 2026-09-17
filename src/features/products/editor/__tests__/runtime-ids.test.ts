import { isUuidV4 } from '@/shared/lib/uuid';

import { createProductId } from '../runtime-ids';

describe('createProductId', () => {
  it('emits a globally unique UUID v4 for every new Product', () => {
    const ids = Array.from({ length: 200 }, () => createProductId());

    expect(ids.every(isUuidV4)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
