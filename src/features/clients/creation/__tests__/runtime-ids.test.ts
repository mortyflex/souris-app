import { isUuidV4 } from '@/shared/lib/uuid';

import { createClientId } from '../runtime-ids';

describe('createClientId', () => {
  it('emits a globally unique UUID v4 for every new Client', () => {
    const ids = Array.from({ length: 200 }, () => createClientId());

    expect(ids.every(isUuidV4)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
