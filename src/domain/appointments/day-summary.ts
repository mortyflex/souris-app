// BeautIzzy — Appointment day / period summary (pure)
//
// Source: docs/domain/APPOINTMENTS.md §25c
//
// What a range of local civil days of Appointments represents for the
// professional: ONE day (« Résumé du jour ») or the seven days of the Agenda
// week (« Résumé de la semaine »). The SAME rules for both — a day is simply
// the period whose first and last day coincide. Everything is derived on
// demand from the Appointment snapshots, the recorded checkouts, the deposits
// and the linked Sales; nothing is stored.
//
//   counted Appointments     start within the period — first and last day
//                            included (DEVICE-LOCAL civil calendar) — AND
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
//                            rounded to the cent; 0 on an empty period
//
// The period activity (`getAppointmentPeriodActivity`) counts outcomes by
// stored status over the same days: the counted Appointments split into
// COMPLETED and the others, plus the CANCELLED and NO_SHOW records the
// figures leave out.
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

/** A range of local civil days, both included. Only the civil date of each bound matters. */
export interface AppointmentSummaryPeriod {
  readonly firstDay: Date;
  readonly lastDay: Date;
}

export interface AppointmentPeriodActivity {
  /** Counted Appointments (they occupy the schedule) that are `COMPLETED`. */
  readonly completedCount: number;
  /** Counted Appointments not `COMPLETED` yet: `SCHEDULED`, `CONFIRMED`, `IN_PROGRESS`. */
  readonly plannedCount: number;
  /** `CANCELLED`, whoever cancelled. Not counted in the summary figures. */
  readonly cancelledCount: number;
  /** `NO_SHOW`. Not counted in the summary figures. */
  readonly noShowCount: number;
}

/** `yyyymmdd` of the device-local civil date: comparable, never a timestamp. */
function getLocalDayNumber(date: Date): number {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function isWithinPeriod(date: Date, period: AppointmentSummaryPeriod): boolean {
  const day = getLocalDayNumber(date);
  return day >= getLocalDayNumber(period.firstDay) && day <= getLocalDayNumber(period.lastDay);
}

export function getAppointmentDaySummary(
  sources: AppointmentDaySummarySources,
  day: Date,
): AppointmentDaySummary {
  return getAppointmentPeriodSummary(sources, { firstDay: day, lastDay: day });
}

export function getAppointmentPeriodSummary(
  sources: AppointmentDaySummarySources,
  period: AppointmentSummaryPeriod,
): AppointmentDaySummary {
  const deposits = sources.deposits ?? [];
  const rows: AppointmentDaySummaryRow[] = sources.appointments
    .filter(
      (appointment) =>
        doesAppointmentOccupySchedule(appointment.status) &&
        isWithinPeriod(appointment.startAt, period),
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

export function getAppointmentPeriodActivity(
  appointments: readonly Appointment[],
  period: AppointmentSummaryPeriod,
): AppointmentPeriodActivity {
  let completedCount = 0;
  let plannedCount = 0;
  let cancelledCount = 0;
  let noShowCount = 0;

  for (const appointment of appointments) {
    if (!isWithinPeriod(appointment.startAt, period)) continue;
    switch (appointment.status) {
      case 'COMPLETED':
        completedCount += 1;
        break;
      case 'CANCELLED':
        cancelledCount += 1;
        break;
      case 'NO_SHOW':
        noShowCount += 1;
        break;
      case 'SCHEDULED':
      case 'CONFIRMED':
      case 'IN_PROGRESS':
        plannedCount += 1;
        break;
    }
  }

  return { completedCount, plannedCount, cancelledCount, noShowCount };
}
