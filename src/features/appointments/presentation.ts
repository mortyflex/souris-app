// Souris — Appointment presentation helpers
//
// Framework-independent formatting shared by Appointment surfaces
// (Details, Client Profile history) and the Agenda week summary.
// Snapshot-based helpers never consult the current Service catalog.

import {
  getAppointmentEndAt,
  getOrderedItems,
  type Appointment,
} from '@/domain/appointments';

const statusLabels = {
  SCHEDULED: 'Planifié',
  CONFIRMED: 'Confirmé',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
  NO_SHOW: 'Absence',
} as const;

export function getAppointmentStatusLabel(status: Appointment['status']): string {
  return statusLabels[status];
}

/** Terminal historical outcomes remain visible in Client history. */
export function isTerminalAppointmentStatus(status: Appointment['status']): boolean {
  return status === 'CANCELLED' || status === 'NO_SHOW';
}

export function formatAppointmentTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export function formatAppointmentDate(date: Date): string {
  const value = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} h` : `${hours} h ${remaining} min`;
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    currency: 'EUR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value);
}

export function getAppointmentEnd(appointment: Appointment): Date {
  return getAppointmentEndAt(appointment);
}

/**
 * Concise service summary built exclusively from AppointmentItem snapshots.
 * Catalog changes never alter historical summaries.
 */
export function formatAppointmentServiceSummary(appointment: Appointment): string {
  const names = [
    ...new Set(
      getOrderedItems(appointment)
        .map((item) => item.serviceName.trim())
        .filter((name) => name.length > 0),
    ),
  ];

  if (names.length <= 2) {
    return names.join(' + ');
  }

  const remaining = names.length - 2;
  return `${names.slice(0, 2).join(' + ')} + ${remaining} autre${remaining > 1 ? 's' : ''}`;
}

/** Snapshot total of the appointment, without consulting the catalog. */
export function getAppointmentSnapshotTotal(appointment: Appointment): number {
  return getOrderedItems(appointment).reduce((total, item) => total + item.price, 0);
}
