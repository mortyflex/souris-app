import {
  getAppointmentEndAt,
  getElapsedDurationMinutes,
  getProcessingDurationMinutes,
  getStaffActiveDurationMinutes,
  type Service,
} from '@/domain/appointments';

import { buildAppointment, type BuildAppointmentItemInput } from './build-appointment';

export interface AppointmentCreationSummary {
  readonly endAt: Date;
  readonly elapsedMinutes: number;
  readonly activeMinutes: number;
  readonly processingMinutes: number;
  readonly totalPrice: number;
}

/**
 * Derives the creation summary from the same Appointment domain timeline.
 * Overrides applied to the draft items (price, processing durations) are
 * included, so the summary always reflects the appointment being created.
 */
export function getAppointmentCreationSummary(
  startAt: Date,
  items: readonly BuildAppointmentItemInput[],
): AppointmentCreationSummary {
  const preview = buildAppointment({
    appointmentId: 'preview-appointment',
    businessId: 'preview-business',
    clientId: 'preview-client',
    itemIds: items.map((_, index) => `preview-item-${index}`),
    items,
    staffMemberId: 'preview-staff',
    startAt,
  });

  return {
    activeMinutes: getStaffActiveDurationMinutes(preview),
    elapsedMinutes: getElapsedDurationMinutes(preview),
    endAt: getAppointmentEndAt(preview),
    processingMinutes: getProcessingDurationMinutes(preview),
    totalPrice: preview.items.reduce((total, item) => total + item.price, 0),
  };
}

export function formatCreationTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export function formatCreationDate(date: Date): string {
  const value = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Compact appointment context: "Mar. 25 août". */
export function formatCreationDateShort(date: Date): string {
  const value = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatCreationDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} h` : `${hours} h ${remaining} min`;
}

export function formatCreationPrice(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    currency: 'EUR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value);
}

export function getServiceDurationMinutes(service: Service): number {
  return service.phases.reduce((total, phase) => total + phase.durationMinutes, 0);
}

/** Processing (unattended) duration from catalog phases; 0 for SERVICE. */
export function getServiceProcessingMinutes(service: Service): number {
  return service.phases.reduce(
    (total, phase) => total + (phase.requiresStaff ? 0 : phase.durationMinutes),
    0,
  );
}
