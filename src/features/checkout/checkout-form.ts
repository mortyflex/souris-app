// Souris — Checkout form rules (pure)
//
// Shared by the Appointment checkout and the standalone Sale payment step:
// two text entries (Carte, Espèces) and everything derived from them —
// cents, totals, difference, validity — computed from the raw text against
// an expected total, so no sheet invents money rules. No React, no
// persistence.

import {
  getPaymentTotalCents,
  isCheckoutTotalAcceptable,
  type AppointmentPaymentAmounts,
} from '@/domain/appointments';
import { parseEuroInputToCents } from '@/shared/lib/money';

/** Card / cash cents — the same shape for Appointments and Sales. */
export type CheckoutAmounts = AppointmentPaymentAmounts;

export interface CheckoutFormInput {
  readonly cardText: string;
  readonly cashText: string;
}

export interface CheckoutFormState {
  readonly expectedTotalCents: number;
  readonly cardCents: number | undefined;
  readonly cashCents: number | undefined;
  /** Card + cash when both entries parse; undefined otherwise. */
  readonly enteredTotalCents: number | undefined;
  /** entered − expected, only when the entry is valid. */
  readonly differenceCents: number | undefined;
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
): CheckoutFormState {
  const cardCents = parseEuroInputToCents(input.cardText);
  const cashCents = parseEuroInputToCents(input.cashText);
  const valid = cardCents !== undefined && cashCents !== undefined;
  const amounts: CheckoutAmounts | undefined = valid
    ? { cardAmountCents: cardCents, cashAmountCents: cashCents }
    : undefined;
  const enteredTotalCents = amounts ? getPaymentTotalCents(amounts) : undefined;
  const canSubmit =
    enteredTotalCents !== undefined && isCheckoutTotalAcceptable(expectedTotalCents, enteredTotalCents);

  return {
    expectedTotalCents,
    cardCents,
    cashCents,
    enteredTotalCents,
    differenceCents: enteredTotalCents === undefined ? undefined : enteredTotalCents - expectedTotalCents,
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
