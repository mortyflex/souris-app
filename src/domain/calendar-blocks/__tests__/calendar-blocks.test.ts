// Souris — Calendar Block domain rules
//
// Validity (start / end / reason), the staff-aware conflict rule against other
// blocks and against the staff-required intervals of client Appointments, and
// the structural guarantee that a block carries no client or financial data.

import type { Appointment, AppointmentItem } from '@/domain/appointments';
import {
  areStaffBusyIntervalsEqual,
  getAppointmentStaffBusyIntervals,
  setAppointmentDiscount,
} from '@/domain/appointments';

import {
  CALENDAR_BLOCK_REASON_MAX_LENGTH,
  CalendarBlockInvalidError,
  createCalendarBlock,
  doIntervalsOverlap,
  findAppointmentCalendarBlockConflict,
  findAppointmentChangeCalendarBlockConflict,
  findCalendarBlockConflict,
  normalizeCalendarBlockReason,
  validateCalendarBlock,
  type CalendarBlock,
} from '..';

const at = (hour: number, minute = 0) => new Date(2026, 8, 21, hour, minute);

function block(overrides: Partial<CalendarBlock> = {}): CalendarBlock {
  return {
    id: 'block-1',
    businessId: 'business-a',
    staffMemberId: 'staff-a',
    startAt: at(10),
    endAt: at(11),
    reason: 'Pause',
    ...overrides,
  };
}

function item(order: number, phases: readonly (readonly [number, boolean])[]): AppointmentItem {
  return {
    id: `item-${order}`,
    serviceId: `service-${order}`,
    order,
    serviceName: `Service ${order}`,
    serviceType: 'TECHNIQUE',
    price: 50,
    phases: phases.map(([durationMinutes, requiresStaff], index) => ({
      id: `phase-${order}-${index}`,
      name: `Phase ${index}`,
      durationMinutes,
      requiresStaff,
    })),
  };
}

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appointment-1',
    businessId: 'business-a',
    clientId: 'client-1',
    staffMemberId: 'staff-a',
    startAt: at(10),
    status: 'SCHEDULED',
    items: [item(0, [[60, true]])],
    ...overrides,
  };
}

describe('Calendar Block validity', () => {
  it('accepts a block with a start, a later end and a reason', () => {
    expect(validateCalendarBlock(block())).toEqual([]);
    expect(createCalendarBlock(block())).toEqual(block());
  });

  it('rejects an end before or equal to the start', () => {
    expect(validateCalendarBlock(block({ endAt: at(10) }))).toEqual(['END_NOT_AFTER_START']);
    expect(validateCalendarBlock(block({ endAt: at(9, 30) }))).toEqual(['END_NOT_AFTER_START']);
    expect(() => createCalendarBlock(block({ endAt: at(10) }))).toThrow(CalendarBlockInvalidError);
  });

  it('rejects an invalid instant', () => {
    expect(validateCalendarBlock(block({ endAt: new Date(Number.NaN) }))).toEqual([
      'END_NOT_AFTER_START',
    ]);
  });

  it('rejects an empty or blank reason and never keeps an empty string', () => {
    expect(validateCalendarBlock(block({ reason: '' }))).toEqual(['REASON_REQUIRED']);
    expect(validateCalendarBlock(block({ reason: '  \n ' }))).toEqual(['REASON_REQUIRED']);
    expect(normalizeCalendarBlockReason('   ')).toBeUndefined();
    expect(normalizeCalendarBlockReason(undefined)).toBeUndefined();
    expect(() => createCalendarBlock(block({ reason: ' ' }))).toThrow(CalendarBlockInvalidError);
  });

  it('reports every broken rule at once', () => {
    expect(validateCalendarBlock(block({ endAt: at(9), reason: '' }))).toEqual([
      'END_NOT_AFTER_START',
      'REASON_REQUIRED',
    ]);
  });

  it('normalizes the reason to one trimmed, bounded line', () => {
    expect(createCalendarBlock(block({ reason: '  Rendez-vous \n médical  ' })).reason).toBe(
      'Rendez-vous médical',
    );
    expect(normalizeCalendarBlockReason('x'.repeat(200))).toHaveLength(
      CALENDAR_BLOCK_REASON_MAX_LENGTH,
    );
  });

  it('keeps any free text as the reason — suggestions are not a vocabulary', () => {
    expect(createCalendarBlock(block({ reason: 'Chercher les enfants' })).reason).toBe(
      'Chercher les enfants',
    );
  });

  it('never mutates its input and copies the instants', () => {
    const source = block({ reason: ' Pause ' });
    const created = createCalendarBlock(source);
    expect(source.reason).toBe(' Pause ');
    expect(created.startAt).not.toBe(source.startAt);
    expect(created.startAt.getTime()).toBe(source.startAt.getTime());
  });

  it('carries no client, price, payment, discount, item or status data', () => {
    expect(Object.keys(createCalendarBlock(block())).sort()).toEqual([
      'businessId',
      'endAt',
      'id',
      'reason',
      'staffMemberId',
      'startAt',
    ]);
  });
});

describe('interval overlap', () => {
  it('treats ends as exclusive: adjacent intervals do not overlap', () => {
    expect(
      doIntervalsOverlap({ startAt: at(10), endAt: at(11) }, { startAt: at(11), endAt: at(12) }),
    ).toBe(false);
    expect(
      doIntervalsOverlap({ startAt: at(11), endAt: at(12) }, { startAt: at(10), endAt: at(11) }),
    ).toBe(false);
  });

  it('detects partial, containing and minute-level overlaps', () => {
    expect(
      doIntervalsOverlap({ startAt: at(10), endAt: at(11) }, { startAt: at(10, 59), endAt: at(12) }),
    ).toBe(true);
    expect(
      doIntervalsOverlap({ startAt: at(9), endAt: at(13) }, { startAt: at(10), endAt: at(11) }),
    ).toBe(true);
  });
});

describe('Calendar Block vs Calendar Block', () => {
  const existing = block({ id: 'existing', startAt: at(10), endAt: at(11) });
  const schedule = { calendarBlocks: [existing], appointments: [] };

  it('allows adjacent blocks', () => {
    expect(
      findCalendarBlockConflict(block({ id: 'next', startAt: at(11), endAt: at(12) }), schedule),
    ).toBeUndefined();
    expect(
      findCalendarBlockConflict(block({ id: 'previous', startAt: at(9), endAt: at(10) }), schedule),
    ).toBeUndefined();
  });

  it('refuses overlapping blocks of the same staff member', () => {
    expect(
      findCalendarBlockConflict(block({ id: 'new', startAt: at(10, 30), endAt: at(11, 30) }), schedule),
    ).toEqual({ type: 'CALENDAR_BLOCK', block: existing });
  });

  it('never conflicts with itself while being edited', () => {
    expect(
      findCalendarBlockConflict(block({ id: 'existing', startAt: at(10, 15), endAt: at(11, 45) }), schedule),
    ).toBeUndefined();
  });

  it('ignores another staff member', () => {
    expect(
      findCalendarBlockConflict(
        block({ id: 'new', staffMemberId: 'staff-b', startAt: at(10), endAt: at(11) }),
        schedule,
      ),
    ).toBeUndefined();
  });

  it('checks a candidate that has no id yet', () => {
    expect(
      findCalendarBlockConflict(
        { staffMemberId: 'staff-a', startAt: at(10, 30), endAt: at(10, 45) },
        schedule,
      )?.type,
    ).toBe('CALENDAR_BLOCK');
  });
});

describe('Calendar Block vs client Appointment', () => {
  it('refuses a block over a staff-required interval of the same staff member', () => {
    const booked = appointment();
    const conflict = findCalendarBlockConflict(block({ startAt: at(10, 30), endAt: at(11, 30) }), {
      calendarBlocks: [],
      appointments: [booked],
    });
    expect(conflict).toEqual({
      type: 'APPOINTMENT',
      appointment: booked,
      busyInterval: { startAt: at(10), endAt: at(11) },
    });
  });

  it('allows a block right after the Appointment ends', () => {
    expect(
      findCalendarBlockConflict(block({ startAt: at(11), endAt: at(12) }), {
        calendarBlocks: [],
        appointments: [appointment()],
      }),
    ).toBeUndefined();
  });

  it('does not conflict with another staff member', () => {
    expect(
      findCalendarBlockConflict(block({ staffMemberId: 'staff-b' }), {
        calendarBlocks: [],
        appointments: [appointment()],
      }),
    ).toBeUndefined();
  });

  it('allows a block during processing time: the professional is free', () => {
    // 10:00 application (staff) → 10:20–10:55 processing → 10:55–11:25 rinse (staff)
    const technique = appointment({
      items: [item(0, [[20, true], [35, false], [30, true]])],
    });
    const schedule = { calendarBlocks: [], appointments: [technique] };
    expect(
      findCalendarBlockConflict(block({ startAt: at(10, 20), endAt: at(10, 55) }), schedule),
    ).toBeUndefined();
    expect(
      findCalendarBlockConflict(block({ startAt: at(10, 15), endAt: at(10, 55) }), schedule)?.type,
    ).toBe('APPOINTMENT');
    expect(
      findCalendarBlockConflict(block({ startAt: at(10, 20), endAt: at(11) }), schedule),
    ).toMatchObject({ busyInterval: { startAt: at(10, 55), endAt: at(11, 25) } });
  });

  it.each(['CANCELLED', 'NO_SHOW'] as const)('ignores a %s Appointment', (status) => {
    expect(
      findCalendarBlockConflict(block(), {
        calendarBlocks: [],
        appointments: [appointment({ status })],
      }),
    ).toBeUndefined();
  });

  it.each(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] as const)(
    'counts a %s Appointment as occupying',
    (status) => {
      expect(
        findCalendarBlockConflict(block(), {
          calendarBlocks: [],
          appointments: [appointment({ status })],
        })?.type,
      ).toBe('APPOINTMENT');
    },
  );

  it('reports the block conflict before the Appointment one', () => {
    const existing = block({ id: 'existing' });
    expect(
      findCalendarBlockConflict(block({ id: 'new' }), {
        calendarBlocks: [existing],
        appointments: [appointment()],
      }),
    ).toEqual({ type: 'CALENDAR_BLOCK', block: existing });
  });
});

describe('client Appointment vs Calendar Block', () => {
  const lunch = block({ id: 'lunch', startAt: at(12), endAt: at(13), reason: 'Pause' });

  it('finds the block a staff-required interval would run into', () => {
    expect(
      findAppointmentCalendarBlockConflict(appointment({ startAt: at(11, 30) }), [lunch]),
    ).toBe(lunch);
  });

  it('accepts an Appointment that ends exactly when the block starts', () => {
    expect(
      findAppointmentCalendarBlockConflict(appointment({ startAt: at(11) }), [lunch]),
    ).toBeUndefined();
  });

  it('accepts an Appointment whose processing time alone crosses the block', () => {
    // 11:30 staff 30 min → 12:00–13:00 processing → 13:00 staff 15 min
    const technique = appointment({
      startAt: at(11, 30),
      items: [item(0, [[30, true], [60, false], [15, true]])],
    });
    expect(findAppointmentCalendarBlockConflict(technique, [lunch])).toBeUndefined();
  });

  it('never blocks another staff member', () => {
    expect(
      findAppointmentCalendarBlockConflict(
        appointment({ startAt: at(12), staffMemberId: 'staff-b' }),
        [lunch],
      ),
    ).toBeUndefined();
  });

  it('returns the earliest conflicting block', () => {
    const later = block({ id: 'later', startAt: at(12, 30), endAt: at(13) });
    const earlier = block({ id: 'earlier', startAt: at(12), endAt: at(12, 30) });
    expect(
      findAppointmentCalendarBlockConflict(appointment({ startAt: at(12) }), [later, earlier]),
    ).toBe(earlier);
  });
});

describe('Appointment staff busy intervals', () => {
  it('merges consecutive staff phases across items and splits on unattended time', () => {
    const multi = appointment({
      items: [
        item(1, [[15, true], [30, false], [10, true]]),
        item(0, [[20, true]]),
      ],
    });
    // order 0 first: 10:00–10:20, then item 1: 10:20–10:35 (merged), gap, 11:05–11:15
    expect(getAppointmentStaffBusyIntervals(multi)).toEqual([
      { startAt: at(10), endAt: at(10, 35) },
      { startAt: at(11, 5), endAt: at(11, 15) },
    ]);
  });

  it('gives zero-duration phases and released Appointments no interval', () => {
    expect(
      getAppointmentStaffBusyIntervals(appointment({ items: [item(0, [[0, true]])] })),
    ).toEqual([]);
    expect(getAppointmentStaffBusyIntervals(appointment({ status: 'CANCELLED' }))).toEqual([]);
  });
});

describe('changing an existing Appointment vs Calendar Blocks', () => {
  // 10:00 staff 20 → 10:20–10:55 unattended → 10:55–11:25 staff
  const technique = appointment({ items: [item(0, [[20, true], [35, false], [30, true]])] });
  const afterIt = block({ id: 'after', startAt: at(11, 25), endAt: at(12) });
  const overItsStart = block({ id: 'over-start', startAt: at(10), endAt: at(10, 10) });

  const withPhases = (phases: readonly (readonly [number, boolean])[]) =>
    appointment({ items: [item(0, phases)] });

  it('validates the candidate as soon as a staff-required interval moves', () => {
    const extended = withPhases([[20, true], [35, false], [35, true]]); // ends 11:30
    expect(findAppointmentChangeCalendarBlockConflict(technique, extended, [afterIt])).toBe(afterIt);
  });

  it('accepts a change that moves the intervals without reaching a block', () => {
    const reduced = withPhases([[20, true], [35, false], [25, true]]);
    const earlier = { ...technique, startAt: at(9) };
    expect(findAppointmentChangeCalendarBlockConflict(technique, reduced, [afterIt])).toBeUndefined();
    expect(findAppointmentChangeCalendarBlockConflict(technique, earlier, [afterIt])).toBeUndefined();
  });

  it('checks nothing when the occupied intervals are identical — a pre-existing overlap never holds an edit back', () => {
    const repriced = { ...technique, items: technique.items.map((entry) => ({ ...entry, price: 999 })) };
    const discounted = setAppointmentDiscount(technique, { type: 'PERCENT', percent: 20 });
    const otherClient = { ...technique, clientId: 'client-2' };

    for (const candidate of [repriced, discounted, otherClient]) {
      expect(areStaffBusyIntervalsEqual(
        getAppointmentStaffBusyIntervals(technique),
        getAppointmentStaffBusyIntervals(candidate),
      )).toBe(true);
      expect(findAppointmentChangeCalendarBlockConflict(technique, candidate, [overItsStart])).toBeUndefined();
    }
    // The same block DOES refuse a candidate whose intervals moved.
    expect(
      findAppointmentChangeCalendarBlockConflict(technique, withPhases([[25, true], [35, false], [30, true]]), [overItsStart]),
    ).toBe(overItsStart);
  });

  it('compares occupied intervals, not the start/end envelope', () => {
    // A trailing unattended phase gets longer: the Appointment ends later, the professional is not busier.
    const trailing = withPhases([[30, true], [20, false]]);
    const longerTrailing = withPhases([[30, true], [60, false]]);
    const inTheTail = block({ id: 'tail', startAt: at(10, 40), endAt: at(11, 20) });
    expect(findAppointmentChangeCalendarBlockConflict(trailing, longerTrailing, [inTheTail])).toBeUndefined();

    // Splitting one staff phase in two keeps the same merged interval.
    const split = withPhases([[10, true], [10, true], [35, false], [30, true]]);
    expect(findAppointmentChangeCalendarBlockConflict(technique, split, [overItsStart])).toBeUndefined();
  });

  it('keeps the processing gap free and other staff members out of it', () => {
    const inTheGap = block({ id: 'gap', startAt: at(10, 25), endAt: at(10, 50) });
    const longerGap = withPhases([[20, true], [40, false], [30, true]]);
    const longerApplication = withPhases([[30, true], [35, false], [30, true]]);

    expect(findAppointmentChangeCalendarBlockConflict(technique, longerGap, [inTheGap])).toBeUndefined();
    expect(findAppointmentChangeCalendarBlockConflict(technique, longerApplication, [inTheGap])).toBe(inTheGap);
    expect(
      findAppointmentChangeCalendarBlockConflict(technique, longerApplication, [{ ...inTheGap, staffMemberId: 'staff-b' }]),
    ).toBeUndefined();
  });

  it('treats a change of staff member as a schedule change for the new professional', () => {
    const reassigned = { ...technique, staffMemberId: 'staff-b' };
    const hers = block({ id: 'hers', staffMemberId: 'staff-b', startAt: at(10), endAt: at(10, 30) });
    expect(findAppointmentChangeCalendarBlockConflict(technique, reassigned, [hers])).toBe(hers);
  });
});

