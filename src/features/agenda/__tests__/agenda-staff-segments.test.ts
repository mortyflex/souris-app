import type { Appointment, AppointmentPhase } from '@/domain/appointments';

import { buildAgendaStaffSegments } from '../layout/agenda-staff-segments';
import { calculateDayIntervalLayout } from '../layout/day-layout';
import { getOperationalAgendaEntries } from '../operational-visibility';

function at(minutes: number): Date {
  return new Date(2026, 7, 24, 9, minutes);
}

function createAppointment(
  phases: readonly AppointmentPhase[],
  id = 'appointment-a',
  startMinute = 0,
): Appointment {
  return {
    id,
    businessId: 'business-a',
    clientId: `client-${id}`,
    staffMemberId: 'staff-a',
    startAt: at(startMinute),
    status: 'SCHEDULED',
    items: [
      {
        id: `item-${id}`,
        serviceId: 'service-a',
        order: 0,
        serviceName: 'Coloration',
        serviceType: 'TECHNIQUE',
        price: 95,
        phases,
      },
    ],
  };
}

function phase(id: string, name: string, durationMinutes: number, requiresStaff: boolean): AppointmentPhase {
  return { id, name, durationMinutes, requiresStaff };
}

describe('buildAgendaStaffSegments', () => {
  it('turns active-processing-active into exactly two visible segments', () => {
    const segments = buildAgendaStaffSegments(
      createAppointment([
        phase('application', 'Application', 15, true),
        phase('processing', 'Temps de pose', 35, false),
        phase('finish', 'Rinçage', 10, true),
      ]),
    );

    expect(segments.map(({ startAt, endAt, phaseNames }) => ({
      startAt,
      endAt,
      phaseNames,
    }))).toEqual([
      { startAt: at(0), endAt: at(15), phaseNames: ['Application'] },
      { startAt: at(50), endAt: at(60), phaseNames: ['Rinçage'] },
    ]);
  });

  it('does not create a visible segment for processing', () => {
    const segments = buildAgendaStaffSegments(
      createAppointment([phase('processing', 'Temps de pose', 35, false)]),
    );

    expect(segments).toHaveLength(0);
  });

  it('marks active work after processing as a reprise', () => {
    const segments = buildAgendaStaffSegments(
      createAppointment([
        phase('application', 'Application', 15, true),
        phase('processing', 'Temps de pose', 35, false),
        phase('finish', 'Rinçage', 10, true),
      ]),
    );

    expect(segments[0].isResume).toBe(false);
    expect(segments[1].isResume).toBe(true);
  });

  it('carries completed status without changing visible geometry', () => {
    const value = createAppointment([
      phase('application', 'Application', 15, true),
      phase('processing', 'Temps de pose', 35, false),
      phase('finish', 'Rinçage', 10, true),
    ]);
    const segments = buildAgendaStaffSegments({ ...value, status: 'COMPLETED' });

    expect(segments.map(({ status }) => status)).toEqual(['COMPLETED', 'COMPLETED']);
    expect(segments.map(({ startAt, endAt }) => [startAt, endAt])).toEqual([
      [at(0), at(15)],
      [at(50), at(60)],
    ]);
  });

  it('keeps consecutive active phases in one continuous segment', () => {
    const segments = buildAgendaStaffSegments(
      createAppointment([
        phase('application', 'Application', 15, true),
        phase('finish', 'Rinçage', 10, true),
      ]),
    );

    expect(segments).toHaveLength(1);
    expect(segments[0].phaseNames).toEqual(['Application', 'Rinçage']);
    expect(segments[0].startAt).toEqual(at(0));
    expect(segments[0].endAt).toEqual(at(25));
  });

  it("does not overlap an appointment placed inside another appointment's processing gap", () => {
    const first = buildAgendaStaffSegments(
      createAppointment([
        phase('application', 'Application', 15, true),
        phase('processing', 'Temps de pose', 35, false),
        phase('finish', 'Rinçage', 10, true),
      ], 'first'),
    );
    const second = buildAgendaStaffSegments(
      createAppointment([phase('brushing', 'Brushing', 30, true)], 'second', 20),
    );
    const visibleOverlap = first.some((firstSegment) =>
      second.some(
        (secondSegment) =>
          firstSegment.startAt < secondSegment.endAt && secondSegment.startAt < firstSegment.endAt,
      ),
    );
    const layout = calculateDayIntervalLayout([...first, ...second]);

    expect(visibleOverlap).toBe(false);
    expect(layout.every((segment) => segment.columnCount === 1)).toBe(true);
  });

  it('excludes cancelled and no-show records before overlap columns are calculated', () => {
    const active = createAppointment(
      [phase('active', 'Coupe', 60, true)],
      'active',
    );
    const cancelled = {
      ...createAppointment([phase('cancelled', 'Coupe', 60, true)], 'cancelled'),
      status: 'CANCELLED' as const,
    };
    const noShow = {
      ...createAppointment([phase('no-show', 'Coupe', 60, true)], 'no-show'),
      status: 'NO_SHOW' as const,
    };
    const operationalEntries = getOperationalAgendaEntries([
      { appointment: cancelled },
      { appointment: active },
      { appointment: noShow },
    ]);
    const segments = operationalEntries.flatMap(({ appointment }) =>
      buildAgendaStaffSegments(appointment),
    );
    const layout = calculateDayIntervalLayout(segments);

    expect(segments.map(({ appointmentId }) => appointmentId)).toEqual(['active']);
    expect(layout.map(({ id, column, columnCount }) => ({
      id,
      column,
      columnCount,
    }))).toEqual([{ id: 'active:active', column: 0, columnCount: 1 }]);
  });
});
