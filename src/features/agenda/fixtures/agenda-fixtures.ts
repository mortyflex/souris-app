import type { Appointment, AppointmentItem, AppointmentPhase } from '@/domain/appointments';

export interface AgendaFixtureAppointment {
  readonly appointment: Appointment;
  readonly clientName: string;
}

function localTime(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
}

function phase(
  id: string,
  name: string,
  durationMinutes: number,
  requiresStaff: boolean,
): AppointmentPhase {
  return { id, name, durationMinutes, requiresStaff };
}

function item(
  id: string,
  serviceId: string,
  serviceName: string,
  serviceType: AppointmentItem['serviceType'],
  phases: readonly AppointmentPhase[],
): AppointmentItem {
  return {
    id,
    serviceId,
    order: 0,
    serviceName,
    serviceType,
    price: serviceType === 'TECHNIQUE' ? 95 : 42,
    phases,
  };
}

function fixture(
  day: Date,
  id: string,
  clientName: string,
  hour: number,
  minute: number,
  itemValue: AppointmentItem,
): AgendaFixtureAppointment {
  return {
    clientName,
    appointment: {
      id,
      businessId: 'fixture-business',
      clientId: `client-${id}`,
      staffMemberId: 'staff-amelie',
      startAt: localTime(day, hour, minute),
      status: 'SCHEDULED',
      items: [itemValue],
    },
  };
}

/** Initial in-memory Agenda data; history and persistence are intentionally absent. */
export function createAgendaFixtures(day: Date): readonly AgendaFixtureAppointment[] {
  return [
    fixture(
      day,
      'agenda-lea',
      'Léa Martin',
      9,
      0,
      item('item-lea', 'service-color', 'Coloration', 'TECHNIQUE', [
        phase('lea-application', 'Application', 15, true),
        phase('lea-processing', 'Temps de pose', 35, false),
        phase('lea-rinse', 'Rinçage & coiffage', 25, true),
      ]),
    ),
    fixture(
      day,
      'agenda-camille',
      'Camille Durand',
      9,
      20,
      item('item-camille', 'service-cut', 'Coupe', 'SERVICE', [
        phase('camille-cut', 'Coupe', 45, true),
      ]),
    ),
    fixture(
      day,
      'agenda-ines',
      'Inès Bernard',
      14,
      40,
      item('item-ines', 'service-blowdry', 'Brushing', 'SERVICE', [
        phase('ines-blowdry', 'Brushing', 35, true),
      ]),
    ),
    fixture(
      day,
      'agenda-sofia',
      'Sofia Petit',
      14,
      0,
      item('item-sofia', 'service-highlights', 'Balayage', 'TECHNIQUE', [
        phase('sofia-application', 'Application', 30, true),
        phase('sofia-processing', 'Temps de pose', 55, false),
        phase('sofia-finish', 'Patine & finition', 30, true),
      ]),
    ),
    fixture(
      day,
      'agenda-nadia',
      'Nadia Roy',
      17,
      30,
      item('item-nadia', 'service-treatment', 'Soin profond', 'SERVICE', [
        phase('nadia-treatment', 'Soin profond', 45, true),
      ]),
    ),
  ];
}
