import {
  canCancelAppointment,
  canCompleteAppointment,
  canMarkAppointmentNoShow,
  cancelAppointment,
  completeAppointment,
  finalizePastBusinessDays,
  markAppointmentNoShow,
  shouldAutoCompleteAppointment,
  type Appointment,
  type AppointmentItem,
} from '../index';

const snapshotItem: AppointmentItem = {
  id: 'item-1',
  serviceId: 'service-cut',
  order: 0,
  serviceName: 'Coupe',
  serviceType: 'SERVICE',
  price: 42,
  phases: [{ id: 'phase-1', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
};

function appointment(
  id: string,
  startAt: Date,
  status: Appointment['status'] = 'SCHEDULED',
): Appointment {
  return {
    id,
    businessId: 'business-a',
    clientId: 'client-a',
    staffMemberId: 'staff-a',
    startAt,
    status,
    items: [snapshotItem],
  };
}

const sameDayPast = new Date(2026, 7, 29, 11, 0);
const nowSameDayEvening = new Date(2026, 7, 29, 20, 0);
const nowNextDay = new Date(2026, 7, 30, 0, 5);
const future = new Date(2026, 7, 30, 14, 0);

describe('manual completion', () => {
  it('completes a same-day SCHEDULED appointment once its start time has passed', () => {
    const value = appointment('a', sameDayPast, 'SCHEDULED');

    const result = completeAppointment(value, nowSameDayEvening);

    expect(result.status).toBe('COMPLETED');
    expect(result.id).toBe('a');
    expect(result.items).toEqual([snapshotItem]);
  });

  it('completes CONFIRMED and IN_PROGRESS (compatibility)', () => {
    expect(completeAppointment(appointment('a', sameDayPast, 'CONFIRMED'), nowSameDayEvening).status).toBe('COMPLETED');
    expect(completeAppointment(appointment('a', sameDayPast, 'IN_PROGRESS'), nowSameDayEvening).status).toBe('COMPLETED');
  });

  it('rejects a future appointment', () => {
    const value = appointment('a', future, 'SCHEDULED');

    expect(canCompleteAppointment(value, nowSameDayEvening)).toBe(false);
    expect(completeAppointment(value, nowSameDayEvening)).toBe(value);
  });

  it('rejects terminal appointments', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const) {
      const value = appointment('a', sameDayPast, status);
      expect(canCompleteAppointment(value, nowSameDayEvening)).toBe(false);
      expect(completeAppointment(value, nowSameDayEvening)).toBe(value);
    }
  });

  it('never mutates the input appointment', () => {
    const value = appointment('a', sameDayPast, 'SCHEDULED');

    completeAppointment(value, nowSameDayEvening);

    expect(value.status).toBe('SCHEDULED');
  });
});

describe('cancellation', () => {
  it('cancels SCHEDULED and CONFIRMED with the CLIENT actor', () => {
    const result = cancelAppointment(appointment('a', future, 'SCHEDULED'), 'CLIENT', nowSameDayEvening);

    expect(result.status).toBe('CANCELLED');
    expect(result.cancellation).toEqual({ cancelledAt: nowSameDayEvening, cancelledBy: 'CLIENT' });
    expect('noShow' in result).toBe(false);
  });

  it('cancels with the BUSINESS actor and an optional trimmed reason', () => {
    const result = cancelAppointment(
      appointment('a', future, 'CONFIRMED'),
      'BUSINESS',
      nowSameDayEvening,
      '  Imprévu du salon  ',
    );

    expect(result.status).toBe('CANCELLED');
    expect(result.cancellation?.cancelledBy).toBe('BUSINESS');
    expect(result.cancellation?.cancelledAt).toEqual(nowSameDayEvening);
    expect(result.cancellation?.reason).toBe('Imprévu du salon');
  });

  it('drops a blank reason', () => {
    const result = cancelAppointment(appointment('a', future), 'CLIENT', nowSameDayEvening, '   ');

    expect(result.cancellation?.reason).toBeUndefined();
  });

  it('rejects terminal and IN_PROGRESS appointments', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'IN_PROGRESS'] as const) {
      const value = appointment('a', sameDayPast, status);
      expect(canCancelAppointment(value)).toBe(false);
      expect(cancelAppointment(value, 'CLIENT', nowSameDayEvening)).toBe(value);
    }
  });

  it('never mutates the input appointment', () => {
    const value = appointment('a', future);

    cancelAppointment(value, 'CLIENT', nowSameDayEvening);

    expect(value.status).toBe('SCHEDULED');
    expect(value.cancellation).toBeUndefined();
  });
});

describe('no-show', () => {
  it('marks a same-day started SCHEDULED / CONFIRMED appointment as no-show', () => {
    const scheduled = markAppointmentNoShow(appointment('a', sameDayPast, 'SCHEDULED'), nowSameDayEvening);
    const confirmed = markAppointmentNoShow(appointment('b', sameDayPast, 'CONFIRMED'), nowSameDayEvening);

    expect(scheduled.status).toBe('NO_SHOW');
    expect(scheduled.noShow).toEqual({ recordedAt: nowSameDayEvening });
    expect('cancellation' in scheduled).toBe(false);
    expect(confirmed.status).toBe('NO_SHOW');
  });

  it('rejects a future appointment', () => {
    const value = appointment('a', future);

    expect(canMarkAppointmentNoShow(value, nowSameDayEvening)).toBe(false);
    expect(markAppointmentNoShow(value, nowSameDayEvening)).toBe(value);
  });

  it('rejects terminal and IN_PROGRESS appointments', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'IN_PROGRESS'] as const) {
      const value = appointment('a', sameDayPast, status);
      expect(canMarkAppointmentNoShow(value, nowSameDayEvening)).toBe(false);
      expect(markAppointmentNoShow(value, nowSameDayEvening)).toBe(value);
    }
  });

  it('never mutates the input appointment', () => {
    const value = appointment('a', sameDayPast);

    markAppointmentNoShow(value, nowSameDayEvening);

    expect(value.status).toBe('SCHEDULED');
    expect(value.noShow).toBeUndefined();
  });
});

describe('automatic previous-local-day finalization', () => {
  it('A. keeps a same-day appointment SCHEDULED even after its start time', () => {
    const value = appointment('a', sameDayPast, 'SCHEDULED');

    expect(shouldAutoCompleteAppointment(value, nowSameDayEvening)).toBe(false);
    expect(finalizePastBusinessDays([value], nowSameDayEvening)[0]).toBe(value);
  });

  it('B. completes a previous-day SCHEDULED appointment', () => {
    const value = appointment('a', sameDayPast, 'SCHEDULED');
    const result = finalizePastBusinessDays([value], nowNextDay);

    expect(result[0].status).toBe('COMPLETED');
  });

  it('C/D. completes previous-day CONFIRMED and IN_PROGRESS', () => {
    const results = finalizePastBusinessDays(
      [
        appointment('a', sameDayPast, 'CONFIRMED'),
        appointment('b', sameDayPast, 'IN_PROGRESS'),
      ],
      nowNextDay,
    );

    expect(results.map(({ status }) => status)).toEqual(['COMPLETED', 'COMPLETED']);
  });

  it('E/F/G. leaves previous-day terminal appointments untouched', () => {
    const values = [
      appointment('a', sameDayPast, 'CANCELLED'),
      appointment('b', sameDayPast, 'NO_SHOW'),
      appointment('c', sameDayPast, 'COMPLETED'),
    ];

    expect(finalizePastBusinessDays(values, nowNextDay)).toBe(values);
  });

  it('H. leaves future appointments untouched', () => {
    const value = appointment('a', future, 'SCHEDULED');

    expect(finalizePastBusinessDays([value], nowNextDay)[0]).toBe(value);
  });

  it('I. leaves same-day past-time appointments untouched', () => {
    const value = appointment('a', sameDayPast, 'SCHEDULED');
    const values = [value];

    expect(finalizePastBusinessDays(values, nowSameDayEvening)).toBe(values);
  });

  it('J. is idempotent across repeated reconciliations', () => {
    const value = appointment('a', sameDayPast, 'SCHEDULED');

    const first = finalizePastBusinessDays([value], nowNextDay);
    const second = finalizePastBusinessDays(first, nowNextDay);

    expect(first[0].status).toBe('COMPLETED');
    expect(second[0]).toBe(first[0]);
    expect(second).toBe(first);
  });

  it('K. handles a month boundary', () => {
    const aug31 = new Date(2026, 7, 31, 16, 0);
    const sep1 = new Date(2026, 8, 1, 8, 0);
    const value = appointment('a', aug31, 'SCHEDULED');

    expect(finalizePastBusinessDays([value], sep1)[0].status).toBe('COMPLETED');
    expect(finalizePastBusinessDays([value], aug31)[0]).toBe(value);
  });

  it('L. handles a year boundary', () => {
    const dec31 = new Date(2026, 11, 31, 16, 0);
    const jan1 = new Date(2027, 0, 1, 8, 0);
    const value = appointment('a', dec31, 'SCHEDULED');

    expect(finalizePastBusinessDays([value], jan1)[0].status).toBe('COMPLETED');
    expect(finalizePastBusinessDays([value], dec31)[0]).toBe(value);
  });

  it('returns the same array reference when nothing changes', () => {
    const values = [
      appointment('a', future, 'SCHEDULED'),
      appointment('b', sameDayPast, 'COMPLETED'),
      appointment('c', sameDayPast, 'CANCELLED'),
    ];

    expect(finalizePastBusinessDays(values, nowSameDayEvening)).toBe(values);
  });
});
