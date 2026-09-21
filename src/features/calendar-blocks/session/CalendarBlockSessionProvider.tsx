import { createContext, useContext, useRef, useState, type PropsWithChildren } from 'react';

import {
  createCalendarBlock,
  findCalendarBlockConflict,
  type CalendarBlock,
  type CalendarBlockConflict,
} from '@/domain/calendar-blocks';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import {
  deleteCalendarBlock as removeCalendarBlock,
  insertCalendarBlock,
  updateCalendarBlock as persistCalendarBlock,
} from '@/persistence/stores/calendar-blocks';
import { usePersistence } from '@/providers/PersistenceProvider';

/** The interval is taken for that staff member. Nothing was written. */
export class CalendarBlockConflictError extends Error {
  constructor(readonly conflict: CalendarBlockConflict) {
    super(`Calendar Block conflicts with a ${conflict.type}`);
    this.name = 'CalendarBlockConflictError';
  }
}

export interface CalendarBlockSessionValue {
  readonly calendarBlocks: readonly CalendarBlock[];
  readonly getCalendarBlockById: (calendarBlockId: string | undefined) => CalendarBlock | undefined;
  /**
   * What would prevent saving this interval for this staff member — another
   * block, or a staff-required interval of a client Appointment — or
   * undefined. The editors show it inline BEFORE the save; the mutations
   * below verify it again.
   */
  readonly findConflict: (
    candidate: Pick<CalendarBlock, 'staffMemberId' | 'startAt' | 'endAt'> & { readonly id?: string },
  ) => CalendarBlockConflict | undefined;
  /**
   * Persists a NEW block. The domain validates it (end after start, meaningful
   * reason) and the schedule is re-checked; SQLite is written first and state
   * changes only after the commit. Throws `CalendarBlockInvalidError`,
   * `CalendarBlockConflictError`, or the database error — nothing changes then.
   */
  readonly addCalendarBlock: (calendarBlock: CalendarBlock) => void;
  /** Same discipline for an edit of the interval and the reason. */
  readonly updateCalendarBlock: (calendarBlock: CalendarBlock) => void;
  /** Permanent deletion (a remote tombstone under the sync layer). Nothing references a block. */
  readonly deleteCalendarBlock: (calendarBlockId: string) => void;
}

const CalendarBlockSessionContext = createContext<CalendarBlockSessionValue | null>(null);

/**
 * The Calendar Block session boundary, hydrated once from the persisted
 * snapshot. It is a SEPARATE session on purpose: the Appointment session is
 * what the Cash Register, the Client profile and every total read, and a
 * block must never be reachable from there. It reads the Appointment session
 * for one thing only — the schedule-conflict rule.
 */
export function CalendarBlockSessionProvider({ children }: PropsWithChildren) {
  const { database, snapshot } = usePersistence();
  const { appointments } = useAppointmentSession();
  const [calendarBlocks, setCalendarBlocks] = useState<readonly CalendarBlock[]>(
    snapshot.calendarBlocks,
  );
  const committed = useRef(snapshot.calendarBlocks);

  const commit = (next: readonly CalendarBlock[]) => {
    committed.current = next;
    setCalendarBlocks(next);
  };

  const scheduledAppointments = appointments.map(({ appointment }) => appointment);

  // Read during render by the editors: state, never the ref.
  const findConflict: CalendarBlockSessionValue['findConflict'] = (candidate) =>
    findCalendarBlockConflict(candidate, { calendarBlocks, appointments: scheduledAppointments });

  // Called by the mutations only: the committed collection is the authority.
  const assertFree = (calendarBlock: CalendarBlock) => {
    const conflict = findCalendarBlockConflict(calendarBlock, {
      calendarBlocks: committed.current,
      appointments: scheduledAppointments,
    });
    if (conflict) throw new CalendarBlockConflictError(conflict);
  };

  const getCalendarBlockById = (calendarBlockId: string | undefined) =>
    calendarBlockId === undefined
      ? undefined
      : calendarBlocks.find((calendarBlock) => calendarBlock.id === calendarBlockId);

  const addCalendarBlock = (calendarBlock: CalendarBlock) => {
    const valid = createCalendarBlock(calendarBlock);
    assertFree(valid);
    insertCalendarBlock(database, valid);
    commit([...committed.current, valid]);
  };

  const updateCalendarBlock = (calendarBlock: CalendarBlock) => {
    const current = committed.current.find((candidate) => candidate.id === calendarBlock.id);
    if (!current) throw new Error(`updateCalendarBlock: Calendar Block "${calendarBlock.id}" not found`);
    // Identity, Business and staff member never change through an edit.
    const valid = createCalendarBlock({
      ...current,
      startAt: calendarBlock.startAt,
      endAt: calendarBlock.endAt,
      reason: calendarBlock.reason,
    });
    assertFree(valid);
    persistCalendarBlock(database, valid);
    commit(committed.current.map((candidate) => (candidate.id === valid.id ? valid : candidate)));
  };

  const deleteCalendarBlock = (calendarBlockId: string) => {
    if (!committed.current.some((candidate) => candidate.id === calendarBlockId)) return;
    removeCalendarBlock(database, calendarBlockId);
    commit(committed.current.filter((candidate) => candidate.id !== calendarBlockId));
  };

  return (
    <CalendarBlockSessionContext.Provider
      value={{
        calendarBlocks,
        getCalendarBlockById,
        findConflict,
        addCalendarBlock,
        updateCalendarBlock,
        deleteCalendarBlock,
      }}
    >
      {children}
    </CalendarBlockSessionContext.Provider>
  );
}

export function useCalendarBlockSession(): CalendarBlockSessionValue {
  const value = useContext(CalendarBlockSessionContext);
  if (!value) {
    throw new Error('useCalendarBlockSession must be used inside CalendarBlockSessionProvider');
  }
  return value;
}
