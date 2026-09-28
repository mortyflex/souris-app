// Souris — Calendar Block store (docs/architecture/PERSISTENCE.md §7f)
//
// Round trip, edit, permanent deletion, restart, outbox marking, the domain
// guard in front of SQL — and isolation: a block never reaches an Appointment
// row, a Sale, the Cash Register or any Client derivation.

import { getAppointmentExpectedTotal } from '@/domain/appointments';
import { CalendarBlockInvalidError, type CalendarBlock } from '@/domain/calendar-blocks';
import { getCashRegisterDaySummary, getCashRegisterMonthSummary } from '@/domain/cash-register';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { clearPersistedDataForDevelopment } from '../development-reset';
import { checkoutAppointment } from '../stores/appointments';
import { bindLocalDatabaseToBusiness, listLocalBusinessIds } from '../stores/business-profile';
import {
  deleteCalendarBlock,
  insertCalendarBlock,
  loadCalendarBlocks,
  updateCalendarBlock,
} from '../stores/calendar-blocks';
import { countSyncOutboxRows, loadSyncOutbox } from '../sync/outbox';
import {
  appointmentLea,
  BUSINESS_ID,
  createTestSeed,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const pause: CalendarBlock = {
  id: 'block-pause',
  businessId: BUSINESS_ID,
  staffMemberId: 'staff-amelie',
  startAt: new Date('2026-09-21T10:10:00.000Z'),
  endAt: new Date('2026-09-21T11:25:00.000Z'),
  reason: 'Pause',
};

const travel: CalendarBlock = {
  ...pause,
  id: 'block-travel',
  startAt: new Date('2026-09-22T08:00:00.000Z'),
  endAt: new Date('2026-09-22T09:30:00.000Z'),
  reason: 'Déplacement',
};

function openSeeded() {
  const db = openTestDatabase();
  bootstrapPersistence(db, createTestSeed);
  return db;
}

describe('Calendar Block store', () => {
  it('persists a block and restores it, in creation order, as exact instants', () => {
    const db = openSeeded();
    insertCalendarBlock(db, pause);
    insertCalendarBlock(db, travel);

    expect(loadCalendarBlocks(db)).toEqual([pause, travel]);
    // A "restart": a fresh bootstrap of the same database.
    expect(bootstrapPersistence(db, createTestSeed).calendarBlocks).toEqual([pause, travel]);
  });

  it('persists an edit of the interval and the reason; identity never changes', () => {
    const db = openSeeded();
    insertCalendarBlock(db, pause);

    updateCalendarBlock(db, {
      ...pause,
      businessId: 'ignored',
      staffMemberId: 'ignored',
      startAt: new Date('2026-09-21T12:00:00.000Z'),
      endAt: new Date('2026-09-21T13:00:00.000Z'),
      reason: '  Rendez-vous médical ',
    });

    expect(loadSnapshot(db).calendarBlocks).toEqual([
      {
        ...pause,
        startAt: new Date('2026-09-21T12:00:00.000Z'),
        endAt: new Date('2026-09-21T13:00:00.000Z'),
        reason: 'Rendez-vous médical',
      },
    ]);
  });

  it('refuses to edit a block that does not exist', () => {
    const db = openSeeded();
    expect(() => updateCalendarBlock(db, pause)).toThrow(/not found/);
  });

  it('deletes permanently, and the deletion survives a restart', () => {
    const db = openSeeded();
    insertCalendarBlock(db, pause);
    insertCalendarBlock(db, travel);

    deleteCalendarBlock(db, pause.id);

    expect(bootstrapPersistence(db, createTestSeed).calendarBlocks).toEqual([travel]);
  });

  it('refuses an invalid block before any SQL runs', () => {
    const db = openSeeded();

    expect(() => insertCalendarBlock(db, { ...pause, endAt: pause.startAt })).toThrow(
      CalendarBlockInvalidError,
    );
    expect(() => insertCalendarBlock(db, { ...pause, reason: '   ' })).toThrow(
      CalendarBlockInvalidError,
    );
    insertCalendarBlock(db, pause);
    expect(() => updateCalendarBlock(db, { ...pause, reason: '' })).toThrow(CalendarBlockInvalidError);
    expect(loadCalendarBlocks(db)).toEqual([pause]);
  });

  it('never stores an empty reason and normalizes the stored text', () => {
    const db = openSeeded();
    insertCalendarBlock(db, { ...pause, reason: '  Chercher \n les enfants ' });

    expect(db.getAllSync('SELECT reason FROM calendar_blocks')).toEqual([
      { reason: 'Chercher les enfants' },
    ]);
  });
});

describe('Calendar Block store — sync outbox', () => {
  function openBound() {
    const db = openSeeded();
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    return db;
  }
  const bound = (block: CalendarBlock) => ({ ...block, businessId: REMOTE_BUSINESS_ID });

  it('marks create, edit and delete on ONE coalesced CALENDAR_BLOCK entry', () => {
    const db = openBound();

    insertCalendarBlock(db, bound(pause));
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID)).toEqual([
      expect.objectContaining({ aggregateType: 'CALENDAR_BLOCK', aggregateId: pause.id, operation: 'UPSERT', revision: 1 }),
    ]);

    updateCalendarBlock(db, { ...bound(pause), reason: 'Formation' });
    deleteCalendarBlock(db, pause.id);

    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID)).toEqual([
      expect.objectContaining({ aggregateType: 'CALENDAR_BLOCK', aggregateId: pause.id, operation: 'DELETE', revision: 3 }),
    ]);
    expect(loadCalendarBlocks(db)).toEqual([]);
  });

  it('writes no entry for a refused block or a missing one, and none while unbound', () => {
    const db = openBound();
    expect(() => insertCalendarBlock(db, { ...bound(pause), reason: '' })).toThrow();
    deleteCalendarBlock(db, 'never-existed');
    expect(countSyncOutboxRows(db)).toBe(0);

    const unbound = openSeeded();
    insertCalendarBlock(unbound, pause);
    expect(countSyncOutboxRows(unbound)).toBe(0);
  });

  it('follows the account binding like every business-scoped table', () => {
    const db = openSeeded();
    insertCalendarBlock(db, pause);

    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);

    expect(listLocalBusinessIds(db)).toEqual([REMOTE_BUSINESS_ID]);
    expect(loadCalendarBlocks(db)[0]?.businessId).toBe(REMOTE_BUSINESS_ID);
  });

  it('is cleared by the development reset with the other operational tables', () => {
    const db = openBound();
    insertCalendarBlock(db, bound(pause));

    clearPersistedDataForDevelopment(db);

    expect(loadCalendarBlocks(db)).toEqual([]);
    expect(countSyncOutboxRows(db)).toBe(0);
  });
});

describe('Calendar Block store — financial and client isolation', () => {
  it('leaves every Appointment, item, phase, Sale and Client row unchanged', () => {
    const db = openSeeded();
    const tables = ['clients', 'appointments', 'appointment_items', 'appointment_phases', 'sales', 'sale_items', 'products', 'services'];
    const dump = () => Object.fromEntries(tables.map((table) => [table, db.getAllSync(`SELECT * FROM ${table} ORDER BY rowid`)]));
    const before = dump();

    insertCalendarBlock(db, pause);
    updateCalendarBlock(db, { ...pause, reason: 'Administratif' });
    insertCalendarBlock(db, travel);
    deleteCalendarBlock(db, travel.id);

    expect(dump()).toEqual(before);
  });

  it('changes no expected total and no Cash Register figure, day or month', () => {
    const db = openSeeded();
    const paidAt = new Date('2026-09-21T10:45:00.000Z');
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 9000, cashAmountCents: 4500 });
    const figures = () => {
      const { appointments, sales } = loadSnapshot(db);
      return {
        expected: appointments.map((appointment) => getAppointmentExpectedTotal(appointment, sales)),
        day: getCashRegisterDaySummary({ appointments, sales }, paidAt),
        month: getCashRegisterMonthSummary({ appointments, sales }, paidAt),
      };
    };
    const before = figures();

    // Same staff member, same day, same hours as the paid Appointment.
    insertCalendarBlock(db, { ...pause, startAt: new Date('2026-09-21T10:00:00.000Z'), endAt: paidAt });

    expect(figures()).toEqual(before);
    expect(before.day.checkoutCount).toBe(1);
  });

  it('has no column a price, a payment, a client or a status could live in', () => {
    const db = openSeeded();
    const columns = db
      .getAllSync<{ name: string }>('PRAGMA table_info(calendar_blocks)')
      .map((column) => column.name);

    expect(columns).toEqual(['id', 'business_id', 'staff_member_id', 'start_at', 'end_at', 'reason']);
    for (const forbidden of ['client', 'price', 'cents', 'paid', 'discount', 'status', 'service']) {
      expect(columns.some((name) => name.includes(forbidden))).toBe(false);
    }
  });
});
