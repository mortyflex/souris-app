import type { Appointment } from '@/domain/appointments';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';

import {
  formatHomeGreeting,
  formatHomeWeekRange,
  formatNextAppointmentWhen,
  getNextAppointment,
} from '../presentation';

const now = new Date(2027, 2, 15, 10, 0);

function entry(
  id: string,
  startAt: Date,
  status: Appointment['status'] = 'SCHEDULED',
): AppointmentSessionEntry {
  return {
    appointment: {
      id,
      businessId: 'business-a',
      clientId: 'client-a',
      staffMemberId: 'staff-a',
      startAt,
      status,
      items: [],
    },
  } as AppointmentSessionEntry;
}

describe('Accueil presentation', () => {
  it('greets with Bonjour before 18:00 and Bonsoir from 18:00', () => {
    expect(formatHomeGreeting(new Date(2027, 2, 15, 7, 30))).toBe('Bonjour');
    expect(formatHomeGreeting(new Date(2027, 2, 15, 17, 59))).toBe('Bonjour');
    expect(formatHomeGreeting(new Date(2027, 2, 15, 18, 0))).toBe('Bonsoir');
  });

  it('picks the nearest Appointment still to come, whatever the order of the session', () => {
    const next = getNextAppointment(
      [
        entry('later', new Date(2027, 2, 16, 9, 0)),
        entry('soon', new Date(2027, 2, 15, 11, 0)),
        entry('past', new Date(2027, 2, 15, 9, 0)),
      ],
      now,
    );

    expect(next?.appointment.id).toBe('soon');
  });

  it('counts an Appointment starting exactly now and breaks ties by id', () => {
    const next = getNextAppointment([entry('b', now), entry('a', now)], now);

    expect(next?.appointment.id).toBe('a');
  });

  it('leaves out cancelled, no-show and completed Appointments', () => {
    const next = getNextAppointment(
      [
        entry('cancelled', new Date(2027, 2, 15, 11, 0), 'CANCELLED'),
        entry('no-show', new Date(2027, 2, 15, 11, 30), 'NO_SHOW'),
        entry('completed', new Date(2027, 2, 15, 12, 0), 'COMPLETED'),
        entry('confirmed', new Date(2027, 2, 15, 13, 0), 'CONFIRMED'),
      ],
      now,
    );

    expect(next?.appointment.id).toBe('confirmed');
  });

  it('returns nothing when no Appointment is to come', () => {
    expect(getNextAppointment([entry('past', new Date(2027, 2, 14, 9, 0))], now)).toBeUndefined();
    expect(getNextAppointment([], now)).toBeUndefined();
  });

  it('words when the next Appointment starts: the time alone today, tomorrow, then the date', () => {
    expect(formatNextAppointmentWhen(new Date(2027, 2, 15, 14, 5), now)).toBe('14:05');
    // Tomorrow by the civil calendar, even less than 24 h away.
    expect(formatNextAppointmentWhen(new Date(2027, 2, 16, 8, 0), now)).toBe('Demain · 08:00');
    expect(formatNextAppointmentWhen(new Date(2027, 2, 18, 9, 30), now)).toBe('Jeu. 18 mars · 09:30');
  });

  it('names the week without its year, and shortens the months when it spans two', () => {
    expect(formatHomeWeekRange(new Date(2026, 9, 5))).toBe('5–11 octobre');
    expect(formatHomeWeekRange(new Date(2026, 8, 28))).toBe('28 sept. – 4 oct.');
    expect(formatHomeWeekRange(new Date(2026, 11, 28))).toBe('28 déc. – 3 janv.');
  });
});
