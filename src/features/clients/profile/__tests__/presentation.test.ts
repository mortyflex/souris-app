import type { Appointment, AppointmentItem, AppointmentStatus } from '@/domain/appointments';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';

import {
  formatAppointmentServiceSummary,
  getAppointmentSnapshotTotal,
  isTerminalAppointmentStatus,
} from '@/features/appointments/presentation';

import {
  getClientActivitySummary,
  getClientAppointments,
  getHistoricalClientAppointments,
  getUpcomingClientAppointments,
} from '../presentation';

function appointment(
  id: string,
  clientId: string,
  startAt: Date,
  status: AppointmentStatus = 'SCHEDULED',
  serviceName = 'Coupe',
  price = 40,
): Appointment {
  const items: AppointmentItem[] = [
    {
      id: `${id}-item`,
      serviceId: 'service-cut',
      order: 0,
      serviceName,
      serviceType: 'SERVICE',
      price,
      phases: [
        {
          id: `${id}-phase`,
          name: serviceName,
          durationMinutes: 30,
          requiresStaff: true,
        },
      ],
    },
  ];

  return {
    id,
    businessId: 'business-a',
    clientId,
    staffMemberId: 'staff-a',
    startAt,
    status,
    items,
  };
}

function entry(value: Appointment): AppointmentSessionEntry {
  return { appointment: value };
}

const now = new Date(2026, 7, 25, 12, 0);

describe('getClientAppointments', () => {
  it('keeps only appointments with the matching clientId', () => {
    const history = getClientAppointments(
      [
        entry(appointment('a1', 'client-x', new Date(2026, 7, 24, 10))),
        entry(appointment('a2', 'client-y', new Date(2026, 7, 24, 11))),
        entry(appointment('a3', 'client-x', new Date(2026, 7, 25, 9))),
      ],
      'client-x',
    );

    expect(history.map(({ appointment: value }) => value.id)).toEqual(['a3', 'a1']);
  });

  it('sorts newest first and does not mutate the source entries', () => {
    const source = [
      entry(appointment('old', 'client-x', new Date(2026, 1, 1, 9))),
      entry(appointment('new', 'client-x', new Date(2026, 7, 25, 14))),
    ];

    expect(getClientAppointments(source, 'client-x').map(({ appointment: value }) => value.id)).toEqual([
      'new',
      'old',
    ]);
    expect(source.map(({ appointment: value }) => value.id)).toEqual(['old', 'new']);
  });
});

describe('getClientActivitySummary', () => {
  const mixed = [
    entry(appointment('completed-1', 'client-x', new Date(2026, 6, 1, 10), 'COMPLETED', 'Coupe', 50)),
    entry(appointment('completed-2', 'client-x', new Date(2026, 6, 15, 10), 'COMPLETED', 'Brushing', 30)),
    entry(appointment('scheduled-future', 'client-x', new Date(2026, 7, 26, 10), 'SCHEDULED', 'Coupe', 40)),
    entry(appointment('confirmed-future', 'client-x', new Date(2026, 7, 30, 10), 'CONFIRMED', 'Balayage', 95)),
    entry(appointment('cancelled', 'client-x', new Date(2026, 6, 20, 10), 'CANCELLED', 'Coupe', 40)),
    entry(appointment('no-show', 'client-x', new Date(2026, 7, 1, 10), 'NO_SHOW', 'Soin', 45)),
    entry(appointment('other-client', 'client-y', new Date(2026, 6, 1, 10), 'COMPLETED', 'Coupe', 999)),
    entry(appointment('scheduled-past', 'client-x', new Date(2026, 6, 10, 10), 'SCHEDULED', 'Coupe', 40)),
  ];

  it('counts COMPLETED, CANCELLED, and NO_SHOW exclusively by status', () => {
    const summary = getClientActivitySummary(mixed, 'client-x', now);

    expect(summary.completedAppointmentCount).toBe(2);
    expect(summary.cancelledAppointmentCount).toBe(1);
    expect(summary.noShowAppointmentCount).toBe(1);
    expect(summary.appointmentCount).toBe(7);
  });

  it('computes total spent from COMPLETED snapshot prices only', () => {
    const summary = getClientActivitySummary(mixed, 'client-x', now);

    // 50 + 30 — the SCHEDULED/CONFIRMED/CANCELLED/NO_SHOW prices are excluded.
    expect(summary.totalSpent).toBe(80);
  });

  it('excludes appointments of other clients entirely', () => {
    const summary = getClientActivitySummary(mixed, 'client-x', now);

    expect(summary.completedAppointmentCount).toBe(2);
    expect(summary.totalSpent).toBe(80);
    expect(
      summary.historicalAppointments.every(
        ({ appointment: value }) => value.clientId === 'client-x',
      ),
    ).toBe(true);
  });

  it('finds the nearest upcoming appointment by startAt', () => {
    const summary = getClientActivitySummary(mixed, 'client-x', now);

    expect(summary.nextAppointment?.appointment.id).toBe('scheduled-future');
    expect(summary.upcomingAppointments.map(({ appointment: value }) => value.id)).toEqual([
      'scheduled-future',
      'confirmed-future',
    ]);
  });

  it('partitions historical appointments (newest first) excluding upcoming', () => {
    const summary = getClientActivitySummary(mixed, 'client-x', now);

    expect(summary.historicalAppointments.map(({ appointment: value }) => value.id)).toEqual([
      'no-show',
      'cancelled',
      'completed-2',
      'scheduled-past',
      'completed-1',
    ]);
  });

  it('does not mutate the source array', () => {
    const source = [...mixed];

    getClientActivitySummary(source, 'client-x', now);

    expect(source.map(({ appointment: value }) => value.id)).toEqual(
      mixed.map(({ appointment: value }) => value.id),
    );
  });
});

describe('upcoming/history classification', () => {
  it('excludes CANCELLED, NO_SHOW, and COMPLETED from upcoming even in the future', () => {
    const future = new Date(2026, 8, 10, 10, 0);
    const values = [
      entry(appointment('f-cancelled', 'client-x', future, 'CANCELLED')),
      entry(appointment('f-noshow', 'client-x', future, 'NO_SHOW')),
      entry(appointment('f-completed', 'client-x', future, 'COMPLETED')),
      entry(appointment('f-scheduled', 'client-x', future, 'SCHEDULED')),
    ];

    const upcoming = getUpcomingClientAppointments(values, 'client-x', now);

    expect(upcoming.map(({ appointment: value }) => value.id)).toEqual(['f-scheduled']);
  });

  it('excludes past active appointments from upcoming', () => {
    const past = new Date(2026, 6, 1, 10, 0);
    const upcoming = getUpcomingClientAppointments(
      [entry(appointment('past-scheduled', 'client-x', past, 'SCHEDULED'))],
      'client-x',
      now,
    );

    expect(upcoming).toEqual([]);
  });

  it('keeps past active appointments in history', () => {
    const past = new Date(2026, 6, 1, 10, 0);
    const history = getHistoricalClientAppointments(
      [entry(appointment('past-scheduled', 'client-x', past, 'SCHEDULED'))],
      'client-x',
      now,
    );

    expect(history.map(({ appointment: value }) => value.id)).toEqual(['past-scheduled']);
  });
});

describe('snapshot-based history summary', () => {
  it('builds the summary from AppointmentItem snapshots only', () => {
    const value = appointment(
      'a1',
      'client-x',
      new Date(2026, 7, 24, 10),
      'SCHEDULED',
      'Ancien nom du catalogue',
      87,
    );

    // The current catalog is never consulted — snapshot reality wins.
    expect(formatAppointmentServiceSummary(value)).toBe('Ancien nom du catalogue');
    expect(getAppointmentSnapshotTotal(value)).toBe(87);
  });

  it('total spent uses the snapshot price even when the catalog changes later', () => {
    // Snapshot recorded at booking time: 80 €.
    const booked = appointment('a1', 'client-x', new Date(2026, 6, 1, 10), 'COMPLETED', 'Balayage', 80);
    // The same service costs 95 € in the current catalog — irrelevant here.
    const summary = getClientActivitySummary([entry(booked)], 'client-x', now);

    expect(summary.totalSpent).toBe(80);
  });

  it('summarizes multiple snapshot services without catalog access', () => {
    const value = appointment('a1', 'client-x', new Date(2026, 7, 24, 10), 'SCHEDULED', 'Coupe', 40);
    const extended: Appointment = {
      ...value,
      items: [
        ...value.items,
        {
          id: 'extra-item',
          serviceId: 'service-color',
          order: 1,
          serviceName: 'Coloration',
          serviceType: 'TECHNIQUE',
          price: 95,
          phases: [
            { id: 'p1', name: 'Application', durationMinutes: 15, requiresStaff: true },
            { id: 'p2', name: 'Temps de pose', durationMinutes: 35, requiresStaff: false },
          ],
        },
      ],
    };

    expect(formatAppointmentServiceSummary(extended)).toBe('Coupe + Coloration');
    expect(getAppointmentSnapshotTotal(extended)).toBe(135);
  });
});

describe('isTerminalAppointmentStatus', () => {
  it('recognizes only terminal historical outcomes', () => {
    expect(isTerminalAppointmentStatus('CANCELLED')).toBe(true);
    expect(isTerminalAppointmentStatus('NO_SHOW')).toBe(true);
    expect(isTerminalAppointmentStatus('SCHEDULED')).toBe(false);
    expect(isTerminalAppointmentStatus('COMPLETED')).toBe(false);
    expect(isTerminalAppointmentStatus('IN_PROGRESS')).toBe(false);
  });
});
