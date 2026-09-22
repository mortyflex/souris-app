// Souris — Appointment day summary (pure)
//
// Source: docs/domain/APPOINTMENTS.md §25c
//
// What ONE local civil day of Appointments represents for the professional
// (« Résumé du jour »). Everything is derived on demand from the Appointment
// snapshots, the recorded checkouts, the deposits and the linked Sales;
// nothing is stored.
//
//   counted Appointments     start on the day (DEVICE-LOCAL civil calendar) AND
//                            occupy the schedule — the Agenda's own rule
//                            (`doesAppointmentOccupySchedule`): CANCELLED and
//                            NO_SHOW bring nothing in and are left out
//   potentialRevenueCents    Σ expected totals (`getAppointmentExpectedTotal`:
//                            services net of the discount + linked Sales) —
//                            exactly what Details shows as the expected total
//   collectedCents           Σ, for the counted Appointments, their ACTIVE
//                            deposits + their recorded final checkout (card +
//                            cash) — WHATEVER the day the money was received:
//                            a deposit paid two weeks earlier counts here
//   remainingToCollectCents  Σ, for the counted Appointments NOT settled,
//                            max(expected − ACTIVE deposits, 0). A settled
//                            Appointment (a final checkout recorded, or a fully
//                            prepaid one completed — `isAppointmentSettled`)
//                            owes nothing, even when the amount received
//                            differs from the expected total (tip, adjustment)
//   totalDurationMinutes     Σ elapsed durations — booked time, processing
//                            included; overlapping Appointments both count
//   averageBasketCents       potentialRevenueCents / counted Appointments,
//                            rounded to the cent; 0 on an empty day
//
// This is NOT the Cash Register: the Caisse groups money by the day it was
// RECEIVED (`paidAt`) and also counts standalone Sales. The day summary
// follows the APPOINTMENTS of a day, whenever their money came in.
// Calendar Blocks are never an input.

import type { Sale } from '../sales/types';
import {
  getAppointmentActiveDepositTotal,
  getDepositPositionFromTotals,
  isAppointmentSettled,
} from './deposit';
import { getAppointmentExpectedTotal } from './expected-total';
import { doesAppointmentOccupySchedule } from './occupancy';
import { getPaymentTotalCents } from './payment';
import { getElapsedDurationMinutes } from './timeline';
import type { Appointment, AppointmentDeposit } from './types';

export interface AppointmentDaySummaryRow {
  readonly appointment: Appointment;
  readonly expectedTotalCents: number;
  /** Σ ACTIVE deposits of this Appointment, whatever the day they were paid. */
  readonly depositCents: number;
  /** ACTIVE deposits + the recorded final checkout. */
  readonly collectedCents: number;
  /** Still to be collected: 0 once settled, otherwise max(expected − deposits, 0). */
  readonly remainingCents: number;
  /** The Appointment is settled (`isAppointmentSettled`): nothing is owed any more. */
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
  /** Every deposit; VOIDED ones count for nothing. Absent = no deposit. */
  readonly deposits?: readonly AppointmentDeposit[];
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
  const deposits = sources.deposits ?? [];
  const rows: AppointmentDaySummaryRow[] = sources.appointments
    .filter(
      (appointment) =>
        doesAppointmentOccupySchedule(appointment.status) &&
        isSameLocalDay(appointment.startAt, day),
    )
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id))
    .map((appointment) => {
      const expectedTotalCents = getAppointmentExpectedTotal(appointment, sources.sales).expectedTotalCents;
      const depositCents = getAppointmentActiveDepositTotal(deposits, appointment.id);
      const position = getDepositPositionFromTotals(expectedTotalCents, depositCents);
      const settled = isAppointmentSettled(appointment, position);
      const paymentCents = appointment.payment ? getPaymentTotalCents(appointment.payment) : 0;
      return {
        appointment,
        expectedTotalCents,
        depositCents,
        collectedCents: depositCents + paymentCents,
        remainingCents: settled ? 0 : position.remainingCents,
        collected: settled,
      };
    });

  let potentialRevenueCents = 0;
  let collectedCents = 0;
  let remainingToCollectCents = 0;
  let totalDurationMinutes = 0;

  for (const row of rows) {
    potentialRevenueCents += row.expectedTotalCents;
    collectedCents += row.collectedCents;
    remainingToCollectCents += row.remainingCents;
    totalDurationMinutes += getElapsedDurationMinutes(row.appointment);
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
