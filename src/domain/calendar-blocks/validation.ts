// Souris — Calendar Block validity
//
// Source: docs/domain/CALENDAR_BLOCKS.md §2
//
// The two rules a block must satisfy on its own, before any schedule is
// looked at: the end is strictly after the start, and the reason is
// meaningful text. Pure functions; the editor, the session and the store all
// go through them so an invalid block can never be written.

import type { CalendarBlock } from './types';

export const CALENDAR_BLOCK_REASON_MAX_LENGTH = 80;

export type CalendarBlockValidationError = 'END_NOT_AFTER_START' | 'REASON_REQUIRED';

/**
 * Trims the edges and collapses inner whitespace runs (a reason is one short
 * line). A blank reason is no reason: `undefined`, never an empty string.
 */
export function normalizeCalendarBlockReason(reason: string | undefined): string | undefined {
  const normalized = (reason ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return undefined;
  return normalized.slice(0, CALENDAR_BLOCK_REASON_MAX_LENGTH).trim();
}

/** Every rule the candidate breaks, in a stable order. Empty = valid. */
export function validateCalendarBlock(candidate: {
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reason: string | undefined;
}): readonly CalendarBlockValidationError[] {
  const errors: CalendarBlockValidationError[] = [];
  const start = candidate.startAt.getTime();
  const end = candidate.endAt.getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) errors.push('END_NOT_AFTER_START');
  if (normalizeCalendarBlockReason(candidate.reason) === undefined) errors.push('REASON_REQUIRED');
  return errors;
}

/** A Calendar Block is invalid. `errors` lists the broken rules, never a value. */
export class CalendarBlockInvalidError extends Error {
  constructor(readonly errors: readonly CalendarBlockValidationError[]) {
    super(`Invalid Calendar Block: ${errors.join(', ')}`);
    this.name = 'CalendarBlockInvalidError';
  }
}

/**
 * Builds a valid block with its reason normalized, or throws
 * `CalendarBlockInvalidError`. The source object is never mutated.
 */
export function createCalendarBlock(input: CalendarBlock): CalendarBlock {
  const errors = validateCalendarBlock(input);
  if (errors.length > 0) throw new CalendarBlockInvalidError(errors);
  return {
    id: input.id,
    businessId: input.businessId,
    staffMemberId: input.staffMemberId,
    startAt: new Date(input.startAt),
    endAt: new Date(input.endAt),
    reason: normalizeCalendarBlockReason(input.reason) as string,
  };
}
