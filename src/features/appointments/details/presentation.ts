import {
  calculateAppointmentTimeline,
  getElapsedDurationMinutes,
  getOrderedItems,
  getProcessingDurationMinutes,
  getStaffActiveDurationMinutes,
  type Appointment,
  type AppointmentItem,
  type TimelineItem,
} from '@/domain/appointments';

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

export interface AppointmentDetailSummary {
  readonly elapsedMinutes: number;
  readonly activeMinutes: number;
  readonly processingMinutes: number;
  readonly totalPrice: number;
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
    activeMinutes: getStaffActiveDurationMinutes(appointment),
    processingMinutes: getProcessingDurationMinutes(appointment),
    totalPrice: getOrderedItems(appointment).reduce((total, item) => total + item.price, 0),
  };
}
