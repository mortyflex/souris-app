import { isUuidV4 } from '@/shared/lib/uuid';

import { createServiceId, createServicePhaseId } from '../runtime-ids';

describe('Service runtime ids', () => {
  it('emits a globally unique UUID v4 for every new Service', () => {
    const ids = Array.from({ length: 200 }, () => createServiceId());

    expect(ids.every(isUuidV4)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps deriving phase ids from the parent id, never repeating inside one Service', () => {
    const serviceId = createServiceId();
    const now = new Date(1_757_840_400_000);

    const first = createServicePhaseId(serviceId, now);
    const second = createServicePhaseId(serviceId, now);

    expect(first.startsWith(`${serviceId}-phase-1757840400000-`)).toBe(true);
    expect(second.startsWith(`${serviceId}-phase-1757840400000-`)).toBe(true);
    expect(first).not.toBe(second);
  });
});
