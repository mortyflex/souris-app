// BeautIzzy — « Ajouter un acompte reçu » draft rules (Appointment creation, pure)
//
// The optional deposit of the creation Résumé: money the professional has
// ALREADY received, recorded with the new Appointment in the same transaction
// (`addAppointment(entry, deposit)`). Nothing here charges, collects or
// invents anything; it only reads the draft entry against the SAME domain
// rule « Prendre un acompte » applies to an existing Appointment
// (`deriveDepositFormState` → `validateAppointmentDepositAmount`).
//
// The draft keeps the amount AS TYPED and is re-derived on every render, so a
// price or discount change on the Résumé re-validates it at once: a deposit
// that no longer fits shows its error and holds « Créer le rendez-vous »
// until it is corrected or removed. An amount is never clamped, never kept
// silently.
//
// The position of a new Appointment is simple — no linked Sale yet, no
// deposit yet — so its expected total is the services total net of the
// discount, and the remaining amount is that same total.
//
// No React, no persistence.

import {
  getDepositPositionFromTotals,
  isPreviousLocalDay,
  type AppointmentDepositPosition,
  type AppointmentServicesTotal,
  type AppointmentStatus,
  type PaymentMethod,
} from '@/domain/appointments';

import { deriveDepositFormState, type DepositFormState } from '../deposits/deposit-form';
import type { AppointmentCreationDeposit } from '../session/types';

/** The deposit the professional is entering on the Résumé. Absent = no deposit. */
export interface CreationDepositDraft {
  /** Created ONCE per draft deposit (reused by a retry, refused if saved twice). */
  readonly id: string;
  /** The amount as typed: `30`, `30,5`, `30.50`… parsed on every derivation. */
  readonly amountText: string;
  readonly paymentMethod: PaymentMethod;
}

export interface CreationDepositState {
  /** Expected total of the new Appointment, nothing paid ahead yet. */
  readonly position: AppointmentDepositPosition;
  /** The entry read by THE deposit form rule (empty entry: no error, nothing to save). */
  readonly form: DepositFormState;
  /** What `addAppointment` will record — defined only for a valid, non-empty entry. */
  readonly deposit: AppointmentCreationDeposit | undefined;
  /** A non-empty entry that cannot be saved: the Résumé may not create the Appointment. */
  readonly blocksCreation: boolean;
}

/** A new Appointment's position: the services total net of the discount, nothing paid ahead. */
export function getCreationDepositPosition(
  servicesTotal: AppointmentServicesTotal,
): AppointmentDepositPosition {
  return getDepositPositionFromTotals(servicesTotal.netCents, 0);
}

/**
 * The status the new Appointment will hold once saved: the session finalizes an
 * Appointment of a PREVIOUS local day as COMPLETED on insert, and a COMPLETED
 * Appointment receives no deposit (docs/domain/APPOINTMENTS.md §25d). A
 * same-day or future Appointment is SCHEDULED and financially open.
 */
export function getCreationDepositStatus(startAt: Date, now: Date): AppointmentStatus {
  return isPreviousLocalDay(startAt, now) ? 'COMPLETED' : 'SCHEDULED';
}

/** Whether the Résumé may offer a deposit at all for this start time. */
export function canOfferCreationDeposit(startAt: Date, now: Date): boolean {
  return getCreationDepositStatus(startAt, now) === 'SCHEDULED';
}

export function deriveCreationDepositState(
  draft: CreationDepositDraft | undefined,
  status: AppointmentStatus,
  servicesTotal: AppointmentServicesTotal,
): CreationDepositState {
  const position = getCreationDepositPosition(servicesTotal);
  const form = deriveDepositFormState(status, position, draft?.amountText ?? '');
  const deposit =
    draft !== undefined && form.canSubmit && form.amountCents !== undefined
      ? { id: draft.id, amountCents: form.amountCents, paymentMethod: draft.paymentMethod }
      : undefined;
  return {
    position,
    form,
    deposit,
    blocksCreation: form.error !== undefined,
  };
}
