import type { Appointment, AppointmentItem } from '@/domain/appointments';

import {
  formatCancellationActorLabel,
  formatDurationMinutes,
  getAppointmentDetailServices,
  getAppointmentDetailSummary,
  getAppointmentDisplayStatus,
  getAppointmentStatusLabel,
  isServicePhaseRedundant,
} from '../presentation';

function appointment(): Appointment {
  const items: AppointmentItem[] = [
    {
      id: 'color',
      serviceId: 'service-color',
      order: 0,
      serviceName: 'Coloration',
      serviceType: 'TECHNIQUE',
      price: 95,
      phases: [
        { id: 'application', name: 'Application', durationMinutes: 15, requiresStaff: true },
        { id: 'processing', name: 'Temps de pose', durationMinutes: 35, requiresStaff: false },
      ],
    },
    {
      id: 'cut',
      serviceId: 'service-cut',
      order: 1,
      serviceName: 'Coupe',
      serviceType: 'SERVICE',
      price: 42,
      phases: [{ id: 'cut-phase', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
    },
  ];
  return {
    id: 'appointment-a',
    businessId: 'business-a',
    clientId: 'client-a',
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 7, 24, 9, 0),
    status: 'SCHEDULED',
    items,
  };
}

describe('Appointment details presentation', () => {
  it('translates Appointment statuses outside the domain', () => {
    expect(getAppointmentStatusLabel('SCHEDULED')).toBe('Planifié');
    expect(getAppointmentStatusLabel('IN_PROGRESS')).toBe('En cours');
    expect(getAppointmentStatusLabel('NO_SHOW')).toBe('Absence');
  });

  it('formats the recorded cancellation actor for history', () => {
    expect(formatCancellationActorLabel('CLIENT')).toBe('Annulé par la cliente');
    expect(formatCancellationActorLabel('BUSINESS')).toBe('Annulé par le salon');
  });

  it('derives ordered service starts from the calculated timeline', () => {
    const services = getAppointmentDetailServices(appointment());

    expect(services.map(({ item, timelineItem }) => [item.serviceName, timelineItem.startAt.getHours(), timelineItem.startAt.getMinutes()])).toEqual([
      ['Coloration', 9, 0],
      ['Coupe', 9, 50],
    ]);
  });

  it('keeps processing distinguishable per phase and summarizes only total duration and the service count', () => {
    const services = getAppointmentDetailServices(appointment());
    const summary = getAppointmentDetailSummary(appointment());

    expect(services[0].timelineItem.phases[1].requiresStaff).toBe(false);
    // No amount: the amount to charge belongs to the checkout footer only.
    expect(summary).toEqual({ elapsedMinutes: 80, serviceCount: 2 });
    expect('activeMinutes' in summary).toBe(false);
    expect('processingMinutes' in summary).toBe(false);
  });

  it('formats durations without inventing fractional values', () => {
    expect(formatDurationMinutes(45)).toBe('45 min');
    expect(formatDurationMinutes(90)).toBe('1 h 30 min');
  });

  describe('single-phase SERVICE deduplication', () => {
    it('flags a SERVICE whose only phase repeats the service name', () => {
      const services = getAppointmentDetailServices(appointment());

      expect(isServicePhaseRedundant(services[1])).toBe(true);
    });

    it('never flags TECHNIQUE phases', () => {
      const services = getAppointmentDetailServices(appointment());

      expect(isServicePhaseRedundant(services[0])).toBe(false);
    });

    it('keeps a SERVICE phase visible when the phase name differs', () => {
      const value = appointment();
      const services = getAppointmentDetailServices({
        ...value,
        items: value.items.map((item) =>
          item.id === 'cut'
            ? {
                ...item,
                phases: [
                  { id: 'wash', name: 'Shampooing', durationMinutes: 15, requiresStaff: true },
                ],
              }
            : item,
        ),
      });

      expect(isServicePhaseRedundant(services[1])).toBe(false);
    });
  });

  describe('status pill', () => {
    // appointment(): 09:00 → 10:20 on its day.
    const at = (hours: number, minutes: number) => {
      const date = new Date(appointment().startAt);
      date.setHours(hours, minutes, 0, 0);
      return date;
    };

    it('reads « En cours » for a live Appointment while its time range contains now, without changing its status', () => {
      const scheduled = appointment();

      expect(getAppointmentDisplayStatus(scheduled, at(8, 59))).toEqual({ label: 'Planifié', tone: 'scheduled' });
      expect(getAppointmentDisplayStatus(scheduled, at(9, 0))).toEqual({ label: 'En cours', tone: 'current' });
      expect(getAppointmentDisplayStatus(scheduled, at(10, 19))).toEqual({ label: 'En cours', tone: 'current' });
      // The end is exclusive.
      expect(getAppointmentDisplayStatus(scheduled, at(10, 20))).toEqual({ label: 'Planifié', tone: 'scheduled' });
      expect(scheduled.status).toBe('SCHEDULED');
      expect(getAppointmentDisplayStatus({ ...scheduled, status: 'CONFIRMED' }, at(8, 0))).toEqual({
        label: 'Confirmé',
        tone: 'scheduled',
      });
    });

    it('keeps the historical outcomes, even inside the time range', () => {
      const during = at(9, 30);

      expect(getAppointmentDisplayStatus({ ...appointment(), status: 'COMPLETED' }, during)).toEqual({
        label: 'Terminé',
        tone: 'completed',
      });
      expect(getAppointmentDisplayStatus({ ...appointment(), status: 'CANCELLED' }, during)).toEqual({
        label: 'Annulé',
        tone: 'exception',
      });
      expect(getAppointmentDisplayStatus({ ...appointment(), status: 'NO_SHOW' }, during)).toEqual({
        label: 'Absence',
        tone: 'exception',
      });
    });
  });
});
