import type { Appointment, AppointmentCancellationActor, AppointmentStatus } from '@/domain/appointments';
import { getClientActivitySummary } from '@/features/clients/profile/presentation';

import {
  countClientNoShows,
  findLatestPastAppointment,
  getClientAttendanceHistory,
} from '../attendance';

const NOW = new Date(2026, 9, 24, 12, 0);
const CLIENT = 'client-sofia';
const OTHER_CLIENT = 'client-lea';

function appointment(
  id: string,
  startAt: Date,
  status: AppointmentStatus,
  options: { clientId?: string; cancelledBy?: AppointmentCancellationActor } = {},
): Appointment {
  return {
    id,
    businessId: 'business-1',
    clientId: options.clientId ?? CLIENT,
    staffMemberId: 'staff-1',
    startAt,
    status,
    items: [
      {
        id: `${id}-item`,
        serviceId: 'service-cut',
        order: 0,
        serviceName: 'Coupe',
        serviceType: 'SERVICE',
        price: 40,
        phases: [{ id: `${id}-phase`, name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
      },
    ],
    ...(status === 'NO_SHOW' ? { noShow: { recordedAt: startAt } } : {}),
    ...(status === 'CANCELLED'
      ? { cancellation: { cancelledAt: startAt, cancelledBy: options.cancelledBy ?? 'CLIENT' } }
      : {}),
  };
}

const past = (day: number, hour = 10) => new Date(2026, 6, day, hour);
const future = (day: number) => new Date(2026, 11, day, 10);

describe('countClientNoShows', () => {
  it('counts only the NO_SHOW appointments of that client', () => {
    const appointments = [
      appointment('a', past(1), 'NO_SHOW'),
      appointment('b', past(2), 'COMPLETED'),
      appointment('c', past(3), 'CANCELLED', { cancelledBy: 'CLIENT' }),
      appointment('d', past(4), 'CANCELLED', { cancelledBy: 'BUSINESS' }),
      appointment('e', past(5), 'SCHEDULED'),
      appointment('f', future(1), 'CONFIRMED'),
      appointment('g', past(6), 'NO_SHOW', { clientId: OTHER_CLIENT }),
      appointment('h', past(7), 'NO_SHOW'),
    ];

    expect(countClientNoShows(appointments, CLIENT)).toBe(2);
    expect(countClientNoShows(appointments, OTHER_CLIENT)).toBe(1);
    expect(countClientNoShows(appointments, 'client-unknown')).toBe(0);
    expect(countClientNoShows([], CLIENT)).toBe(0);
  });

  it('is the profile « Absences » rule: identical to getClientActivitySummary', () => {
    const appointments = [
      appointment('a', past(1), 'NO_SHOW'),
      appointment('b', past(2), 'NO_SHOW'),
      appointment('c', past(3), 'CANCELLED', { cancelledBy: 'CLIENT' }),
      appointment('d', past(4), 'COMPLETED'),
      appointment('e', past(5), 'NO_SHOW', { clientId: OTHER_CLIENT }),
    ];
    const entries = appointments.map((entry) => ({ appointment: entry }));

    expect(countClientNoShows(appointments, CLIENT)).toBe(
      getClientActivitySummary(entries, [], CLIENT, NOW).noShowAppointmentCount,
    );
    expect(countClientNoShows(appointments, OTHER_CLIENT)).toBe(
      getClientActivitySummary(entries, [], OTHER_CLIENT, NOW).noShowAppointmentCount,
    );
  });
});

describe('findLatestPastAppointment', () => {
  it('picks the most recent by start time, whatever the insertion order', () => {
    const appointments = [
      appointment('newest', past(20), 'COMPLETED'),
      appointment('oldest', past(1), 'NO_SHOW'),
      appointment('middle', past(10), 'NO_SHOW'),
    ];

    expect(findLatestPastAppointment(appointments, CLIENT, NOW)?.id).toBe('newest');
    expect(findLatestPastAppointment([...appointments].reverse(), CLIENT, NOW)?.id).toBe('newest');
  });

  it('ignores future appointments, whatever their status', () => {
    const appointments = [
      appointment('missed', past(10), 'NO_SHOW'),
      appointment('next', future(1), 'SCHEDULED'),
      appointment('odd-future-complete', future(2), 'COMPLETED'),
    ];

    expect(findLatestPastAppointment(appointments, CLIENT, NOW)?.id).toBe('missed');
  });

  it('treats « now » as exclusive: an appointment starting right now is not past', () => {
    const appointments = [
      appointment('earlier', past(10), 'NO_SHOW'),
      appointment('right-now', NOW, 'COMPLETED'),
    ];

    expect(findLatestPastAppointment(appointments, CLIENT, NOW)?.id).toBe('earlier');
  });

  it('skips cancellations by the client and by the business', () => {
    const appointments = [
      appointment('missed', past(10), 'NO_SHOW'),
      appointment('client-cancelled', past(12), 'CANCELLED', { cancelledBy: 'CLIENT' }),
      appointment('business-cancelled', past(14), 'CANCELLED', { cancelledBy: 'BUSINESS' }),
    ];

    expect(findLatestPastAppointment(appointments, CLIENT, NOW)?.id).toBe('missed');
  });

  it('never looks at another client', () => {
    const appointments = [
      appointment('hers', past(20), 'NO_SHOW', { clientId: OTHER_CLIENT }),
      appointment('mine', past(10), 'COMPLETED'),
    ];

    expect(findLatestPastAppointment(appointments, CLIENT, NOW)?.id).toBe('mine');
    expect(findLatestPastAppointment(appointments, 'client-unknown', NOW)).toBeUndefined();
  });

  it('breaks a same-instant tie on the id, deterministically', () => {
    const appointments = [
      appointment('a', past(10), 'COMPLETED'),
      appointment('b', past(10), 'NO_SHOW'),
    ];

    expect(findLatestPastAppointment(appointments, CLIENT, NOW)?.id).toBe('b');
    expect(findLatestPastAppointment([...appointments].reverse(), CLIENT, NOW)?.id).toBe('b');
  });
});

describe('getClientAttendanceHistory', () => {
  it('reports no history for a client without appointments', () => {
    expect(getClientAttendanceHistory([], CLIENT, NOW)).toEqual({
      noShowCount: 0,
      latestOutcome: undefined,
    });
  });

  it('reports a missed latest appointment', () => {
    const appointments = [
      appointment('came', past(1), 'COMPLETED'),
      appointment('missed', past(10), 'NO_SHOW'),
    ];

    expect(getClientAttendanceHistory(appointments, CLIENT, NOW)).toEqual({
      noShowCount: 1,
      latestOutcome: 'NO_SHOW',
    });
  });

  it('reports an attended latest appointment after earlier no-shows', () => {
    const appointments = [
      appointment('missed-1', past(1), 'NO_SHOW'),
      appointment('missed-2', past(2), 'NO_SHOW'),
      appointment('came-back', past(10), 'COMPLETED'),
    ];

    expect(getClientAttendanceHistory(appointments, CLIENT, NOW)).toEqual({
      noShowCount: 2,
      latestOutcome: 'ATTENDED',
    });
  });

  it('leaves the latest outcome unknown when the most recent past appointment was never closed', () => {
    for (const status of ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as const) {
      const appointments = [
        appointment('missed', past(1), 'NO_SHOW'),
        appointment('open', past(10), status),
      ];

      expect(getClientAttendanceHistory(appointments, CLIENT, NOW)).toEqual({
        noShowCount: 1,
        latestOutcome: undefined,
      });
    }
  });

  it('does not let a future booking hide a missed last appointment', () => {
    const appointments = [
      appointment('missed', past(10), 'NO_SHOW'),
      appointment('next', future(1), 'SCHEDULED'),
    ];

    expect(getClientAttendanceHistory(appointments, CLIENT, NOW).latestOutcome).toBe('NO_SHOW');
  });

  it('does not let a later cancellation hide a missed last appointment', () => {
    const appointments = [
      appointment('missed', past(10), 'NO_SHOW'),
      appointment('cancelled', past(12), 'CANCELLED', { cancelledBy: 'BUSINESS' }),
    ];

    expect(getClientAttendanceHistory(appointments, CLIENT, NOW)).toEqual({
      noShowCount: 1,
      latestOutcome: 'NO_SHOW',
    });
  });

  it('never mutates the appointments it reads', () => {
    const appointments = [
      appointment('b', past(2), 'NO_SHOW'),
      appointment('a', past(1), 'COMPLETED'),
    ];
    const snapshot = JSON.stringify(appointments);

    getClientAttendanceHistory(appointments, CLIENT, NOW);

    expect(JSON.stringify(appointments)).toBe(snapshot);
  });
});
