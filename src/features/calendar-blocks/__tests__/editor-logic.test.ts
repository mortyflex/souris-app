// Souris — Calendar Block editor: times, reason shortcuts and wording (pure)

import type { CalendarBlock } from '@/domain/calendar-blocks';

import {
  BLOCK_MINUTE_STEP,
  blockHourRange,
  createInitialBlockTimes,
  DEFAULT_BLOCK_DURATION_MINUTES,
  isBlockIntervalValid,
  setBlockEndTime,
  setBlockStartTime,
} from '../editor/block-times';
import {
  EMPTY_REASON_DRAFT,
  OTHER_REASON_LABEL,
  REASON_CHIPS,
  resolveReason,
  toReasonDraft,
} from '../editor/reason-suggestions';
import {
  describeCalendarBlockConflict,
  describeCalendarBlockInTheWay,
  formatBlockDate,
  formatBlockTimeRange,
  formatSpokenBlockTime,
  getCalendarBlockAccessibilityLabel,
} from '../presentation';

const at = (hour: number, minute = 0) => new Date(2026, 8, 21, hour, minute);
const hm = (date: Date) => `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;

describe('block times', () => {
  it('inherits the Agenda start and proposes an end 30 minutes later, on the same local day', () => {
    const times = createInitialBlockTimes(at(14, 30));

    expect(DEFAULT_BLOCK_DURATION_MINUTES).toBe(30);
    expect([hm(times.startAt), hm(times.endAt)]).toEqual(['14:30', '15:00']);
    expect(times.endAt.getDate()).toBe(21);
    expect(isBlockIntervalValid(times)).toBe(true);
  });

  it('uses the same 5-minute step and the same first hour as an Appointment start', () => {
    expect(BLOCK_MINUTE_STEP).toBe(5);
    expect(blockHourRange).toEqual({ minHour: 8, maxHour: 23 });
  });

  it('keeps a valid interval inside the day even from the last offered start', () => {
    const late = createInitialBlockTimes(at(23, 55));
    expect([hm(late.startAt), hm(late.endAt)]).toEqual(['23:50', '23:55']);
    expect(isBlockIntervalValid(late)).toBe(true);

    const early = createInitialBlockTimes(at(6, 0));
    expect(hm(early.startAt)).toBe('8:00');
  });

  it('moving the start keeps the chosen duration', () => {
    const times = setBlockEndTime(createInitialBlockTimes(at(10)), { hour: 11, minute: 30 });
    const moved = setBlockStartTime(times, { hour: 14, minute: 10 });

    expect([hm(moved.startAt), hm(moved.endAt)]).toEqual(['14:10', '15:40']);
  });

  it('never pushes the end past the selected day when the start moves late', () => {
    const times = setBlockEndTime(createInitialBlockTimes(at(10)), { hour: 12, minute: 0 });
    const moved = setBlockStartTime(times, { hour: 23, minute: 0 });

    expect([hm(moved.startAt), hm(moved.endAt)]).toEqual(['23:00', '23:55']);
    expect(moved.endAt.getDate()).toBe(21);
  });

  it('moving the end never moves the start; an end not after the start is invalid, not "fixed"', () => {
    const times = createInitialBlockTimes(at(10));

    const equal = setBlockEndTime(times, { hour: 10, minute: 0 });
    const before = setBlockEndTime(times, { hour: 9, minute: 0 });

    expect(hm(equal.startAt)).toBe('10:00');
    expect(isBlockIntervalValid(equal)).toBe(false);
    expect(isBlockIntervalValid(before)).toBe(false);
    expect(isBlockIntervalValid(setBlockEndTime(times, { hour: 10, minute: 5 }))).toBe(true);
  });

  it('recovers a sensible duration when the start moves while the interval was invalid', () => {
    const invalid = setBlockEndTime(createInitialBlockTimes(at(10)), { hour: 9, minute: 0 });
    const moved = setBlockStartTime(invalid, { hour: 11, minute: 0 });

    expect([hm(moved.startAt), hm(moved.endAt)]).toEqual(['11:00', '11:30']);
  });

  it('keeps an exact minute-level interval such as 10:10 → 11:25', () => {
    const times = setBlockEndTime(
      setBlockStartTime(createInitialBlockTimes(at(10)), { hour: 10, minute: 10 }),
      { hour: 11, minute: 25 },
    );
    expect((times.endAt.getTime() - times.startAt.getTime()) / 60_000).toBe(75);
  });
});

describe('reason shortcuts', () => {
  it('offers the six quick chips, « Autre » last', () => {
    expect(REASON_CHIPS).toEqual(['Pause', 'Personnel', 'Déplacement', 'Administratif', 'Formation', 'Autre']);
  });

  it('a suggestion IS the reason, as plain text', () => {
    expect(resolveReason({ chip: 'Déplacement', customText: '' })).toBe('Déplacement');
    // Text typed earlier behind « Autre » never leaks into a suggestion.
    expect(resolveReason({ chip: 'Pause', customText: 'Dentiste' })).toBe('Pause');
  });

  it('« Autre » is not a reason: the typed text is, normalized', () => {
    expect(resolveReason({ chip: OTHER_REASON_LABEL, customText: '  Rendez-vous   médical ' })).toBe(
      'Rendez-vous médical',
    );
    expect(resolveReason({ chip: OTHER_REASON_LABEL, customText: '   ' })).toBeUndefined();
  });

  it('nothing chosen is no reason — never an empty string', () => {
    expect(resolveReason(EMPTY_REASON_DRAFT)).toBeUndefined();
  });

  it('reopens a saved reason on its chip, or behind « Autre » when it is custom', () => {
    expect(toReasonDraft('Formation')).toEqual({ chip: 'Formation', customText: '' });
    expect(toReasonDraft('Chercher les enfants')).toEqual({
      chip: OTHER_REASON_LABEL,
      customText: 'Chercher les enfants',
    });
    expect(toReasonDraft(undefined)).toEqual(EMPTY_REASON_DRAFT);
    expect(resolveReason(toReasonDraft('Chercher les enfants'))).toBe('Chercher les enfants');
  });
});

describe('wording', () => {
  const block: CalendarBlock = {
    id: 'b',
    businessId: 'business',
    staffMemberId: 'staff',
    startAt: at(10),
    endAt: at(11, 30),
    reason: 'Déplacement',
  };

  it('formats the date, the range and the spoken label', () => {
    expect(formatBlockDate(block.startAt)).toBe('Lundi 21 sept.');
    expect(formatBlockTimeRange(block)).toBe('10:00 – 11:30');
    expect(formatSpokenBlockTime(at(1, 5))).toBe('1 heure 05');
    expect(getCalendarBlockAccessibilityLabel(block)).toBe(
      'Indisponible, Déplacement, de 10 heures à 11 heures 30',
    );
  });

  it('explains a block in the way of an Appointment, with its reason', () => {
    expect(describeCalendarBlockInTheWay(block)).toEqual({
      message: 'Ce créneau est marqué comme indisponible de 10:00 à 11:30.',
      detail: 'Indisponible — Déplacement',
    });
  });

  it('explains what prevents saving a block', () => {
    expect(describeCalendarBlockConflict({ type: 'CALENDAR_BLOCK', block }).message).toBe(
      'Ce créneau est marqué comme indisponible de 10:00 à 11:30.',
    );
    expect(
      describeCalendarBlockConflict({
        type: 'APPOINTMENT',
        appointment: {
          id: 'a',
          businessId: 'business',
          clientId: 'client',
          staffMemberId: 'staff',
          startAt: at(10),
          status: 'SCHEDULED',
          items: [],
        },
        busyInterval: { startAt: at(10), endAt: at(10, 45) },
      }),
    ).toEqual({
      message: 'Un rendez-vous est déjà prévu sur ce créneau.',
      detail: 'Rendez-vous de 10:00 à 10:45',
    });
  });
});
