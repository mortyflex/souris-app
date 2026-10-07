// BeautIzzy — « Prendre un acompte » form rules (pure)
//
// The raw amount text → exact integer cents, validated by THE domain rule
// (`validateAppointmentDepositAmount`) against the Appointment's current
// position. Quick amounts only fill the entry: nothing percentage-based is
// ever stored — a deposit is always persisted as the cents it amounts to.
// No React, no persistence.

import {
  validateAppointmentDepositAmount,
  type AppointmentDepositPosition,
  type AppointmentStatus,
} from '@/domain/appointments';
import { formatEuroCents, parseEuroInputToCents } from '@/shared/lib/money';

/** The quick amounts offered above the entry: 10, 20, 30, 50 €. */
export const DEPOSIT_QUICK_AMOUNTS_CENTS: readonly number[] = [1000, 2000, 3000, 5000];

export interface DepositFormState {
  /** Parsed cents; undefined while the entry is empty or unreadable. */
  readonly amountCents: number | undefined;
  /** Shown under the entry; undefined while nothing is wrong (an empty entry is not an error). */
  readonly error: string | undefined;
  readonly canSubmit: boolean;
  /** What would remain to collect after this deposit (the current remaining while invalid). */
  readonly remainingAfterCents: number;
}

export function deriveDepositFormState(
  status: AppointmentStatus,
  position: AppointmentDepositPosition,
  amountText: string,
): DepositFormState {
  const trimmed = amountText.trim();
  const parsed = parseEuroInputToCents(amountText);
  const invalid = (error: string | undefined): DepositFormState => ({
    amountCents: parsed !== undefined && parsed > 0 ? parsed : undefined,
    error,
    canSubmit: false,
    remainingAfterCents: position.remainingCents,
  });

  if (trimmed.length === 0) return invalid(undefined);
  if (parsed === undefined) return invalid('Montant invalide');

  const refusal = validateAppointmentDepositAmount({
    status,
    expectedTotalCents: position.expectedTotalCents,
    activeDepositTotalCents: position.activeDepositTotalCents,
    amountCents: parsed,
  });
  switch (refusal) {
    case 'APPOINTMENT_NOT_OPEN':
      return invalid('Ce rendez-vous ne peut plus recevoir d’acompte.');
    case 'INVALID_AMOUNT':
      return invalid('Le montant doit être supérieur à 0 €.');
    case 'EXCEEDS_REMAINING':
      return invalid(`L’acompte ne peut pas dépasser le reste à encaisser (${formatEuroCents(position.remainingCents)}).`);
    default:
      return {
        amountCents: parsed,
        error: undefined,
        canSubmit: true,
        remainingAfterCents: position.remainingCents - parsed,
      };
  }
}

/** A quick amount is offered only when it fits in what is left to collect. */
export function isQuickDepositAmountAvailable(
  amountCents: number,
  position: AppointmentDepositPosition,
): boolean {
  return amountCents <= position.remainingCents;
}
