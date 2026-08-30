// Pure lifecycle rules. `now` is injected and IN_PROGRESS remains a
// compatibility state; V1 exposes no transition into it.

import type {
  Appointment,
  AppointmentCancellationActor,
} from './types';

const COMPLETABLE_STATUSES: ReadonlySet<Appointment['status']> = new Set([
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
]);

const CANCELLABLE_STATUSES: ReadonlySet<Appointment['status']> = new Set([
  'SCHEDULED',
  'CONFIRMED',
]);

const NO_SHOWABLE_STATUSES: ReadonlySet<Appointment['status']> = new Set([
  'SCHEDULED',
  'CONFIRMED',
]);

/** Local civil day ordinal — safe across month/year rollover and DST. */
function localDayOrdinal(date: Date): number {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function isPreviousLocalDay(candidate: Date, reference: Date): boolean {
  return localDayOrdinal(candidate) < localDayOrdinal(reference);
}

export function canCompleteAppointment(appointment: Appointment, now: Date): boolean {
  return (
    COMPLETABLE_STATUSES.has(appointment.status) &&
    appointment.startAt.getTime() <= now.getTime()
  );
}

export function canCancelAppointment(appointment: Appointment): boolean {
  return CANCELLABLE_STATUSES.has(appointment.status);
}

export function canMarkAppointmentNoShow(appointment: Appointment, now: Date): boolean {
  return (
    NO_SHOWABLE_STATUSES.has(appointment.status) &&
    appointment.startAt.getTime() <= now.getTime()
  );
}

/**
 * Automatic normal-case completion for an eligible appointment whose local
 * calendar day is strictly before the current local day. A same-day
 * appointment stays untouched for the entire day, even after its start time.
 */
export function shouldAutoCompleteAppointment(appointment: Appointment, now: Date): boolean {
  return (
    COMPLETABLE_STATUSES.has(appointment.status) &&
    isPreviousLocalDay(appointment.startAt, now)
  );
}

export function completeAppointment(appointment: Appointment, now: Date): Appointment {
  if (!canCompleteAppointment(appointment, now)) return appointment;
  return { ...appointment, status: 'COMPLETED' };
}

export function cancelAppointment(
  appointment: Appointment,
  cancelledBy: AppointmentCancellationActor,
  now: Date,
  reason?: string,
): Appointment {
  if (!canCancelAppointment(appointment)) return appointment;

  const trimmedReason = reason?.trim();
  return {
    ...appointment,
    status: 'CANCELLED',
    cancellation: {
      cancelledAt: new Date(now.getTime()),
      cancelledBy,
      ...(trimmedReason ? { reason: trimmedReason } : {}),
    },
  };
}

export function markAppointmentNoShow(appointment: Appointment, now: Date): Appointment {
  if (!canMarkAppointmentNoShow(appointment, now)) return appointment;
  return {
    ...appointment,
    status: 'NO_SHOW',
    noShow: { recordedAt: new Date(now.getTime()) },
  };
}

/**
 * Automatic past-local-day finalization over a whole collection.
 * Returns the SAME array reference when nothing changes (idempotent,
 * repeat-safe, no unnecessary state updates).
 */
export function finalizePastBusinessDays(
  appointments: readonly Appointment[],
  now: Date,
): readonly Appointment[] {
  let changed = false;
  const next = appointments.map((appointment) => {
    if (!shouldAutoCompleteAppointment(appointment, now)) return appointment;
    changed = true;
    return { ...appointment, status: 'COMPLETED' as const };
  });
  return changed ? next : appointments;
}
