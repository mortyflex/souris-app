// Souris — Checkout form rules (pure)
//
// Shared by the Appointment checkout and the standalone Sale payment step:
// two text entries (Carte, Espèces) and everything derived from them —
// cents, totals, difference, validity — computed from the raw text against
// an expected total, so no sheet invents money rules. No React, no
// persistence.
//
// Two amount rules, chosen by the caller:
//
//   tolerant (no `allocation`)   the standalone Sale: any positive total, the
//                                difference shown as « Écart » (unchanged)
//   allocation bounds            the Appointment final checkout (exactly the
//                                due) and its correction (a range): the total
//                                is judged by THE domain rule
//                                (`validatePaymentWithinBounds`); below the
//                                minimum → « Reste à répartir », above the
//                                maximum → an error. A typed value is never
//                                capped.
//
// With an allocation, the split also has OWNERS (`CheckoutSplit`): an amount
// the professional typed is `manual` and never rewritten; the other one stays
// `auto` and follows the target (what remains to reach it). Nothing changes
// before the professional interacts, and clearing an amount releases it
// without refilling it on the spot.

import {
  getPaymentTotalCents,
  isCheckoutTotalAcceptable,
  validatePaymentWithinBounds,
  type AppointmentPaymentAmounts,
  type AppointmentPaymentBounds,
  type PaymentMethod,
} from '@/domain/appointments';
import { formatCentsAsInput, parseEuroInputToCents } from '@/shared/lib/money';

/** Card / cash cents — the same shape for Appointments and Sales. */
export type CheckoutAmounts = AppointmentPaymentAmounts;

export interface CheckoutFormInput {
  readonly cardText: string;
  readonly cashText: string;
}

/**
 * The Appointment amount rule: the accepted total range (domain bounds) and
 * the total the automatic amount aims for — the due of a new checkout, the
 * recorded total of a correction.
 */
export interface CheckoutAllocation extends AppointmentPaymentBounds {
  readonly targetCents: number;
}

export interface CheckoutFormState {
  readonly expectedTotalCents: number;
  readonly cardCents: number | undefined;
  readonly cashCents: number | undefined;
  /** Card + cash when both entries parse; undefined otherwise. */
  readonly enteredTotalCents: number | undefined;
  /** entered − expected, only when the entry is valid. */
  readonly differenceCents: number | undefined;
  /** With an allocation: what is still to be split to reach the minimum (> 0), else undefined. */
  readonly unallocatedCents: number | undefined;
  /** With an allocation: the total is above the maximum. */
  readonly exceedsAllocation: boolean;
  readonly cardError: string | undefined;
  readonly cashError: string | undefined;
  /** True when the professional may confirm. */
  readonly canSubmit: boolean;
  /** The exact amounts to record when `canSubmit`. */
  readonly amounts: CheckoutAmounts | undefined;
}

const INVALID_AMOUNT_MESSAGE = 'Montant invalide';

export function deriveCheckoutFormState(
  expectedTotalCents: number,
  input: CheckoutFormInput,
  allocation?: AppointmentPaymentBounds,
): CheckoutFormState {
  const cardCents = parseEuroInputToCents(input.cardText);
  const cashCents = parseEuroInputToCents(input.cashText);
  const valid = cardCents !== undefined && cashCents !== undefined;
  const amounts: CheckoutAmounts | undefined = valid
    ? { cardAmountCents: cardCents, cashAmountCents: cashCents }
    : undefined;
  const enteredTotalCents = amounts ? getPaymentTotalCents(amounts) : undefined;
  const refusal = amounts && allocation ? validatePaymentWithinBounds(allocation, amounts) : undefined;
  const canSubmit =
    amounts !== undefined &&
    enteredTotalCents !== undefined &&
    (allocation
      ? refusal === undefined
      : isCheckoutTotalAcceptable(expectedTotalCents, enteredTotalCents));

  return {
    expectedTotalCents,
    cardCents,
    cashCents,
    enteredTotalCents,
    differenceCents: enteredTotalCents === undefined ? undefined : enteredTotalCents - expectedTotalCents,
    unallocatedCents:
      refusal === 'UNDER_DUE' && allocation && enteredTotalCents !== undefined
        ? allocation.minimumCents - enteredTotalCents
        : undefined,
    exceedsAllocation: refusal === 'EXCEEDS_DUE',
    cardError: cardCents === undefined ? INVALID_AMOUNT_MESSAGE : undefined,
    cashError: cashCents === undefined ? INVALID_AMOUNT_MESSAGE : undefined,
    canSubmit,
    amounts: canSubmit ? amounts : undefined,
  };
}

/**
 * What the other entry leaves to be received: tapping an empty method fills
 * the remaining expected amount. Never below zero, never when the entry
 * already holds a value the professional typed.
 */
export function getRemainingExpectedCents(
  expectedTotalCents: number,
  otherMethodCents: number | undefined,
): number {
  const remaining = expectedTotalCents - (otherMethodCents ?? 0);
  return remaining > 0 ? remaining : 0;
}

/** Who owns an amount: typed by the professional, or kept by Souris. */
export type CheckoutAmountOwner = 'auto' | 'manual';

export interface CheckoutSplitEntry {
  readonly text: string;
  readonly owner: CheckoutAmountOwner;
}

export interface CheckoutSplit {
  readonly CARD: CheckoutSplitEntry;
  readonly CASH: CheckoutSplitEntry;
}

function otherMethod(method: PaymentMethod): PaymentMethod {
  return method === 'CARD' ? 'CASH' : 'CARD';
}

function withEntry(split: CheckoutSplit, method: PaymentMethod, entry: CheckoutSplitEntry): CheckoutSplit {
  return method === 'CARD' ? { CARD: entry, CASH: split.CASH } : { CARD: split.CARD, CASH: entry };
}

function initialEntryText(cents: number | undefined): string {
  return cents === undefined || cents === 0 ? '' : formatCentsAsInput(cents);
}

/** What reaches the target from the other amount: empty when nothing remains. */
function remainderText(targetCents: number, otherCents: number): string {
  const remaining = targetCents - otherCents;
  return remaining > 0 ? formatCentsAsInput(remaining) : '';
}

/**
 * The split as the sheet opens: empty entries (checkout) or the recorded
 * amounts (correction), exactly as given — both `auto`, so the first amount
 * the professional types rebalances the other one, and nothing changes before.
 */
export function createCheckoutSplit(initial?: CheckoutAmounts): CheckoutSplit {
  return {
    CARD: { text: initialEntryText(initial?.cardAmountCents), owner: 'auto' },
    CASH: { text: initialEntryText(initial?.cashAmountCents), owner: 'auto' },
  };
}

/**
 * The professional types in one amount:
 *
 *   typed text        → it becomes `manual`; the other amount, while `auto`,
 *                       becomes what remains to reach the target (empty at 0,
 *                       never negative); a `manual` other amount is untouched
 *   cleared (blank)   → released back to `auto`, left empty (no refill on the
 *                       spot); the other amount is untouched
 *   unparseable text  → kept as typed (the field shows its error); the other
 *                       amount is untouched
 */
export function editCheckoutSplit(
  split: CheckoutSplit,
  method: PaymentMethod,
  text: string,
  targetCents: number,
): CheckoutSplit {
  const other = otherMethod(method);
  if (text.trim().length === 0) {
    return withEntry(split, method, { text: '', owner: 'auto' });
  }
  const edited = withEntry(split, method, { text, owner: 'manual' });
  const cents = parseEuroInputToCents(text);
  if (split[other].owner !== 'auto' || cents === undefined) return edited;
  return withEntry(edited, other, { text: remainderText(targetCents, cents), owner: 'auto' });
}

/**
 * « Reste » tapped on an empty amount: it takes what remains to reach the
 * target and stays `auto` (Souris's proposal, rebalanced by later edits of the
 * other amount).
 */
export function fillCheckoutSplitRemainder(
  split: CheckoutSplit,
  method: PaymentMethod,
  targetCents: number,
): CheckoutSplit {
  const otherCents = parseEuroInputToCents(split[otherMethod(method)].text) ?? 0;
  return withEntry(split, method, { text: remainderText(targetCents, otherCents), owner: 'auto' });
}

/**
 * The target changed (a discount draft moved the due): every `auto` amount
 * whose other amount is `manual` follows the new target. `manual` amounts, and
 * a split nobody typed in yet, are untouched.
 */
export function retargetCheckoutSplit(split: CheckoutSplit, targetCents: number): CheckoutSplit {
  let next = split;
  for (const method of ['CARD', 'CASH'] as const) {
    const other = split[otherMethod(method)];
    if (split[method].owner !== 'auto' || other.owner !== 'manual') continue;
    const otherCents = parseEuroInputToCents(other.text);
    if (otherCents === undefined) continue;
    next = withEntry(next, method, { text: remainderText(targetCents, otherCents), owner: 'auto' });
  }
  return next;
}
