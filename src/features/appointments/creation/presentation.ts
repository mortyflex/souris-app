import {
  getAppointmentEndAt,
  getAppointmentServicesTotal,
  getElapsedDurationMinutes,
  getProcessingDurationMinutes,
  getStaffActiveDurationMinutes,
  type AppointmentDiscount,
  type AppointmentServicesTotal,
} from '@/domain/appointments';

import { buildAppointment, type BuildAppointmentItemInput } from './build-appointment';

export {
  formatCreationDuration,
  formatCreationPrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from '../editor/presentation';

export interface AppointmentCreationSummary {
  readonly endAt: Date;
  readonly elapsedMinutes: number;
  readonly activeMinutes: number;
  readonly processingMinutes: number;
  /** Gross services total in euros: the draft prices, before any discount. */
  readonly totalPrice: number;
  /** Gross → discount → net in cents, from the ONE domain derivation. */
  readonly servicesTotal: AppointmentServicesTotal;
}

/**
 * Derives the creation summary from the same Appointment domain timeline.
 * Overrides applied to the draft items (price, processing durations) are
 * included, so the summary always reflects the appointment being created.
 */
export function getAppointmentCreationSummary(
  startAt: Date,
  items: readonly BuildAppointmentItemInput[],
  discount?: AppointmentDiscount,
): AppointmentCreationSummary {
  const preview = buildAppointment({
    appointmentId: 'preview-appointment',
    businessId: 'preview-business',
    clientId: 'preview-client',
    discount,
    itemIds: items.map((_, index) => `preview-item-${index}`),
    items,
    staffMemberId: 'preview-staff',
    startAt,
  });
  const servicesTotal = getAppointmentServicesTotal(preview);

  return {
    activeMinutes: getStaffActiveDurationMinutes(preview),
    elapsedMinutes: getElapsedDurationMinutes(preview),
    endAt: getAppointmentEndAt(preview),
    processingMinutes: getProcessingDurationMinutes(preview),
    servicesTotal,
    totalPrice: servicesTotal.grossCents / 100,
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
