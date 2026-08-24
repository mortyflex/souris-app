import {
  calculateAppointmentTimeline,
  getAppointmentEndAt,
  getElapsedDurationMinutes,
  getOrderedItems,
  getProcessingDurationMinutes,
  getStaffActiveDurationMinutes,
  type Appointment,
  type AppointmentItem,
  type TimelineItem,
} from '@/domain/appointments';

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
