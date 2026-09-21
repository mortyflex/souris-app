// Souris — Calendar Block session: SQLite first, state after the commit, and
// the schedule-conflict rule re-verified by the mutations themselves (the
// editors show it inline, the session is what refuses).

import { useEffect } from 'react';
import { act, render } from '@testing-library/react-native';

import { CalendarBlockInvalidError, type CalendarBlock } from '@/domain/calendar-blocks';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import { insertAppointment } from '@/persistence/stores/appointments';
import { loadCalendarBlocks } from '@/persistence/stores/calendar-blocks';
import { appointmentLea, clientLea, createTestSeed } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import {
  CalendarBlockConflictError,
  CalendarBlockSessionProvider,
  useCalendarBlockSession,
  type CalendarBlockSessionValue,
} from '../session/CalendarBlockSessionProvider';

const at = (hour: number, minute = 0) => new Date(2027, 2, 15, hour, minute);

const pause: CalendarBlock = {
  id: 'block-pause',
  businessId: 'business-test',
  staffMemberId: 'staff-amelie',
  startAt: at(12),
  endAt: at(13),
  reason: 'Pause',
};

function Probe({ onValue }: { readonly onValue: (value: CalendarBlockSessionValue) => void }) {
  const value = useCalendarBlockSession();
  // Braces matter: an effect must not return the callback's value as a cleanup.
  useEffect(() => {
    onValue(value);
  });
  return null;
}

async function renderSession() {
  const database = openTestDatabase();
  bootstrapPersistence(database, () => createTestSeed({ clients: [clientLea], appointments: [] }));
  // 10:00 — 20 min staff, 35 min unattended, 30 min staff: busy 10:00–10:20 and 10:55–11:25.
  insertAppointment(database, {
    ...appointmentLea,
    id: 'appointment-technique',
    startAt: at(10),
    items: [
      {
        ...appointmentLea.items[0]!,
        id: 'technique-item',
        order: 0,
        phases: [
          { id: 'p0', name: 'Application', durationMinutes: 20, requiresStaff: true },
          { id: 'p1', name: 'Temps de pose', durationMinutes: 35, requiresStaff: false },
          { id: 'p2', name: 'Rinçage', durationMinutes: 30, requiresStaff: true },
        ],
      },
    ],
  });
  const session: { current?: CalendarBlockSessionValue } = {};
  await render(
    <TestPersistenceProvider createSeed={() => createTestSeed()} database={database}>
      <AppointmentSessionProvider>
        <CalendarBlockSessionProvider>
          <Probe
            onValue={(value) => {
              session.current = value;
            }}
          />
        </CalendarBlockSessionProvider>
      </AppointmentSessionProvider>
    </TestPersistenceProvider>,
  );
  const run = async (task: (value: CalendarBlockSessionValue) => void) => {
    await act(async () => task(session.current!));
  };
  return { database, session, run };
}

describe('CalendarBlockSessionProvider', () => {
  it('hydrates from SQLite, then writes SQLite before it changes state', async () => {
    const { database, session, run } = await renderSession();
    expect(session.current?.calendarBlocks).toEqual([]);

    await run((value) => value.addCalendarBlock({ ...pause, reason: '  Pause ' }));

    expect(loadCalendarBlocks(database)).toEqual([pause]);
    expect(session.current?.calendarBlocks).toEqual([pause]);
    expect(session.current?.getCalendarBlockById(pause.id)).toEqual(pause);
  });

  it('refuses an invalid block: nothing written, state unchanged', async () => {
    const { database, session, run } = await renderSession();

    await run((value) => {
      expect(() => value.addCalendarBlock({ ...pause, endAt: pause.startAt })).toThrow(CalendarBlockInvalidError);
      expect(() => value.addCalendarBlock({ ...pause, reason: ' ' })).toThrow(CalendarBlockInvalidError);
    });

    expect(loadCalendarBlocks(database)).toEqual([]);
    expect(session.current?.calendarBlocks).toEqual([]);
  });

  it('refuses two overlapping blocks of one professional; adjacent ones and other staff are fine', async () => {
    const { database, run } = await renderSession();
    await run((value) => value.addCalendarBlock(pause));

    await run((value) => {
      expect(() => value.addCalendarBlock({ ...pause, id: 'overlap', startAt: at(12, 30), endAt: at(13, 30) })).toThrow(
        CalendarBlockConflictError,
      );
      value.addCalendarBlock({ ...pause, id: 'adjacent', startAt: at(13), endAt: at(14) });
    });
    await run((value) => value.addCalendarBlock({ ...pause, id: 'other-staff', staffMemberId: 'staff-other' }));

    expect(loadCalendarBlocks(database).map((block) => block.id)).toEqual(['block-pause', 'adjacent', 'other-staff']);
  });

  it('refuses a block over a staff-required phase, allows it during processing time', async () => {
    const { database, session, run } = await renderSession();

    await run((value) => {
      expect(() => value.addCalendarBlock({ ...pause, id: 'over-application', startAt: at(10, 10), endAt: at(10, 40) })).toThrow(
        CalendarBlockConflictError,
      );
      value.addCalendarBlock({ ...pause, id: 'during-processing', startAt: at(10, 20), endAt: at(10, 55) });
    });

    expect(loadCalendarBlocks(database).map((block) => block.id)).toEqual(['during-processing']);
    expect(
      session.current?.findConflict({ staffMemberId: 'staff-amelie', startAt: at(11), endAt: at(11, 10) }),
    ).toMatchObject({ type: 'APPOINTMENT', busyInterval: { startAt: at(10, 55), endAt: at(11, 25) } });
  });

  it('edits the interval and the reason only — never the identity — and never conflicts with itself', async () => {
    const { database, run } = await renderSession();
    await run((value) => value.addCalendarBlock(pause));

    await run((value) =>
      value.updateCalendarBlock({
        ...pause,
        businessId: 'hijacked',
        staffMemberId: 'hijacked',
        startAt: at(12, 15),
        endAt: at(13, 15),
        reason: 'Formation',
      }),
    );

    expect(loadCalendarBlocks(database)).toEqual([
      { ...pause, startAt: at(12, 15), endAt: at(13, 15), reason: 'Formation' },
    ]);
  });

  it('deletes permanently; deleting an unknown block is a no-op', async () => {
    const { database, session, run } = await renderSession();
    await run((value) => value.addCalendarBlock(pause));

    await run((value) => {
      value.deleteCalendarBlock('unknown');
      value.deleteCalendarBlock(pause.id);
    });

    expect(loadCalendarBlocks(database)).toEqual([]);
    expect(session.current?.calendarBlocks).toEqual([]);
  });
});
