// BeautIzzy — a NEW Appointment saved with a deposit already received
// (`insertAppointmentWithDeposit`, docs/domain/APPOINTMENTS.md §25d).
//
// ONE transaction: the Appointment rows, then THE deposit write against the
// rows just inserted. A refused deposit leaves NO Appointment, no item, no
// phase, no deposit and no outbox entry — never an Appointment without its
// requested deposit, never an orphan deposit, never a deposit recorded twice.

import type { Appointment, AppointmentDeposit } from '@/domain/appointments';
import { getAppointmentRemainingAmount, isAppointmentSettled, getAppointmentDepositPosition } from '@/domain/appointments';
import { getCashRegisterDaySummary } from '@/domain/cash-register';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import {
  AppointmentDepositConflictError,
  loadAppointmentDeposits,
  readAppointmentDepositPosition,
} from '../stores/appointment-deposits';
import {
  AppointmentCheckoutAmountError,
  checkoutAppointment,
  insertAppointmentWithDeposit,
  loadAppointments,
} from '../stores/appointments';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { loadSyncOutbox } from '../sync/outbox';
import {
  appointmentLea,
  BUSINESS_ID,
  createTestSeed,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

type Db = ReturnType<typeof openTestDatabase>;

const NEW_ID = 'appointment-created';
const RECORDED_AT = new Date(2026, 8, 5, 9, 0);

/** 95 € + 40 € = 135,00 € expected, SCHEDULED, a week after Léa's. */
const created: Appointment = {
  ...appointmentLea,
  id: NEW_ID,
  startAt: new Date(2026, 8, 18, 9, 30),
  notes: undefined,
  items: appointmentLea.items.map((item, index) => ({
    ...item,
    id: `${NEW_ID}-item-${index}`,
    phases: item.phases.map((phase) => ({ ...phase, id: `${NEW_ID}-${phase.id}` })),
  })),
};

function deposit(overrides: Partial<AppointmentDeposit> = {}): AppointmentDeposit {
  return {
    id: 'deposit-created',
    businessId: BUSINESS_ID,
    appointmentId: NEW_ID,
    amountCents: 3000,
    paymentMethod: 'CARD',
    paidAt: RECORDED_AT,
    status: 'ACTIVE',
    createdAt: RECORDED_AT,
    ...overrides,
  };
}

function openDatabase(): Db {
  const db = openTestDatabase();
  bootstrapPersistence(db, createTestSeed);
  return db;
}

function dumpAll(db: Db) {
  return {
    appointments: db.getAllSync('SELECT * FROM appointments ORDER BY rowid'),
    items: db.getAllSync('SELECT * FROM appointment_items ORDER BY rowid'),
    phases: db.getAllSync('SELECT * FROM appointment_phases ORDER BY rowid'),
    deposits: db.getAllSync('SELECT * FROM appointment_deposits ORDER BY rowid'),
    outbox: db.getAllSync('SELECT * FROM sync_outbox ORDER BY id'),
  };
}

const storedAppointment = (db: Db) => loadAppointments(db).find((row) => row.id === NEW_ID);
const storedDeposits = (db: Db) => loadAppointmentDeposits(db).filter((row) => row.appointmentId === NEW_ID);

describe('insertAppointmentWithDeposit', () => {
  it('saves the Appointment, its snapshots and the deposit together, and marks both aggregates', () => {
    // Bound to a synchronizing Business, so every write records its sync intent.
    const db = openDatabase();
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    const stamped = { ...created, businessId: REMOTE_BUSINESS_ID };

    insertAppointmentWithDeposit(db, stamped, deposit({ businessId: REMOTE_BUSINESS_ID }));

    expect(storedAppointment(db)).toEqual(stamped);
    expect(storedDeposits(db)).toEqual([deposit({ businessId: REMOTE_BUSINESS_ID })]);
    expect(readAppointmentDepositPosition(db, NEW_ID)).toEqual({
      status: 'SCHEDULED',
      expectedTotalCents: 13_500,
      activeDepositTotalCents: 3000,
      remainingCents: 10_500,
    });
    expect(
      loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => `${entry.aggregateType}/${entry.aggregateId}`),
    ).toEqual(expect.arrayContaining(['APPOINTMENT/appointment-created', 'APPOINTMENT_DEPOSIT/deposit-created']));
  });

  it('a reload (app restart) reads the same Appointment and the same deposit', () => {
    const db = openDatabase();
    insertAppointmentWithDeposit(db, created, deposit({ paymentMethod: 'CASH', amountCents: 13_500 }));

    const snapshot = loadSnapshot(db);
    const reloaded = snapshot.appointments.find((row) => row.id === NEW_ID);
    expect(reloaded).toEqual(created);
    expect(snapshot.appointmentDeposits.filter((row) => row.appointmentId === NEW_ID)).toEqual([
      deposit({ paymentMethod: 'CASH', amountCents: 13_500 }),
    ]);
    // Fully prepaid at creation: nothing left, yet not settled until completed.
    expect(getAppointmentRemainingAmount(reloaded as Appointment, snapshot.sales, snapshot.appointmentDeposits)).toBe(0);
    expect(
      isAppointmentSettled(
        reloaded as Appointment,
        getAppointmentDepositPosition(reloaded as Appointment, snapshot.sales, snapshot.appointmentDeposits),
      ),
    ).toBe(false);
  });

  it('a deposit above the expected total rolls EVERYTHING back: no Appointment, no snapshot, no deposit, no outbox entry', () => {
    const db = openDatabase();
    const before = dumpAll(db);

    expect(() => insertAppointmentWithDeposit(db, created, deposit({ amountCents: 13_501 }))).toThrow(
      AppointmentDepositConflictError,
    );

    expect(dumpAll(db)).toEqual(before);
    expect(storedAppointment(db)).toBeUndefined();
  });

  it('a deposit of zero or fractional cents is refused by the domain before any write', () => {
    const db = openDatabase();
    const before = dumpAll(db);

    expect(() => insertAppointmentWithDeposit(db, created, deposit({ amountCents: 0 }))).toThrow();
    expect(() => insertAppointmentWithDeposit(db, created, deposit({ amountCents: 10.5 }))).toThrow();
    expect(() => insertAppointmentWithDeposit(db, created, deposit({ amountCents: -100 }))).toThrow();

    expect(dumpAll(db)).toEqual(before);
  });

  it('a previous-day Appointment finalized COMPLETED cannot be created with a deposit: nothing is written', () => {
    const db = openDatabase();
    const before = dumpAll(db);

    expect(() =>
      insertAppointmentWithDeposit(db, { ...created, status: 'COMPLETED' }, deposit()),
    ).toThrow(expect.objectContaining({ reason: 'APPOINTMENT_NOT_OPEN' }));

    expect(dumpAll(db)).toEqual(before);
  });

  it('the deposit must name the Appointment being created', () => {
    const db = openDatabase();
    const before = dumpAll(db);

    expect(() =>
      insertAppointmentWithDeposit(db, created, deposit({ appointmentId: appointmentLea.id })),
    ).toThrow(/names Appointment/);

    expect(dumpAll(db)).toEqual(before);
    // The existing Appointment gained no deposit either.
    expect(loadAppointmentDeposits(db)).toEqual([]);
  });

  it('a repeated save of the same deposit id is refused whole: the second Appointment is not created either', () => {
    const db = openDatabase();
    insertAppointmentWithDeposit(db, created, deposit());
    const after = dumpAll(db);

    const again: Appointment = { ...created, id: 'appointment-created-again', items: [] };
    expect(() =>
      insertAppointmentWithDeposit(db, again, deposit({ appointmentId: again.id })),
    ).toThrow(expect.objectContaining({ reason: 'DUPLICATE_DEPOSIT' }));

    expect(dumpAll(db)).toEqual(after);
    expect(loadAppointments(db).some((row) => row.id === again.id)).toBe(false);
  });

  it('the Cash Register counts the deposit once, on the day it was recorded, by its method', () => {
    const db = openDatabase();
    insertAppointmentWithDeposit(db, created, deposit({ paymentMethod: 'CASH' }));
    const snapshot = loadSnapshot(db);
    const sources = { appointments: snapshot.appointments, sales: snapshot.sales, deposits: snapshot.appointmentDeposits };

    expect(getCashRegisterDaySummary(sources, RECORDED_AT)).toEqual({
      totalCents: 3000,
      cardCents: 0,
      cashCents: 3000,
      checkoutCount: 1,
    });
    // Nothing on the Appointment day: the deposit is not counted again there.
    expect(getCashRegisterDaySummary(sources, created.startAt).totalCents).toBe(0);
  });

  it('the later checkout settles ONLY the remaining 105 €: the deposit is never counted twice', () => {
    const db = openDatabase();
    insertAppointmentWithDeposit(db, created, deposit());
    const paidAt = new Date(2026, 8, 18, 10, 30);

    // The whole total is refused: 30 € were already received.
    expect(() =>
      checkoutAppointment(db, NEW_ID, { paidAt, cardAmountCents: 13_500, cashAmountCents: 0 }),
    ).toThrow(AppointmentCheckoutAmountError);
    checkoutAppointment(db, NEW_ID, { paidAt, cardAmountCents: 10_500, cashAmountCents: 0 });

    const snapshot = loadSnapshot(db);
    const sources = { appointments: snapshot.appointments, sales: snapshot.sales, deposits: snapshot.appointmentDeposits };
    expect(storedAppointment(db)).toMatchObject({ status: 'COMPLETED', payment: { cardAmountCents: 10_500, cashAmountCents: 0 } });
    expect(getCashRegisterDaySummary(sources, RECORDED_AT).totalCents).toBe(3000);
    expect(getCashRegisterDaySummary(sources, paidAt).totalCents).toBe(10_500);
  });

  it('a deposit stamped with another Business than its Appointment is never written', () => {
    const db = openDatabase();
    const before = dumpAll(db);

    // The remote composite foreign key refuses it; the store refuses it first,
    // so one creation never stamps two Businesses.
    expect(() =>
      insertAppointmentWithDeposit(db, created, deposit({ businessId: 'another-business' })),
    ).toThrow(/another Business/);

    expect(dumpAll(db)).toEqual(before);
  });
});
