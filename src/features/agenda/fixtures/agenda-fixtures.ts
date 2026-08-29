// Souris — Development Agenda fixtures
//
// Initial in-memory Agenda data; history and persistence are intentionally
// absent. Fixture status is seed data, never auto-computed at runtime:
// appointments on weekdays BEFORE the anchor day represent normally
// completed services and are seeded as COMPLETED; same-day and later
// appointments stay SCHEDULED.

import type { AppointmentItem, AppointmentPhase } from '@/domain/appointments';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';

import { getWeekDays, isSameLocalDay, startOfLocalDay } from '../calendar/week';

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
  order = 0,
): AppointmentItem {
  return {
    id,
    serviceId,
    order,
    serviceName,
    serviceType,
    price: serviceType === 'TECHNIQUE' ? 95 : 42,
    phases,
  };
}

function fixture(
  anchorDay: Date,
  day: Date,
  id: string,
  hour: number,
  minute: number,
  itemValue: AppointmentItem,
  additionalItems: readonly AppointmentItem[] = [],
): AppointmentSessionEntry {
  const isPast = day.getTime() < startOfLocalDay(anchorDay).getTime();

  return {
    appointment: {
      id,
      businessId: 'fixture-business',
      clientId: `client-${id}`,
      staffMemberId: 'staff-amelie',
      startAt: localTime(day, hour, minute),
      status: isPast ? 'COMPLETED' : 'SCHEDULED',
      items: [itemValue, ...additionalItems],
    },
  };
}

/** Initial in-memory Agenda data; history and persistence are intentionally absent. */
export function createAgendaFixtures(day: Date): readonly AppointmentSessionEntry[] {
  const weekDays = getWeekDays(day);
  const additionalDays = weekDays.filter((weekDay) => !isSameLocalDay(weekDay, day));
  const busyDay = additionalDays[0];
  const mediumDay = additionalDays[1];
  const lightDay = additionalDays[2];

  return [
    fixture(
      day,
      day,
      'agenda-lea',
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
      day,
      'agenda-camille',
      9,
      20,
      item('item-camille', 'service-cut', 'Coupe', 'SERVICE', [
        phase('camille-cut', 'Coupe', 45, true),
      ]),
    ),
    fixture(
      day,
      day,
      'agenda-ines',
      14,
      40,
      item('item-ines', 'service-blowdry', 'Brushing', 'SERVICE', [
        phase('ines-blowdry', 'Brushing', 35, true),
      ]),
    ),
    fixture(
      day,
      day,
      'agenda-sofia',
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
      day,
      'agenda-nadia',
      17,
      30,
      item('item-nadia', 'service-treatment', 'Soin profond', 'SERVICE', [
        phase('nadia-treatment', 'Soin profond', 45, true),
      ]),
    ),
    fixture(
      day,
      busyDay,
      'agenda-elodie',
      9,
      30,
      item('item-elodie', 'service-cut', 'Coupe', 'SERVICE', [
        phase('elodie-cut', 'Coupe', 45, true),
      ]),
    ),
    fixture(
      day,
      busyDay,
      'agenda-hugo',
      13,
      0,
      item('item-hugo', 'service-beard', 'Taille', 'SERVICE', [
        phase('hugo-beard', 'Taille', 30, true),
      ]),
    ),
    fixture(
      day,
      mediumDay,
      'agenda-julie',
      10,
      0,
      item('item-julie-color', 'service-color', 'Coloration', 'TECHNIQUE', [
        phase('julie-color', 'Application', 30, true),
      ]),
      [
        item('item-julie-cut', 'service-cut', 'Coupe', 'SERVICE', [
          phase('julie-cut', 'Coupe', 30, true),
        ], 1),
      ],
    ),
    fixture(
      day,
      lightDay,
      'agenda-anais',
      11,
      15,
      item('item-anais', 'service-treatment', 'Soin profond', 'SERVICE', [
        phase('anais-treatment', 'Soin profond', 45, true),
      ]),
    ),
  ];
}
