// Souris — Appointment Editing startAt draft helpers
//
// Pure local-date/time arithmetic for the Appointment Editing draft. Local
// civil calendar semantics are preserved: dates are rebuilt with the local
// Date constructor, never serialized through UTC strings.

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

/**
 * Sets the time of day chosen on the start-time wheels, on the same local
 * calendar date. Any hour is allowed (00:xx → 23:xx): an existing Appointment
 * may sit anywhere in its day, and the date only changes through the date
 * picker. An Appointment that then ends after midnight simply runs into the
 * next day, as before. Seconds are dropped.
 */
export function setAppointmentLocalTime(startAt: Date, hour: number, minute: number): Date {
  return new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate(), hour, minute);
}

/** True when two starts differ at minute precision. */
export function isSameStartAt(left: Date, right: Date): boolean {
  return left.getTime() === right.getTime();
}
