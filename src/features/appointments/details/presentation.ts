import {
  calculateAppointmentTimeline,
  getAppointmentEndAt,
  getElapsedDurationMinutes,
  type Appointment,
  type AppointmentItem,
  type TimelineItem,
} from '@/domain/appointments';

import { getAppointmentStatusLabel } from '@/features/appointments/presentation';

export {
  formatAppointmentDate,
  formatAppointmentTime,
  formatCancellationActorLabel,
  formatDurationMinutes,
  formatPrice,
  getAppointmentEnd,
  getAppointmentStatusLabel,
  isTerminalAppointmentStatus,
} from '@/features/appointments/presentation';

export interface AppointmentDetailService {
  readonly item: AppointmentItem;
  readonly timelineItem: TimelineItem;
}

/**
 * The read-first summary of Appointment Details: total duration and the
 * number of Prestations. No amount: the ONE amount to charge lives in the
 * checkout footer (« Total à encaisser »), never twice on the sheet.
 */
export interface AppointmentDetailSummary {
  readonly elapsedMinutes: number;
  readonly serviceCount: number;
}

/**
 * Visual family of the status pill. `current` is a live Appointment whose
 * time range contains now; `scheduled` a live one before or after it.
 */
export type AppointmentStatusTone = 'scheduled' | 'current' | 'completed' | 'exception';

export interface AppointmentDisplayStatus {
  readonly label: string;
  readonly tone: AppointmentStatusTone;
}

export function getAppointmentDetailServices(
  appointment: Appointment,
): readonly AppointmentDetailService[] {
  const itemsById = new Map(appointment.items.map((item) => [item.id, item]));
  const timeline = calculateAppointmentTimeline(appointment);

  return timeline.items.flatMap((timelineItem) => {
    const item = itemsById.get(timelineItem.appointmentItemId);
    return item ? [{ item, timelineItem }] : [];
  });
}

export function isServicePhaseRedundant(service: AppointmentDetailService): boolean {
  if (service.item.serviceType !== 'SERVICE') return false;
  if (service.item.phases.length !== 1) return false;
  const onlyPhase = service.timelineItem.phases[0];
  return onlyPhase !== undefined && onlyPhase.phaseName === service.item.serviceName;
}

export function getAppointmentDetailSummary(
  appointment: Appointment,
): AppointmentDetailSummary {
  return {
    elapsedMinutes: getElapsedDurationMinutes(appointment),
    serviceCount: appointment.items.length,
  };
}

/**
 * What the status pill of Details reads. Presentation only: the stored
 * status is never changed. A live Appointment (SCHEDULED / CONFIRMED /
 * IN_PROGRESS) whose calculated time range contains `now` reads « En cours »;
 * the historical outcomes keep their own label.
 */
export function getAppointmentDisplayStatus(
  appointment: Appointment,
  now: Date,
): AppointmentDisplayStatus {
  switch (appointment.status) {
    case 'COMPLETED':
      return { label: getAppointmentStatusLabel('COMPLETED'), tone: 'completed' };
    case 'CANCELLED':
    case 'NO_SHOW':
      return { label: getAppointmentStatusLabel(appointment.status), tone: 'exception' };
    default: {
      const nowMs = now.getTime();
      const isRunning =
        appointment.startAt.getTime() <= nowMs && nowMs < getAppointmentEndAt(appointment).getTime();
      return isRunning || appointment.status === 'IN_PROGRESS'
        ? { label: getAppointmentStatusLabel('IN_PROGRESS'), tone: 'current' }
        : { label: getAppointmentStatusLabel(appointment.status), tone: 'scheduled' };
    }
  }
}
