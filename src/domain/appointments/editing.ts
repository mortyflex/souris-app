// Souris - Appointment service editing operations
//
// These operations rebuild AppointmentItems from editable snapshots without
// changing appointment metadata or mutating the source Appointment.

import { getOrderedItems } from './timeline';
import type { Appointment, AppointmentPhase, ServiceType } from './types';

export interface AppointmentItemEditDraft {
  readonly id: string;
  readonly serviceId: string;
  readonly serviceOptionId?: string;
  readonly order: number;
  readonly serviceName: string;
  readonly serviceType: ServiceType;
  readonly price: number;
  readonly phases: readonly AppointmentPhase[];
}

function copyPhases(phases: readonly AppointmentPhase[]): readonly AppointmentPhase[] {
  return phases.map((phase) => ({ ...phase }));
}

/**
 * Converts an Appointment snapshot into independent edit drafts in logical
 * service order. Catalog data is deliberately not involved.
 */
export function hydrateAppointmentDrafts(
  appointment: Appointment,
): readonly AppointmentItemEditDraft[] {
  return getOrderedItems(appointment).map((item) => ({
    id: item.id,
    serviceId: item.serviceId,
    serviceOptionId: item.serviceOptionId,
    order: item.order,
    serviceName: item.serviceName,
    serviceType: item.serviceType,
    price: item.price,
    phases: copyPhases(item.phases),
  }));
}

/** Existing appointments always retain at least one service item. */
export function canRemoveAppointmentItem(itemCount: number): boolean {
  return itemCount > 1;
}

/**
 * Rebuilds only the service composition of an Appointment.
 *
 * Draft position is the authoritative new order. The source appointment and
 * every nested phase remain untouched, while all non-editable metadata is
 * preserved by the returned object.
 */
export function updateAppointmentFromDrafts(
  appointment: Appointment,
  drafts: readonly AppointmentItemEditDraft[],
): Appointment {
  if (drafts.length === 0) {
    throw new Error('An appointment requires at least one service');
  }

  return {
    ...appointment,
    startAt: new Date(appointment.startAt),
    items: drafts.map((draft, index) => ({
      id: draft.id,
      serviceId: draft.serviceId,
      order: index,
      serviceName: draft.serviceName,
      serviceType: draft.serviceType,
      price: draft.price,
      phases: copyPhases(draft.phases),
      ...(draft.serviceOptionId !== undefined
        ? { serviceOptionId: draft.serviceOptionId }
        : {}),
    })),
    ...(appointment.cancellation
      ? {
          cancellation: {
            ...appointment.cancellation,
            cancelledAt: new Date(appointment.cancellation.cancelledAt),
          },
        }
      : {}),
    ...(appointment.noShow
      ? {
          noShow: { ...appointment.noShow, recordedAt: new Date(appointment.noShow.recordedAt) },
        }
      : {}),
  };
}
