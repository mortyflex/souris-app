// BeautIzzy — the correction / refund form (pure)
//
// What the professional edits before the review step, and how it becomes a
// domain draft. Money is integer cents throughout. The AMOUNT follows a
// suggestion until typed (units × snapshot unit price, never more than what
// remains refundable). The METHOD is never deduced in silence: it is
// preselected only when the original money is reliably known to have come by
// ONE method (the Sale's own payment, or — for a Revente — the Appointment's
// final payment and deposits), shown as such; otherwise it must be chosen.
// The RESTOCK is never assumed either: every line starts « not back in
// stock », even when the whole Sale is refunded, and only an explicit switch
// per line puts units back (docs/domain/SALES.md §15).

import {
  getSaleAdjustmentPosition,
  type Sale,
  type SaleAdjustment,
  type SaleAdjustmentDraft,
  type SaleAdjustmentPosition,
  type SaleAdjustmentReason,
} from '@/domain/sales';
import { eurosToCents, formatCentsAsInput, parseEuroInputToCents } from '@/shared/lib/money';

import {
  SALE_ADJUSTMENT_INTENT_REASONS,
  type RefundMethodChoice,
  type SaleAdjustmentIntent,
} from './presentation';

export type OriginalPaymentMethod = 'CARD' | 'CASH';

export interface AdjustmentFormLine {
  readonly quantity: number;
  readonly restock: boolean;
}

export interface AdjustmentForm {
  readonly reason: SaleAdjustmentReason;
  readonly lines: Readonly<Record<string, AdjustmentFormLine>>;
  /** The typed total; undefined while it follows the suggestion. */
  readonly amountText?: string;
  /** How the money ACTUALLY leaves; undefined until known or chosen. */
  readonly method?: RefundMethodChoice;
  /** `MIXED` only: the typed split. */
  readonly cardText?: string;
  readonly cashText?: string;
  readonly settlement: 'SETTLED' | 'PENDING';
  /** Local midnight of the day the money actually left. */
  readonly refundDay: Date;
  readonly note: string;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The methods the original money reliably came in with: a direct Sale's own
 * payment; for a Sale sold during an Appointment, that Appointment's final
 * payment and its ACTIVE deposits. `undefined` when nothing is known (a Sale
 * without payment, an Appointment not on this device).
 */
export function getOriginalPaymentMethods(
  sale: Sale,
  appointmentMoney?: {
    readonly payment?: { readonly cardAmountCents: number; readonly cashAmountCents: number };
    readonly activeDepositMethods: readonly OriginalPaymentMethod[];
  },
): readonly OriginalPaymentMethod[] | undefined {
  const methods = new Set<OriginalPaymentMethod>();
  const payment = sale.appointmentId === undefined ? sale.payment : appointmentMoney?.payment;
  if (payment?.cardAmountCents) methods.add('CARD');
  if (payment?.cashAmountCents) methods.add('CASH');
  if (sale.appointmentId !== undefined) for (const method of appointmentMoney?.activeDepositMethods ?? []) methods.add(method);
  return methods.size === 0 ? undefined : [...methods].sort();
}

/** Preselected ONLY when the original money reliably came by one method. */
export function getPreselectedRefundMethod(
  original: readonly OriginalPaymentMethod[] | undefined,
): RefundMethodChoice | undefined {
  return original?.length === 1 ? original[0] : undefined;
}

export function createAdjustmentForm(
  intent: SaleAdjustmentIntent,
  sale: Sale,
  adjustments: readonly SaleAdjustment[],
  now: Date,
  originalMethods?: readonly OriginalPaymentMethod[],
): AdjustmentForm {
  const reason = SALE_ADJUSTMENT_INTENT_REASONS[intent][0]!;
  const position = getSaleAdjustmentPosition(sale, adjustments);
  const lines: Record<string, AdjustmentFormLine> = {};
  for (const line of position.lines) {
    const quantity = intent === 'cancel' ? line.remainingQuantity : 0;
    lines[line.saleItemId] = { quantity, restock: false };
  }
  const method = getPreselectedRefundMethod(originalMethods);
  return { reason, lines, ...(method ? { method } : {}), settlement: 'SETTLED', refundDay: startOfLocalDay(now), note: '' };
}

/** Units × snapshot unit price of the affected lines, capped at what remains refundable. */
export function getSuggestedRefundCents(form: AdjustmentForm, position: SaleAdjustmentPosition): number {
  let cents = 0;
  for (const line of position.lines) {
    const quantity = form.lines[line.saleItemId]?.quantity ?? 0;
    cents += eurosToCents(line.item.unitPrice) * quantity;
  }
  return Math.min(cents, position.remainingCents);
}

export interface AdjustmentAmounts {
  /** The amount to give back; undefined when the typed text is unreadable. */
  readonly totalCents: number | undefined;
  readonly cardCents: number | undefined;
  readonly cashCents: number | undefined;
  /** Whether the total follows the suggestion (nothing typed). */
  readonly suggested: boolean;
  /** Money to give back and no method chosen: the form cannot be reviewed. */
  readonly methodMissing: boolean;
  /** `MIXED`: the typed split does not add up to a positive amount. */
  readonly splitInvalid: boolean;
}

export function getAdjustmentAmounts(form: AdjustmentForm, _sale: Sale, position: SaleAdjustmentPosition): AdjustmentAmounts {
  if (form.method === 'MIXED') {
    const card = parseEuroInputToCents(form.cardText ?? '');
    const cash = parseEuroInputToCents(form.cashText ?? '');
    const total = card === undefined || cash === undefined ? undefined : card + cash;
    return {
      totalCents: total,
      cardCents: card,
      cashCents: cash,
      suggested: false,
      methodMissing: false,
      splitInvalid: total === undefined || card === 0 || cash === 0,
    };
  }
  const suggested = form.amountText === undefined;
  const total = suggested ? getSuggestedRefundCents(form, position) : parseEuroInputToCents(form.amountText ?? '');
  if (total === undefined || total === 0) {
    return { totalCents: total, cardCents: total, cashCents: total === undefined ? undefined : 0, suggested, methodMissing: false, splitInvalid: false };
  }
  if (form.method === undefined) {
    return { totalCents: total, cardCents: undefined, cashCents: undefined, suggested, methodMissing: true, splitInvalid: false };
  }
  return {
    totalCents: total,
    cardCents: form.method === 'CARD' ? total : 0,
    cashCents: form.method === 'CASH' ? total : 0,
    suggested,
    methodMissing: false,
    splitInvalid: false,
  };
}

/** The editable text of an amount: the typed text, or the suggestion. */
export function getAmountText(typed: string | undefined, cents: number | undefined): string {
  if (typed !== undefined) return typed;
  return cents === undefined || cents === 0 ? '' : formatCentsAsInput(cents);
}

/**
 * The instant the money left: now for today; otherwise midday of the chosen
 * day, kept between the Sale and now so the domain never refuses it.
 */
export function getRefundInstant(day: Date, saleCompletedAt: Date, now: Date): Date {
  const today = startOfLocalDay(now);
  if (day.getTime() >= today.getTime()) return new Date(now.getTime());
  const midday = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0);
  const clamped = Math.min(Math.max(midday.getTime(), saleCompletedAt.getTime()), now.getTime());
  return new Date(clamped);
}

export function updateLineQuantity(
  form: AdjustmentForm,
  saleItemId: string,
  quantity: number,
  productAvailable: boolean,
): AdjustmentForm {
  const previous = form.lines[saleItemId] ?? { quantity: 0, restock: false };
  // An explicit « Remis en stock » survives a quantity change; nothing turns it on by itself.
  const restock = quantity > 0 && productAvailable && previous.restock;
  return { ...form, lines: { ...form.lines, [saleItemId]: { quantity, restock } } };
}

/** The domain draft; `undefined` amounts (unreadable text) become invalid cents the domain refuses. */
export function toSaleAdjustmentDraft(
  form: AdjustmentForm,
  amounts: AdjustmentAmounts,
  id: string,
  sale: Sale,
  now: Date,
): Omit<SaleAdjustmentDraft, 'businessId' | 'staffMemberId'> {
  const note = form.note.trim();
  return {
    id,
    reason: form.reason,
    ...(note.length > 0 ? { note } : {}),
    lines: Object.entries(form.lines)
      .filter(([, line]) => line.quantity > 0)
      .map(([saleItemId, line]) => ({ saleItemId, quantity: line.quantity, restock: line.restock })),
    refundCardCents: amounts.cardCents ?? Number.NaN,
    refundCashCents: amounts.cashCents ?? Number.NaN,
    settlement: form.settlement,
    ...(form.settlement === 'SETTLED' ? { refundedAt: getRefundInstant(form.refundDay, sale.completedAt, now) } : {}),
  };
}
