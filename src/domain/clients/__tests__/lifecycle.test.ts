import type { Client } from '../types';
import {
  archiveClient,
  canDeleteClientPermanently,
  isClientActive,
  isClientArchived,
  restoreClient,
} from '../lifecycle';

const active: Client = {
  id: 'client-1',
  firstName: 'Léa',
  lastName: 'Martin',
  phone: '06 12 34 56 78',
  birthday: { month: 2, day: 29 },
};

describe('Client lifecycle', () => {
  it('derives active state from the absence of archivedAt', () => {
    expect(active.archivedAt).toBeUndefined();
    expect(isClientActive(active)).toBe(true);
    expect(isClientArchived(active)).toBe(false);
  });

  it('archives with the exact instant and keeps every identity field', () => {
    const at = new Date(2026, 8, 12, 10, 30);

    const archived = archiveClient(active, at);

    expect(archived.archivedAt).toBe(at);
    expect(isClientArchived(archived)).toBe(true);
    expect(archived).toEqual({ ...active, archivedAt: at });
    expect(active.archivedAt).toBeUndefined();
  });

  it('is idempotent: archiving an archived Client keeps the first instant', () => {
    const first = archiveClient(active, new Date(2026, 8, 12));

    expect(archiveClient(first, new Date(2026, 8, 13))).toBe(first);
  });

  it('refuses an invalid archive instant', () => {
    expect(() => archiveClient(active, new Date('nope'))).toThrow(RangeError);
  });

  it('restores by removing archivedAt entirely (no null, no stale key)', () => {
    const restored = restoreClient(archiveClient(active, new Date()));

    expect(restored).toEqual(active);
    expect('archivedAt' in restored).toBe(false);
    expect(isClientActive(restored)).toBe(true);
    expect(restoreClient(active)).toBe(active);
  });

  it('allows permanent deletion only without any Appointment or Sale reference', () => {
    expect(canDeleteClientPermanently({ appointmentCount: 0, saleCount: 0 })).toBe(true);
    expect(canDeleteClientPermanently({ appointmentCount: 1, saleCount: 0 })).toBe(false);
    expect(canDeleteClientPermanently({ appointmentCount: 0, saleCount: 1 })).toBe(false);
    expect(canDeleteClientPermanently({ appointmentCount: 2, saleCount: 3 })).toBe(false);
  });
});
