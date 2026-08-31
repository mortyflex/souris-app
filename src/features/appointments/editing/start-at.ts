// Souris — Appointment Editing startAt draft helpers
//
// Pure local-date/time arithmetic for the Appointment Editing draft. Local
// civil calendar semantics are preserved: dates are rebuilt with the local
// Date constructor, never serialized through UTC strings.

const MINUTE_MS = 60_000;

/** Keeps the time of day while moving to another local calendar date. */
export function changeAppointmentLocalDate(startAt: Date, newDate: Date): Date {
  return new Date(
    newDate.getFullYear(),
    newDate.getMonth(),
    newDate.getDate(),
    startAt.getHours(),
    startAt.getMinutes(),
  );
}

/** Steps the start time by a ± minutes delta on the same local date. */
export function stepAppointmentStartAt(startAt: Date, deltaMinutes: number): Date {
  return new Date(startAt.getTime() + deltaMinutes * MINUTE_MS);
}

/** True when two starts differ at minute precision. */
export function isSameStartAt(left: Date, right: Date): boolean {
  return left.getTime() === right.getTime();
}
