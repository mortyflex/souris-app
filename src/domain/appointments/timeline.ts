// Souris — Appointment timeline calculation
//
// Source: docs/domain/APPOINTMENTS.md §8–§11
//
// The timeline is derived from:
//   appointment.startAt
//   → items in explicit `order`
//   → phases in array order
//
// All functions are pure: the source Appointment is never mutated,
// and Date values are created from timestamps rather than mutated.

import type { Appointment, ServiceType } from "./types";

const MINUTE_MS = 60_000;

/**
 * One phase placed on the timeline.
 * Contains no visual properties — layout belongs to the Agenda presentation layer.
 */
export interface TimelinePhase {
  readonly appointmentItemId: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly serviceType: ServiceType;
  readonly phaseId: string;
  readonly phaseName: string;
  readonly requiresStaff: boolean;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly durationMinutes: number;
}

/**
 * One appointment item placed on the timeline, with its ordered phases.
 */
export interface TimelineItem {
  readonly appointmentItemId: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly serviceType: ServiceType;
  readonly order: number;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly durationMinutes: number;
  readonly phases: readonly TimelinePhase[];
}

export interface AppointmentTimeline {
  readonly appointmentId: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly items: readonly TimelineItem[];
}

/**
 * Returns the appointment items sorted by their explicit `order`.
 *
 * Items are copied into a new array before sorting; the source array is
 * never mutated. Sorting is stable: items sharing the same `order` keep
 * their relative source order. Duplicate order values are not treated as
 * a separate validation concern in this phase.
 */
export function getOrderedItems(
  appointment: Appointment,
): readonly Appointment["items"][number][] {
  return [...appointment.items].sort((a, b) => a.order - b.order);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

/**
 * Calculates the complete appointment timeline from appointment.startAt,
 * following explicit item order and phase array order.
 *
 * Zero-duration phases are preserved: they occupy a point in time
 * (startAt === endAt) and remain visible to consumers.
 */
export function calculateAppointmentTimeline(
  appointment: Appointment,
): AppointmentTimeline {
  let cursor = appointment.startAt;
  const items: TimelineItem[] = [];

  for (const item of getOrderedItems(appointment)) {
    const itemStart = cursor;
    const phases: TimelinePhase[] = [];

    for (const phase of item.phases) {
      const phaseStart = cursor;
      const phaseEnd = addMinutes(phaseStart, phase.durationMinutes);

      phases.push({
        appointmentItemId: item.id,
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        serviceType: item.serviceType,
        phaseId: phase.id,
        phaseName: phase.name,
        requiresStaff: phase.requiresStaff,
        startAt: phaseStart,
        endAt: phaseEnd,
        durationMinutes: phase.durationMinutes,
      });

      cursor = phaseEnd;
    }

    items.push({
      appointmentItemId: item.id,
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      serviceType: item.serviceType,
      order: item.order,
      startAt: itemStart,
      endAt: cursor,
      durationMinutes: item.phases.reduce(
        (total, phase) => total + phase.durationMinutes,
        0,
      ),
      phases,
    });
  }

  return {
    appointmentId: appointment.id,
    startAt: appointment.startAt,
    endAt: cursor,
    items,
  };
}

/**
 * Total appointment duration in minutes: the sum of every phase of every item.
 * Processing time is included — the appointment continues during it.
 */
export function getElapsedDurationMinutes(appointment: Appointment): number {
  return appointment.items.reduce(
    (total, item) =>
      total + item.phases.reduce((sum, phase) => sum + phase.durationMinutes, 0),
    0,
  );
}

/**
 * Minutes during which the professional is actively required
 * (phases with requiresStaff === true).
 */
export function getStaffActiveDurationMinutes(appointment: Appointment): number {
  return appointment.items.reduce(
    (total, item) =>
      total +
      item.phases.reduce(
        (sum, phase) => sum + (phase.requiresStaff ? phase.durationMinutes : 0),
        0,
      ),
    0,
  );
}

/**
 * Minutes during which the client remains in the appointment but the
 * professional is free (phases with requiresStaff === false).
 *
 * `requiresStaff` is authoritative. Processing time is never inferred from
 * service names, service types, or phase names.
 */
export function getProcessingDurationMinutes(appointment: Appointment): number {
  return appointment.items.reduce(
    (total, item) =>
      total +
      item.phases.reduce(
        (sum, phase) => sum + (phase.requiresStaff ? 0 : phase.durationMinutes),
        0,
      ),
    0,
  );
}

/**
 * The calculated appointment end: startAt + elapsed duration.
 */
export function getAppointmentEndAt(appointment: Appointment): Date {
  return addMinutes(appointment.startAt, getElapsedDurationMinutes(appointment));
}
