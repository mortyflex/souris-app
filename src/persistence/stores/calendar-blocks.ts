// Souris — Calendar Block store
//
// One row per block: staff member, interval, reason (schema v11). There is no
// client, price, payment or status column — a block is calendar availability
// only, and no financial or client query ever reads this table.
//
// A block is refused by the DOMAIN before any SQL runs (`createCalendarBlock`:
// end strictly after start, meaningful reason), and the table CHECKs refuse
// it again. Every write marks the CALENDAR_BLOCK aggregate in the sync outbox
// within the same transaction; deletion removes the row and leaves a
// CALENDAR_BLOCK DELETE entry that becomes the remote tombstone.

import { createCalendarBlock, type CalendarBlock } from '@/domain/calendar-blocks';

import { runInTransaction, type SourisDatabase } from '../database';
import { markAggregateDeleted, markAggregateUpserted } from '../sync/outbox';
import { fromSqlInstant, toSqlInstant } from '../values';

interface CalendarBlockRow {
  readonly id: string;
  readonly business_id: string;
  readonly staff_member_id: string;
  readonly start_at: string;
  readonly end_at: string;
  readonly reason: string;
}

function toCalendarBlock(row: CalendarBlockRow): CalendarBlock {
  return {
    id: row.id,
    businessId: row.business_id,
    staffMemberId: row.staff_member_id,
    startAt: fromSqlInstant(row.start_at),
    endAt: fromSqlInstant(row.end_at),
    reason: row.reason,
  };
}

const SELECT_CALENDAR_BLOCK =
  'SELECT id, business_id, staff_member_id, start_at, end_at, reason FROM calendar_blocks';

export function loadCalendarBlocks(db: SourisDatabase): readonly CalendarBlock[] {
  return db
    .getAllSync<CalendarBlockRow>(`${SELECT_CALENDAR_BLOCK} ORDER BY rowid`)
    .map(toCalendarBlock);
}

export function insertCalendarBlock(db: SourisDatabase, calendarBlock: CalendarBlock): void {
  const valid = createCalendarBlock(calendarBlock);
  runInTransaction(db, () => {
    db.runSync(
      'INSERT INTO calendar_blocks (id, business_id, staff_member_id, start_at, end_at, reason) VALUES (?, ?, ?, ?, ?, ?)',
      [
        valid.id,
        valid.businessId,
        valid.staffMemberId,
        toSqlInstant(valid.startAt),
        toSqlInstant(valid.endAt),
        valid.reason,
      ],
    );
    markAggregateUpserted(db, 'CALENDAR_BLOCK', valid.id);
  });
}

/** Replaces the interval and the reason; id, Business and staff member never change. */
export function updateCalendarBlock(db: SourisDatabase, calendarBlock: CalendarBlock): void {
  const valid = createCalendarBlock(calendarBlock);
  runInTransaction(db, () => {
    const result = db.runSync(
      'UPDATE calendar_blocks SET start_at = ?, end_at = ?, reason = ? WHERE id = ?',
      [toSqlInstant(valid.startAt), toSqlInstant(valid.endAt), valid.reason, valid.id],
    );
    if (result.changes !== 1) {
      throw new Error(`updateCalendarBlock: Calendar Block "${valid.id}" not found`);
    }
    markAggregateUpserted(db, 'CALENDAR_BLOCK', valid.id);
  });
}

/** Permanent deletion. Nothing references a block, so there is no guard. */
export function deleteCalendarBlock(db: SourisDatabase, calendarBlockId: string): void {
  runInTransaction(db, () => {
    const result = db.runSync('DELETE FROM calendar_blocks WHERE id = ?', [calendarBlockId]);
    if (result.changes === 1) markAggregateDeleted(db, 'CALENDAR_BLOCK', calendarBlockId);
  });
}
