// Souris — Immutable Appointment mutations
//
// Source: docs/domain/APPOINTMENTS.md §10 (reordering), §14 (phase duration editing)
//
// Each operation returns a new Appointment. The source Appointment, its items
// and their phases are never mutated, and catalog Services are never touched.

import type { Appointment } from "./types";
import { getOrderedItems } from "./timeline";

/**
 * Moves the item at logical position `fromIndex` to logical position `toIndex`
 * and normalizes the resulting `order` values to a contiguous 0-based sequence.
 *
 * Logical positions refer to the items sorted by their explicit `order`,
 * not to their physical position in the source array.
 *
 * The timeline is not stored on the Appointment; it is recalculated from the
 * reordered items by `calculateAppointmentTimeline`.
 */
export function reorderAppointmentItems(
  appointment: Appointment,
  fromIndex: number,
  toIndex: number,
): Appointment {
  const ordered = [...getOrderedItems(appointment)];

  if (
    fromIndex < 0 ||
    fromIndex >= ordered.length ||
    toIndex < 0 ||
    toIndex >= ordered.length
  ) {
    throw new RangeError(
      `reorderAppointmentItems: indices ${fromIndex} → ${toIndex} are out of range for ${ordered.length} items`,
    );
  }

  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);

  const items = ordered.map((item, index) => ({ ...item, order: index }));

  return { ...appointment, items };
}

/**
 * Updates the duration of one phase inside one AppointmentItem snapshot.
 *
 * Only the targeted phase is copied with a new duration; unrelated items and
 * phases are preserved by reference. The catalog Service the item originated
 * from is not involved and cannot be affected.
 *
 * Subsequent timeline calculations reflect the new duration because the
 * timeline is always derived from the current items.
 */
export function updateAppointmentPhaseDuration(
  appointment: Appointment,
  appointmentItemId: string,
  phaseId: string,
  durationMinutes: number,
): Appointment {
  const item = appointment.items.find((entry) => entry.id === appointmentItemId);
  if (item === undefined) {
    throw new Error(
      `updateAppointmentPhaseDuration: appointment item "${appointmentItemId}" not found`,
    );
  }
  if (!item.phases.some((phase) => phase.id === phaseId)) {
    throw new Error(
      `updateAppointmentPhaseDuration: phase "${phaseId}" not found in appointment item "${appointmentItemId}"`,
    );
  }

  const items = appointment.items.map((entry) => {
    if (entry.id !== appointmentItemId) {
      return entry;
    }
    const phases = entry.phases.map((phase) =>
      phase.id === phaseId ? { ...phase, durationMinutes } : phase,
    );
    return { ...entry, phases };
  });

  return { ...appointment, items };
}
