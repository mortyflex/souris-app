// BeautIzzy — Sale adjustments: corrections and refunds (pure)
//
// Source: docs/domain/SALES.md §15, docs/product/SALE_ADJUSTMENTS_PLAN.md
//
// A completed Sale is NEVER rewritten. A correction or a refund is its own
// record, linked to the Sale, kept forever:
//
//   REFUND     units affected (with or without a physical return to stock)
//              and/or money given back to the client (card / cash), PENDING
//              until the money actually left, then SETTLED on the day it did
//   REVERSAL   a compensating record of ONE SETTLED refund, with one of two
//              explicit meanings — a settled refund is never erased, edited or
//              voided, and a refund that really happened never disappears:
//                RECORDED_IN_ERROR  the refund was entered but NEVER paid: the
//                                   compensation mirrors it exactly (amounts,
//                                   methods) ON THE SAME DAY, so that day's Caisse
//                                   reads what really happened; recorded today
//                REFUND_RETURNED    the refund WAS paid, and the money later came
//                                   back to the business: a new receipt of the
//                                   whole refunded amount, on the day it came back,
//                                   by the method it actually came back with
//              A refund that was really paid and stays paid has nothing to undo.
//
//   PENDING ──settle──▶ SETTLED      (final)
//      └────void────▶ VOIDED         (final; the entry was a mistake)
//
// The history of a record is fully derived from its instants (one transition
// each, at most): recorded (initial status) → settled → voided.
//
// Money rules (integer cents only, snapshots only — never the catalogue):
//
//   refundable base   a direct Sale: the payment actually received (0 when
//                     none was ever recorded — no refund of money BeautIzzy
//                     never saw); a Sale sold during an Appointment: the exact
//                     snapshot total of its lines, once that Appointment is
//                     settled (its checkout received that money)
//   committed         Σ refund amounts of the EFFECTIVE refunds — PENDING and
//                     SETTLED, not VOIDED, not reversed
//   remaining         base − committed, never negative; a new refund never
//                     exceeds it
//
// Unit rules, per Sale line: Σ units of the effective refunds <= sold
// quantity. Restocked units are part of those units, so stock can never be
// restored twice.
//
// Cash movement: ONLY a SETTLED record moves money, on its `refundedAt`:
// a refund negatively, a reversal positively. PENDING and VOIDED move nothing.
// A Sale sold during an Appointment keeps its Appointment payment untouched:
// the refund is the one separate movement — nothing is counted twice.
//
// Nothing here applies anything: the store re-runs these rules on the
// stored rows inside its transaction, and the remote enforces the same
// ceilings at its transaction boundary (CLOUD_SYNC.md §28).

import { getSaleTotalCents } from '../appointments/expected-total';
import type { Sale, SaleItem } from './types';

export type SaleAdjustmentKind = 'REFUND' | 'REVERSAL';
export type SaleAdjustmentStatus = 'PENDING' | 'SETTLED' | 'VOIDED';

export const SALE_ADJUSTMENT_REASONS = [
  'NOT_DELIVERED',
  'WRONG_PRODUCT',
  'WRONG_QUANTITY',
  'RETURN',
  'CUSTOMER_REFUND',
  'SALE_CANCELLED',
  'RECORDED_IN_ERROR',
  'REFUND_RETURNED',
  'OTHER',
] as const;

export type SaleAdjustmentReason = (typeof SALE_ADJUSTMENT_REASONS)[number];

export function isSaleAdjustmentReason(value: string): value is SaleAdjustmentReason {
  return (SALE_ADJUSTMENT_REASONS as readonly string[]).includes(value);
}

/** The two meanings a compensation may have; a refund never carries them. */
export type SaleAdjustmentReversalReason = Extract<SaleAdjustmentReason, 'RECORDED_IN_ERROR' | 'REFUND_RETURNED'>;

export function isSaleAdjustmentReversalReason(reason: SaleAdjustmentReason): reason is SaleAdjustmentReversalReason {
  return reason === 'RECORDED_IN_ERROR' || reason === 'REFUND_RETURNED';
}

/** One affected line, copied from the Sale snapshot at adjustment time. */
export interface SaleAdjustmentItem {
  readonly id: string;
  readonly saleItemId: string;
  readonly productId: string;
  readonly productName: string;
  readonly unitPriceCents: number;
  /** Units affected: integer >= 1. */
  readonly quantity: number;
  /** Whether those units physically went back to stock. */
  readonly restock: boolean;
}

export interface SaleAdjustment {
  readonly id: string;
  readonly businessId: string;
  readonly saleId: string;
  readonly kind: SaleAdjustmentKind;
  /** REVERSAL only: the SETTLED refund it neutralises. */
  readonly reversesAdjustmentId?: string;
  readonly reason: SaleAdjustmentReason;
  readonly note?: string;
  /** Operator (`features/appointments/current-staff-member.ts`). */
  readonly staffMemberId: string;
  /** REFUND: the affected lines (may be empty for a money-only refund). REVERSAL: always empty. */
  readonly items: readonly SaleAdjustmentItem[];
  readonly refundCardCents: number;
  readonly refundCashCents: number;
  readonly initialStatus: 'PENDING' | 'SETTLED';
  readonly status: SaleAdjustmentStatus;
  /** When the money ACTUALLY left (the Caisse day). Present once settled. */
  readonly refundedAt?: Date;
  /** When the settled state was RECORDED in BeautIzzy. Present once settled. */
  readonly settledAt?: Date;
  readonly voidedAt?: Date;
  /** When the record was entered on the device. */
  readonly recordedAt: Date;
}

/** A record that is not valid canonical data. Nothing may be written. */
export class SaleAdjustmentInvalidError extends RangeError {
  constructor(readonly field: string) {
    super(`Sale adjustment is invalid: ${field}`);
    this.name = 'SaleAdjustmentInvalidError';
  }
}

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function getSaleAdjustmentAmountCents(
  adjustment: Pick<SaleAdjustment, 'refundCardCents' | 'refundCashCents'>,
): number {
  return adjustment.refundCardCents + adjustment.refundCashCents;
}

/**
 * Validates the SHAPE of a record (ids, cents, vocabularies, the status ↔
 * instants rules) and returns an independent copy. Whether the Sale may
 * receive it is `validateSaleAdjustmentDraft`'s question.
 */
export function createSaleAdjustment(input: SaleAdjustment): SaleAdjustment {
  if (input.id.trim().length === 0) throw new SaleAdjustmentInvalidError('id');
  if (input.businessId.trim().length === 0) throw new SaleAdjustmentInvalidError('businessId');
  if (input.saleId.trim().length === 0) throw new SaleAdjustmentInvalidError('saleId');
  if (input.staffMemberId.trim().length === 0) throw new SaleAdjustmentInvalidError('staffMemberId');
  if (!isSaleAdjustmentReason(input.reason)) throw new SaleAdjustmentInvalidError('reason');
  if (!isCents(input.refundCardCents)) throw new SaleAdjustmentInvalidError('refundCardCents');
  if (!isCents(input.refundCashCents)) throw new SaleAdjustmentInvalidError('refundCashCents');
  if (!isValidDate(input.recordedAt)) throw new SaleAdjustmentInvalidError('recordedAt');
  if (input.initialStatus !== 'PENDING' && input.initialStatus !== 'SETTLED') {
    throw new SaleAdjustmentInvalidError('initialStatus');
  }

  if (input.kind === 'REVERSAL') {
    if (!input.reversesAdjustmentId) throw new SaleAdjustmentInvalidError('reversesAdjustmentId');
    if (input.items.length > 0) throw new SaleAdjustmentInvalidError('items');
    if (input.initialStatus !== 'SETTLED' || input.status !== 'SETTLED') {
      throw new SaleAdjustmentInvalidError('status');
    }
    if (!isSaleAdjustmentReversalReason(input.reason)) throw new SaleAdjustmentInvalidError('reason');
  } else if (input.kind === 'REFUND') {
    if (input.reversesAdjustmentId !== undefined) throw new SaleAdjustmentInvalidError('reversesAdjustmentId');
    if (isSaleAdjustmentReversalReason(input.reason)) throw new SaleAdjustmentInvalidError('reason');
    if (input.items.length === 0 && getSaleAdjustmentAmountCents(input) === 0) {
      throw new SaleAdjustmentInvalidError('items');
    }
  } else {
    throw new SaleAdjustmentInvalidError('kind');
  }

  const ids = new Set<string>();
  for (const item of input.items) {
    if (item.id.trim().length === 0 || ids.has(item.id)) throw new SaleAdjustmentInvalidError('items.id');
    ids.add(item.id);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new SaleAdjustmentInvalidError('items.quantity');
    }
    if (!isCents(item.unitPriceCents)) throw new SaleAdjustmentInvalidError('items.unitPriceCents');
  }

  switch (input.status) {
    case 'PENDING':
      if (input.refundedAt || input.settledAt || input.voidedAt) throw new SaleAdjustmentInvalidError('status');
      break;
    case 'SETTLED':
      if (!isValidDate(input.refundedAt) || !isValidDate(input.settledAt) || input.voidedAt) {
        throw new SaleAdjustmentInvalidError('status');
      }
      break;
    case 'VOIDED':
      if (!isValidDate(input.voidedAt)) throw new SaleAdjustmentInvalidError('voidedAt');
      if ((input.refundedAt === undefined) !== (input.settledAt === undefined)) {
        throw new SaleAdjustmentInvalidError('settledAt');
      }
      break;
    default:
      throw new SaleAdjustmentInvalidError('status');
  }
  if (input.initialStatus === 'PENDING' && input.status === 'PENDING' && input.settledAt) {
    throw new SaleAdjustmentInvalidError('settledAt');
  }

  const copyDate = (value: Date | undefined) => (value ? new Date(value.getTime()) : undefined);
  const note = input.note?.trim();
  return {
    id: input.id,
    businessId: input.businessId,
    saleId: input.saleId,
    kind: input.kind,
    ...(input.reversesAdjustmentId ? { reversesAdjustmentId: input.reversesAdjustmentId } : {}),
    reason: input.reason,
    ...(note ? { note } : {}),
    staffMemberId: input.staffMemberId,
    items: input.items.map((item) => ({ ...item })),
    refundCardCents: input.refundCardCents,
    refundCashCents: input.refundCashCents,
    initialStatus: input.initialStatus,
    status: input.status,
    ...(input.refundedAt ? { refundedAt: copyDate(input.refundedAt) } : {}),
    ...(input.settledAt ? { settledAt: copyDate(input.settledAt) } : {}),
    ...(input.voidedAt ? { voidedAt: copyDate(input.voidedAt) } : {}),
    recordedAt: new Date(input.recordedAt.getTime()),
  };
}

// ---------------------------------------------------------------------------
// Effectiveness, position, history
// ---------------------------------------------------------------------------

/** The adjustments of ONE Sale, oldest record first (ties by id). */
export function getSaleAdjustments(
  adjustments: readonly SaleAdjustment[],
  saleId: string,
): readonly SaleAdjustment[] {
  return adjustments
    .filter((adjustment) => adjustment.saleId === saleId)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime() || a.id.localeCompare(b.id));
}

/** The reversal of a refund, if one exists. */
export function findSaleAdjustmentReversal(
  adjustments: readonly SaleAdjustment[],
  adjustmentId: string,
): SaleAdjustment | undefined {
  return adjustments.find(
    (candidate) =>
      candidate.kind === 'REVERSAL' &&
      candidate.reversesAdjustmentId === adjustmentId &&
      candidate.status !== 'VOIDED',
  );
}

/** A refund that still counts: not VOIDED and not neutralised by a reversal. */
export function isEffectiveSaleRefund(adjustment: SaleAdjustment, all: readonly SaleAdjustment[]): boolean {
  return (
    adjustment.kind === 'REFUND' &&
    adjustment.status !== 'VOIDED' &&
    findSaleAdjustmentReversal(all, adjustment.id) === undefined
  );
}

/** Where the money of a Sale was received. */
export type SaleAdjustmentEligibility =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** A Revente whose Appointment has not received its money (or is not on this device). */
      readonly reason: 'APPOINTMENT_NOT_SETTLED';
    };

/**
 * A direct Sale can always be corrected (its money base may be zero). A Sale
 * sold during an Appointment only once that Appointment is settled: before
 * that, the product is simply removed from the Appointment (SALES.md §10).
 */
export function getSaleAdjustmentEligibility(
  sale: Pick<Sale, 'appointmentId'>,
  appointmentSettled: boolean,
): SaleAdjustmentEligibility {
  if (sale.appointmentId === undefined || appointmentSettled) return { ok: true };
  return { ok: false, reason: 'APPOINTMENT_NOT_SETTLED' };
}

/** The money a Sale may give back at most, before any refund. */
export function getSaleRefundableBaseCents(sale: Pick<Sale, 'appointmentId' | 'payment' | 'items'>): number {
  if (sale.appointmentId !== undefined) return getSaleTotalCents(sale);
  if (!sale.payment) return 0;
  return sale.payment.cardAmountCents + sale.payment.cashAmountCents;
}

export interface SaleAdjustmentLinePosition {
  readonly saleItemId: string;
  readonly item: SaleItem;
  readonly soldQuantity: number;
  /** Units of the effective refunds. */
  readonly adjustedQuantity: number;
  /** Units of the effective refunds that went back to stock. */
  readonly restockedQuantity: number;
  readonly remainingQuantity: number;
}

export interface SaleAdjustmentPosition {
  readonly baseCents: number;
  /** Σ effective refunds, PENDING and SETTLED. */
  readonly committedCents: number;
  readonly settledCents: number;
  readonly pendingCents: number;
  readonly remainingCents: number;
  readonly lines: readonly SaleAdjustmentLinePosition[];
}

export function getSaleAdjustmentPosition(
  sale: Sale,
  allAdjustments: readonly SaleAdjustment[],
): SaleAdjustmentPosition {
  const adjustments = allAdjustments.filter((adjustment) => adjustment.saleId === sale.id);
  const effective = adjustments.filter((adjustment) => isEffectiveSaleRefund(adjustment, adjustments));
  let settledCents = 0;
  let pendingCents = 0;
  const adjustedByLine = new Map<string, number>();
  const restockedByLine = new Map<string, number>();
  for (const adjustment of effective) {
    const amount = getSaleAdjustmentAmountCents(adjustment);
    if (adjustment.status === 'SETTLED') settledCents += amount;
    else pendingCents += amount;
    for (const item of adjustment.items) {
      adjustedByLine.set(item.saleItemId, (adjustedByLine.get(item.saleItemId) ?? 0) + item.quantity);
      if (item.restock) {
        restockedByLine.set(item.saleItemId, (restockedByLine.get(item.saleItemId) ?? 0) + item.quantity);
      }
    }
  }
  const baseCents = getSaleRefundableBaseCents(sale);
  const committedCents = settledCents + pendingCents;
  return {
    baseCents,
    committedCents,
    settledCents,
    pendingCents,
    remainingCents: Math.max(baseCents - committedCents, 0),
    lines: sale.items.map((item) => {
      const adjustedQuantity = adjustedByLine.get(item.id) ?? 0;
      return {
        saleItemId: item.id,
        item,
        soldQuantity: item.quantity,
        adjustedQuantity,
        restockedQuantity: restockedByLine.get(item.id) ?? 0,
        remainingQuantity: Math.max(item.quantity - adjustedQuantity, 0),
      };
    }),
  };
}

export type SaleAdjustmentTransitionKind = 'RECORDED_PENDING' | 'RECORDED_SETTLED' | 'SETTLED' | 'VOIDED';

export interface SaleAdjustmentTransition {
  readonly kind: SaleAdjustmentTransitionKind;
  /** When the transition was recorded in BeautIzzy. */
  readonly at: Date;
}

/** The auditable history of a record, oldest first, derived from its instants. */
export function getSaleAdjustmentHistory(adjustment: SaleAdjustment): readonly SaleAdjustmentTransition[] {
  const history: SaleAdjustmentTransition[] = [
    {
      kind: adjustment.initialStatus === 'SETTLED' ? 'RECORDED_SETTLED' : 'RECORDED_PENDING',
      at: adjustment.recordedAt,
    },
  ];
  if (adjustment.initialStatus === 'PENDING' && adjustment.settledAt) {
    history.push({ kind: 'SETTLED', at: adjustment.settledAt });
  }
  if (adjustment.voidedAt) history.push({ kind: 'VOIDED', at: adjustment.voidedAt });
  return history;
}

// ---------------------------------------------------------------------------
// Drafts and transitions
// ---------------------------------------------------------------------------

export interface SaleAdjustmentDraftLine {
  readonly saleItemId: string;
  readonly quantity: number;
  readonly restock: boolean;
}

export interface SaleAdjustmentDraft {
  readonly id: string;
  readonly businessId: string;
  readonly staffMemberId: string;
  readonly reason: SaleAdjustmentReason;
  readonly note?: string;
  readonly lines: readonly SaleAdjustmentDraftLine[];
  readonly refundCardCents: number;
  readonly refundCashCents: number;
  /** SETTLED: the money already left, on `refundedAt`. PENDING: still to give back. */
  readonly settlement: 'PENDING' | 'SETTLED';
  readonly refundedAt?: Date;
}

export type SaleAdjustmentIssue =
  | { readonly kind: 'NOT_ELIGIBLE'; readonly reason: 'APPOINTMENT_NOT_SETTLED' }
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'UNKNOWN_LINE'; readonly saleItemId: string }
  | { readonly kind: 'DUPLICATE_LINE'; readonly saleItemId: string }
  | { readonly kind: 'INVALID_QUANTITY'; readonly saleItemId: string }
  | {
      readonly kind: 'QUANTITY_EXCEEDS_REMAINING';
      readonly saleItemId: string;
      readonly requested: number;
      readonly remaining: number;
    }
  | { readonly kind: 'RESTOCK_PRODUCT_MISSING'; readonly productId: string; readonly productName: string }
  | { readonly kind: 'INVALID_AMOUNT' }
  | { readonly kind: 'AMOUNT_EXCEEDS_REMAINING'; readonly requested: number; readonly remaining: number }
  | { readonly kind: 'INVALID_REFUND_DATE' };

export interface SaleAdjustmentContext {
  readonly sale: Sale;
  /** Every known adjustment (only those of the Sale are read). */
  readonly adjustments: readonly SaleAdjustment[];
  readonly appointmentSettled: boolean;
  /** Whether a Product of the catalogue can receive restocked units. */
  readonly productExists: (productId: string) => boolean;
  readonly now: Date;
}

/** Whole-draft validation: every issue at once, nothing applied. */
export function validateSaleAdjustmentDraft(
  context: SaleAdjustmentContext,
  draft: SaleAdjustmentDraft,
): readonly SaleAdjustmentIssue[] {
  const issues: SaleAdjustmentIssue[] = [];
  const eligibility = getSaleAdjustmentEligibility(context.sale, context.appointmentSettled);
  if (!eligibility.ok) return [{ kind: 'NOT_ELIGIBLE', reason: eligibility.reason }];

  const position = getSaleAdjustmentPosition(context.sale, context.adjustments);
  const linesById = new Map(position.lines.map((line) => [line.saleItemId, line]));
  const seen = new Set<string>();
  for (const line of draft.lines) {
    const known = linesById.get(line.saleItemId);
    if (!known) {
      issues.push({ kind: 'UNKNOWN_LINE', saleItemId: line.saleItemId });
      continue;
    }
    if (seen.has(line.saleItemId)) {
      issues.push({ kind: 'DUPLICATE_LINE', saleItemId: line.saleItemId });
      continue;
    }
    seen.add(line.saleItemId);
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      issues.push({ kind: 'INVALID_QUANTITY', saleItemId: line.saleItemId });
      continue;
    }
    if (line.quantity > known.remainingQuantity) {
      issues.push({
        kind: 'QUANTITY_EXCEEDS_REMAINING',
        saleItemId: line.saleItemId,
        requested: line.quantity,
        remaining: known.remainingQuantity,
      });
    }
    if (line.restock && !context.productExists(known.item.productId)) {
      issues.push({
        kind: 'RESTOCK_PRODUCT_MISSING',
        productId: known.item.productId,
        productName: known.item.productName,
      });
    }
  }

  const validAmounts = isCents(draft.refundCardCents) && isCents(draft.refundCashCents);
  if (!validAmounts) {
    issues.push({ kind: 'INVALID_AMOUNT' });
  } else {
    const requested = draft.refundCardCents + draft.refundCashCents;
    if (requested > position.remainingCents) {
      issues.push({ kind: 'AMOUNT_EXCEEDS_REMAINING', requested, remaining: position.remainingCents });
    }
    if (draft.lines.length === 0 && requested === 0) issues.push({ kind: 'EMPTY' });
    // Money settled now needs its real date: never in the future, never before the Sale.
    if (requested > 0 && draft.settlement === 'SETTLED') {
      const refundedAt = draft.refundedAt;
      if (
        !isValidDate(refundedAt) ||
        refundedAt.getTime() > context.now.getTime() ||
        refundedAt.getTime() < context.sale.completedAt.getTime()
      ) {
        issues.push({ kind: 'INVALID_REFUND_DATE' });
      }
    }
  }
  return issues;
}

/** Whole units to give back to (or take from) one Product. */
export interface SaleAdjustmentStockChange {
  readonly productId: string;
  readonly quantity: number;
}

export type SaleAdjustmentPreparation =
  | {
      readonly ok: true;
      readonly adjustment: SaleAdjustment;
      /** Units that go back to stock, summed per Product. */
      readonly restorations: readonly SaleAdjustmentStockChange[];
    }
  | { readonly ok: false; readonly issues: readonly SaleAdjustmentIssue[] };

function sumByProduct(items: readonly SaleAdjustmentItem[]): readonly SaleAdjustmentStockChange[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!item.restock) continue;
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  }
  return [...totals].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Stable unique item identity within one adjustment. */
export function createSaleAdjustmentItemId(adjustmentId: string, sequence: number): string {
  return `${adjustmentId}-item-${sequence}`;
}

/**
 * Builds the immutable record and the stock it restores, or the issues. A
 * record without any money is a pure correction (units, stock): it is
 * SETTLED at once, since nothing remains to happen.
 */
export function prepareSaleAdjustment(
  context: SaleAdjustmentContext,
  draft: SaleAdjustmentDraft,
): SaleAdjustmentPreparation {
  const issues = validateSaleAdjustmentDraft(context, draft);
  if (issues.length > 0) return { ok: false, issues };

  const linesById = new Map(context.sale.items.map((item) => [item.id, item]));
  const items: SaleAdjustmentItem[] = draft.lines.map((line, index) => {
    const source = linesById.get(line.saleItemId)!;
    return {
      id: createSaleAdjustmentItemId(draft.id, index),
      saleItemId: source.id,
      productId: source.productId,
      productName: source.productName,
      unitPriceCents: getSaleTotalCents({ items: [{ unitPrice: source.unitPrice, quantity: 1 }] }),
      quantity: line.quantity,
      restock: line.restock,
    };
  });
  const amount = draft.refundCardCents + draft.refundCashCents;
  const settled = draft.settlement === 'SETTLED' || amount === 0;
  const recordedAt = new Date(context.now.getTime());
  const adjustment = createSaleAdjustment({
    id: draft.id,
    businessId: draft.businessId,
    saleId: context.sale.id,
    kind: 'REFUND',
    reason: draft.reason,
    note: draft.note,
    staffMemberId: draft.staffMemberId,
    items,
    refundCardCents: draft.refundCardCents,
    refundCashCents: draft.refundCashCents,
    initialStatus: settled ? 'SETTLED' : 'PENDING',
    status: settled ? 'SETTLED' : 'PENDING',
    ...(settled
      ? { refundedAt: amount > 0 && draft.refundedAt ? draft.refundedAt : recordedAt, settledAt: recordedAt }
      : {}),
    recordedAt,
  });
  return { ok: true, adjustment, restorations: sumByProduct(items) };
}

export type SaleAdjustmentTransitionIssue =
  | 'NOT_PENDING'
  | 'NOT_SETTLED'
  | 'NOT_A_REFUND'
  | 'ALREADY_REVERSED'
  | 'INVALID_REFUND_DATE'
  /** A returned refund must come back whole: the amounts must add up to the refund. */
  | 'INVALID_AMOUNT';

export type SaleAdjustmentTransitionResult<Extra = object> =
  | ({ readonly ok: true; readonly adjustment: SaleAdjustment } & Extra)
  | { readonly ok: false; readonly issue: SaleAdjustmentTransitionIssue };

/** PENDING → SETTLED: the money actually left on `refundedAt`. */
export function settleSaleAdjustment(
  adjustment: SaleAdjustment,
  sale: Pick<Sale, 'completedAt'>,
  refundedAt: Date,
  now: Date,
): SaleAdjustmentTransitionResult {
  if (adjustment.status !== 'PENDING') return { ok: false, issue: 'NOT_PENDING' };
  if (
    !isValidDate(refundedAt) ||
    refundedAt.getTime() > now.getTime() ||
    refundedAt.getTime() < sale.completedAt.getTime()
  ) {
    return { ok: false, issue: 'INVALID_REFUND_DATE' };
  }
  return {
    ok: true,
    adjustment: createSaleAdjustment({
      ...adjustment,
      status: 'SETTLED',
      refundedAt,
      settledAt: new Date(now.getTime()),
    }),
  };
}

/**
 * PENDING → VOIDED: the entry was a mistake. Its restocked units are taken
 * back from stock (`stockDecrements`). A SETTLED record is never voided —
 * except when `serverRefused`: the remote refused it (an over-refund across
 * two devices), it never became authoritative, and voiding it is how the
 * professional resolves the conflict, explicitly and traceably.
 */
export function voidSaleAdjustment(
  adjustment: SaleAdjustment,
  now: Date,
  options: { readonly serverRefused?: boolean } = {},
): SaleAdjustmentTransitionResult<{ readonly stockDecrements: readonly SaleAdjustmentStockChange[] }> {
  const voidable =
    adjustment.status === 'PENDING' ||
    (adjustment.status === 'SETTLED' && adjustment.kind === 'REFUND' && options.serverRefused === true);
  if (!voidable) return { ok: false, issue: 'NOT_PENDING' };
  return {
    ok: true,
    adjustment: createSaleAdjustment({ ...adjustment, status: 'VOIDED', voidedAt: new Date(now.getTime()) }),
    stockDecrements: sumByProduct(adjustment.items),
  };
}

/** Whether a SETTLED refund may still be neutralised by a reversal. */
export function canReverseSaleAdjustment(adjustment: SaleAdjustment, all: readonly SaleAdjustment[]): boolean {
  return (
    adjustment.kind === 'REFUND' &&
    adjustment.status === 'SETTLED' &&
    findSaleAdjustmentReversal(all, adjustment.id) === undefined
  );
}

export type SaleAdjustmentReversalInput =
  | {
      readonly id: string;
      readonly staffMemberId: string;
      readonly note?: string;
      readonly now: Date;
      /** The refund was entered but never paid. */
      readonly reason: 'RECORDED_IN_ERROR';
    }
  | {
      readonly id: string;
      readonly staffMemberId: string;
      readonly note?: string;
      readonly now: Date;
      /** The refund was paid, then the money came back to the business. */
      readonly reason: 'REFUND_RETURNED';
      /** The day it came back: never before the refund, never in the future. */
      readonly returnedAt: Date;
      /** How it ACTUALLY came back — never assumed from the refund. Must add up to the refund. */
      readonly cardCents: number;
      readonly cashCents: number;
    };

/**
 * A compensating record of a SETTLED refund (see the header for its two
 * meanings). Its restocked units leave the stock again (`stockDecrements`):
 * once the refund no longer stands, the Sale counts those units as sold. The
 * refund itself is never touched; both records stay visible with their dates.
 */
export function prepareSaleAdjustmentReversal(
  target: SaleAdjustment,
  all: readonly SaleAdjustment[],
  input: SaleAdjustmentReversalInput,
): SaleAdjustmentTransitionResult<{ readonly stockDecrements: readonly SaleAdjustmentStockChange[] }> {
  if (target.kind !== 'REFUND') return { ok: false, issue: 'NOT_A_REFUND' };
  if (target.status !== 'SETTLED' || !target.refundedAt) return { ok: false, issue: 'NOT_SETTLED' };
  if (findSaleAdjustmentReversal(all, target.id)) return { ok: false, issue: 'ALREADY_REVERSED' };
  const recordedAt = new Date(input.now.getTime());
  let movedAt: Date;
  let cardCents: number;
  let cashCents: number;
  if (input.reason === 'RECORDED_IN_ERROR') {
    // Neutralises the fictitious movement where it was counted: the same day, the same methods.
    movedAt = new Date(target.refundedAt.getTime());
    cardCents = target.refundCardCents;
    cashCents = target.refundCashCents;
  } else {
    if (
      !isCents(input.cardCents) ||
      !isCents(input.cashCents) ||
      input.cardCents + input.cashCents !== getSaleAdjustmentAmountCents(target) ||
      getSaleAdjustmentAmountCents(target) === 0
    ) {
      return { ok: false, issue: 'INVALID_AMOUNT' };
    }
    if (
      !isValidDate(input.returnedAt) ||
      input.returnedAt.getTime() < target.refundedAt.getTime() ||
      input.returnedAt.getTime() > input.now.getTime()
    ) {
      return { ok: false, issue: 'INVALID_REFUND_DATE' };
    }
    movedAt = new Date(input.returnedAt.getTime());
    cardCents = input.cardCents;
    cashCents = input.cashCents;
  }
  return {
    ok: true,
    adjustment: createSaleAdjustment({
      id: input.id,
      businessId: target.businessId,
      saleId: target.saleId,
      kind: 'REVERSAL',
      reversesAdjustmentId: target.id,
      reason: input.reason,
      note: input.note,
      staffMemberId: input.staffMemberId,
      items: [],
      refundCardCents: cardCents,
      refundCashCents: cashCents,
      initialStatus: 'SETTLED',
      status: 'SETTLED',
      refundedAt: movedAt,
      settledAt: recordedAt,
      recordedAt,
    }),
    stockDecrements: sumByProduct(target.items),
  };
}

// ---------------------------------------------------------------------------
// Money movement
// ---------------------------------------------------------------------------

/** The signed money movement of ONE record, or undefined when it moves nothing. */
export interface SaleAdjustmentCashMovement {
  readonly at: Date;
  /** Signed: negative for a refund, positive for a reversal. */
  readonly cardCents: number;
  readonly cashCents: number;
}

export function getSaleAdjustmentCashMovement(adjustment: SaleAdjustment): SaleAdjustmentCashMovement | undefined {
  if (adjustment.status !== 'SETTLED' || !adjustment.refundedAt) return undefined;
  if (getSaleAdjustmentAmountCents(adjustment) === 0) return undefined;
  const sign = adjustment.kind === 'REFUND' ? -1 : 1;
  return {
    at: adjustment.refundedAt,
    // `0 * -1` is `-0`: normalised so equality and formatting stay plain.
    cardCents: adjustment.refundCardCents === 0 ? 0 : sign * adjustment.refundCardCents,
    cashCents: adjustment.refundCashCents === 0 ? 0 : sign * adjustment.refundCashCents,
  };
}
