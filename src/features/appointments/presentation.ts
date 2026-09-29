// Souris — Appointment presentation helpers
//
// Framework-independent formatting shared by Appointment surfaces
// (Details, Client Profile history) and the Agenda week summary.
// Snapshot-based helpers never consult the current Service catalog.

import {
  getAppointmentEndAt,
  getAppointmentServicesTotal,
  getOrderedItems,
  type Appointment,
  type AppointmentCancellationActor,
  type AppointmentDiscount,
} from '@/domain/appointments';
import { formatEuroCents, formatEuros } from '@/shared/lib/money';

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

/** Final historical outcomes remain visible in Appointment history. */
export function isTerminalAppointmentStatus(status: Appointment['status']): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED' || status === 'NO_SHOW';
}

export function formatCancellationActorLabel(actor: AppointmentCancellationActor): string {
  return actor === 'CLIENT' ? 'Annulé par le client' : 'Annulé par vous';
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
  return formatEuros(value);
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

/**
 * Snapshot total of the appointment's services in euros, NET of its discount,
 * without consulting the catalog. Without a discount this is exactly the sum
 * of the item snapshot prices. Derived by the ONE domain helper.
 */
export function getAppointmentSnapshotTotal(appointment: Appointment): number {
  return getAppointmentServicesTotal(appointment).netCents / 100;
}

/** `Réduction -20 %` for a percentage, plain `Réduction` for a fixed amount. */
export function formatDiscountLabel(discount: AppointmentDiscount): string {
  return discount.type === 'PERCENT' ? `Réduction -${discount.percent} %` : 'Réduction';
}

/** The applied discount as a negative amount: `-20,00 €`. */
export function formatDiscountAmount(discountCents: number): string {
  return `-${formatEuroCents(discountCents)}`;
}

/** Spoken form of a discount: `20 pour cent`, `15 euros`, `12,50 euros`. */
export function formatDiscountSpokenValue(discount: AppointmentDiscount): string {
  if (discount.type === 'PERCENT') return `${discount.percent} pour cent`;
  const euros = discount.amountCents / 100;
  const value = Number.isInteger(euros) ? `${euros}` : euros.toFixed(2).replace('.', ',');
  return `${value} euro${euros >= 2 ? 's' : ''}`;
}
