// Souris — Appointment session reconciliation
//
// The application boundary where automatic previous-local-day
// finalization runs. Pure and idempotent: reconciling repeatedly never
// changes a second time, and unchanged collections return the SAME array
// reference so the session avoids unnecessary updates.

import { finalizePastBusinessDays } from '@/domain/appointments';

import type { AppointmentSessionEntry } from './types';

export function reconcileAppointmentEntriesForLocalDay(
  entries: readonly AppointmentSessionEntry[],
  now: Date,
): readonly AppointmentSessionEntry[] {
  const sourceAppointments = entries.map(({ appointment }) => appointment);
  const nextAppointments = finalizePastBusinessDays(sourceAppointments, now);

  if (nextAppointments === sourceAppointments) {
    return entries;
  }

  return entries.map((entry, index) => {
    const appointment = nextAppointments[index];
    if (!appointment || appointment === sourceAppointments[index]) {
      return entry;
    }
    return { appointment };
  });
}
