import {
  getAppointmentDaySummary,
  type Appointment,
  type AppointmentDeposit,
} from '@/domain/appointments';
import type { Client } from '@/domain/clients';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';

import {
  HOME_ENCASHMENT_GRACE_MINUTES,
  formatHomeEncashmentReminder,
  formatHomeGreeting,
  formatHomeWeekRange,
  formatNextAppointmentWhen,
  getHomeEncashmentInsight,
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

// One 60-minute, 50 € Appointment of 15 March 2027, ending at `hour:minute` + 1 h.
function visit(
  id: string,
  hour: number,
  minute = 0,
  overrides: Partial<Appointment> = {},
): Appointment {
  return {
    id,
    businessId: 'business-a',
    clientId: 'client-a',
    staffMemberId: 'staff-a',
    startAt: new Date(2027, 2, 15, hour, minute),
    status: 'SCHEDULED',
    items: [
      {
        id: `item-${id}`,
        serviceId: 'service-a',
        order: 0,
        serviceName: 'Coupe',
        serviceType: 'SERVICE',
        price: 50,
        phases: [{ id: `phase-${id}`, name: 'Coupe', durationMinutes: 60, requiresStaff: true }],
      },
    ],
    ...overrides,
  };
}

function deposit(appointmentId: string, amountCents: number): AppointmentDeposit {
  const paidAt = new Date(2027, 2, 10, 12, 0);
  return {
    id: `deposit-${appointmentId}`,
    businessId: 'business-a',
    appointmentId,
    amountCents,
    paymentMethod: 'CARD',
    paidAt,
    status: 'ACTIVE',
    createdAt: paidAt,
  };
}

function insightAt(
  at: Date,
  appointments: readonly Appointment[],
  deposits: readonly AppointmentDeposit[] = [],
) {
  const summary = getAppointmentDaySummary({ appointments, sales: [], deposits }, at);
  return getHomeEncashmentInsight(summary.rows, at);
}

describe('Accueil encashment reminder', () => {
  // 09:00 → 10:00: the grace ends at 10:15.
  const nineOClock = visit('nine', 9);
  const at = (hour: number, minute: number) => new Date(2027, 2, 15, hour, minute);

  it('waits 15 minutes after the planned end', () => {
    expect(HOME_ENCASHMENT_GRACE_MINUTES).toBe(15);
  });

  it('finds nothing on a day without Appointments', () => {
    expect(insightAt(at(18, 0), [])).toBeUndefined();
  });

  it('leaves a future Appointment and one still running alone', () => {
    expect(insightAt(at(8, 0), [nineOClock])).toBeUndefined();
    expect(insightAt(at(9, 30), [nineOClock])).toBeUndefined();
  });

  it('stays quiet during the grace period after the planned end', () => {
    expect(insightAt(at(10, 0), [nineOClock])).toBeUndefined();
    expect(insightAt(at(10, 14), [nineOClock])).toBeUndefined();
  });

  it('reminds once the grace period has elapsed, whatever the status', () => {
    expect(insightAt(at(10, 15), [nineOClock])).toEqual({ appointment: nineOClock, count: 1 });
    const confirmed = visit('confirmed', 9, 0, { status: 'CONFIRMED' });
    expect(insightAt(at(11, 0), [confirmed])?.appointment.id).toBe('confirmed');
  });

  it('counts the processing time of a technique in the planned end', () => {
    const technique = visit('technique', 9, 0, {
      items: [
        {
          ...nineOClock.items[0],
          serviceType: 'TECHNIQUE',
          phases: [
            { id: 'application', name: 'Application', durationMinutes: 30, requiresStaff: true },
            { id: 'processing', name: 'Pose', durationMinutes: 60, requiresStaff: false },
          ],
        },
      ],
    });

    // Ends at 10:30, processing included.
    expect(insightAt(at(10, 44), [technique])).toBeUndefined();
    expect(insightAt(at(10, 45), [technique])?.count).toBe(1);
  });

  it('leaves out a settled Appointment', () => {
    const paid = visit('paid', 9, 0, {
      status: 'COMPLETED',
      payment: { paidAt: at(10, 5), cardAmountCents: 5000, cashAmountCents: 0 },
    });

    expect(insightAt(at(12, 0), [paid])).toBeUndefined();
  });

  it('keeps an Appointment whose deposit leaves a balance', () => {
    expect(insightAt(at(12, 0), [nineOClock], [deposit('nine', 2000)])?.appointment.id).toBe('nine');
  });

  it('leaves out a fully prepaid Appointment, completed or not', () => {
    const completed = visit('prepaid-done', 9, 0, { status: 'COMPLETED' });

    expect(insightAt(at(12, 0), [nineOClock], [deposit('nine', 5000)])).toBeUndefined();
    expect(insightAt(at(12, 0), [completed], [deposit('prepaid-done', 5000)])).toBeUndefined();
  });

  it('leaves out cancelled and no-show Appointments', () => {
    const cancelled = visit('cancelled', 9, 0, { status: 'CANCELLED' });
    const noShow = visit('no-show', 9, 0, { status: 'NO_SHOW' });

    expect(insightAt(at(12, 0), [cancelled, noShow])).toBeUndefined();
  });

  it('leaves the Appointments of another day alone', () => {
    const yesterday = visit('yesterday', 9, 0, {
      startAt: new Date(2027, 2, 14, 9, 0),
      status: 'COMPLETED',
    });

    expect(insightAt(at(12, 0), [yesterday])).toBeUndefined();
  });

  it('counts every outstanding Appointment and targets the oldest by start time', () => {
    const early = visit('early', 8);
    const late = visit('late', 10, 30);
    const running = visit('running', 11, 30);

    // 12:00: « running » has not ended; the session order does not matter.
    const insight = insightAt(at(12, 0), [running, late, nineOClock, early]);
    expect(insight).toEqual({ appointment: early, count: 3 });
    // Once the oldest is collected, the next one becomes the target.
    const collected = { ...early, status: 'COMPLETED' as const, payment: { paidAt: at(12, 1), cardAmountCents: 5000, cashAmountCents: 0 } };
    expect(insightAt(at(12, 2), [running, late, nineOClock, collected])).toEqual({
      appointment: nineOClock,
      count: 2,
    });
  });

  const alicia = { id: 'client-a', firstName: 'Alicia', lastName: 'Burel' } as Client;

  it('shows the first name alone and says the full name', () => {
    expect(formatHomeEncashmentReminder({ appointment: nineOClock, count: 1 }, alicia)).toEqual({
      detail: '09:00 · Alicia',
      emphasis: 'Reste à encaisser',
      accessibilityLabel:
        'Rendez-vous de 09:00 avec Alicia Burel. Reste à encaisser. Ouvrir le rendez-vous.',
    });
  });

  it('keeps the display name of a client without a first name, or one that is gone', () => {
    const surnameOnly = { id: 'client-b', firstName: ' ', lastName: 'Burel' } as Client;
    const one = { appointment: nineOClock, count: 1 };

    expect(formatHomeEncashmentReminder(one, surnameOnly).detail).toBe('09:00 · Burel');
    expect(formatHomeEncashmentReminder(one, undefined).detail).toBe('09:00 · Client inconnu');
  });

  it('counts several Appointments instead of naming one', () => {
    expect(formatHomeEncashmentReminder({ appointment: nineOClock, count: 2 }, alicia)).toEqual({
      detail: '2 rendez-vous',
      emphasis: 'restent à encaisser',
      accessibilityLabel: '2 rendez-vous restent à encaisser. Ouvrir le plus ancien.',
    });
  });
});
