// Souris — Appointment day summary (pure)
//
// Source: docs/domain/APPOINTMENTS.md §25c
//
// What ONE local civil day of Appointments represents for the professional
// (« Résumé du jour »). Everything is derived on demand from the Appointment
// snapshots, the recorded checkouts and the linked Sales; nothing is stored.
//
//   counted Appointments     start on the day (DEVICE-LOCAL civil calendar) AND
//                            occupy the schedule — the Agenda's own rule
//                            (`doesAppointmentOccupySchedule`): CANCELLED and
//                            NO_SHOW bring nothing in and are left out
//   potentialRevenueCents    Σ expected totals (`getAppointmentExpectedTotal`:
//                            services net of the discount + linked Sales) —
//                            exactly what Details shows as « Total à encaisser »
//   collectedCents           Σ recorded checkouts of the counted Appointments
//                            (card + cash), whatever the day they were recorded
//   remainingToCollectCents  Σ expected totals of the counted Appointments
//                            WITHOUT a recorded checkout. A checkout settles its
//                            Appointment even when the amount received differs
//                            from the expected total (tip, adjustment)
//   totalDurationMinutes     Σ elapsed durations — booked time, processing
//                            included; overlapping Appointments both count
//   averageBasketCents       potentialRevenueCents / counted Appointments,
//                            rounded to the cent; 0 on an empty day
//
// Souris has no deposit: money is recorded at checkout only. `collectedCents`
// is therefore the checkouts, never an invented advance payment.
//
// This is NOT the Cash Register: the Caisse groups money by `paidAt` and also
// counts standalone Sales. The day summary follows the APPOINTMENTS of a day.
// Calendar Blocks are never an input.

import type { Sale } from '../sales/types';
import { getAppointmentExpectedTotal } from './expected-total';
import { doesAppointmentOccupySchedule } from './occupancy';
import { getPaymentTotalCents } from './payment';
import { getElapsedDurationMinutes } from './timeline';
import type { Appointment } from './types';

export interface AppointmentDaySummaryRow {
  readonly appointment: Appointment;
  readonly expectedTotalCents: number;
  /** A checkout is recorded for this Appointment. */
  readonly collected: boolean;
}

export interface AppointmentDaySummary {
  readonly appointmentCount: number;
  /** Chronological; ties keep a stable order by id. */
  readonly rows: readonly AppointmentDaySummaryRow[];
  readonly potentialRevenueCents: number;
  readonly collectedCents: number;
  readonly remainingToCollectCents: number;
  readonly totalDurationMinutes: number;
  readonly averageBasketCents: number;
}

export interface AppointmentDaySummarySources {
  readonly appointments: readonly Appointment[];
  readonly sales: readonly Sale[];
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getAppointmentDaySummary(
  sources: AppointmentDaySummarySources,
  day: Date,
): AppointmentDaySummary {
  const rows: AppointmentDaySummaryRow[] = sources.appointments
    .filter(
      (appointment) =>
        doesAppointmentOccupySchedule(appointment.status) &&
        isSameLocalDay(appointment.startAt, day),
    )
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id))
    .map((appointment) => ({
      appointment,
      expectedTotalCents: getAppointmentExpectedTotal(appointment, sources.sales).expectedTotalCents,
      collected: appointment.payment !== undefined,
    }));

  let potentialRevenueCents = 0;
  let collectedCents = 0;
  let remainingToCollectCents = 0;
  let totalDurationMinutes = 0;

  for (const { appointment, expectedTotalCents } of rows) {
    potentialRevenueCents += expectedTotalCents;
    totalDurationMinutes += getElapsedDurationMinutes(appointment);
    if (appointment.payment) {
      collectedCents += getPaymentTotalCents(appointment.payment);
    } else {
      remainingToCollectCents += expectedTotalCents;
    }
  }

  return {
    appointmentCount: rows.length,
    rows,
    potentialRevenueCents,
    collectedCents,
    remainingToCollectCents,
    totalDurationMinutes,
    averageBasketCents:
      rows.length === 0 ? 0 : Math.round(potentialRevenueCents / rows.length),
  };
}
