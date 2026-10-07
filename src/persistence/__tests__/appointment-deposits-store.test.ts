// BeautIzzy — Appointment deposits persistence (schema v12, docs/domain/APPOINTMENTS.md §25d)
//
// The stored rows are the authority: a deposit is re-validated against the
// stored Appointment inside its transaction, and every write that can lower
// the expected total re-verifies ACTIVE DEPOSITS <= EXPECTED TOTAL before it
// commits — a refused write leaves every row exactly as it was.

import type { Appointment, AppointmentDeposit } from '@/domain/appointments';
import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import {
  AppointmentDepositConflictError,
  AppointmentDepositShortfallError,
  countAppointmentDeposits,
  insertAppointmentDeposit,
  loadAppointmentDeposits,
  readAppointmentDepositPosition,
  voidAppointmentDeposit,
} from '../stores/appointment-deposits';
import {
  AppointmentCheckoutConflictError,
  AppointmentDeleteConflictError,
  checkoutAppointment,
  completePrepaidAppointment,
  countAppointmentReferences,
  deleteAppointment,
  removeAppointmentItem,
  updateAppointment,
  updateAppointmentDiscount,
} from '../stores/appointments';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { completeSale, deleteAppointmentProduct } from '../stores/sales';
import { loadSyncOutbox } from '../sync/outbox';
import {
  appointmentLea,
  BUSINESS_ID,
  createTestSeed,
  productMask,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

type Db = ReturnType<typeof openTestDatabase>;

const PAID_AT = new Date('2026-09-05T09:00:00.000Z');

function deposit(overrides: Partial<AppointmentDeposit> = {}): AppointmentDeposit {
  return {
    id: 'deposit-1',
    businessId: BUSINESS_ID,
    appointmentId: appointmentLea.id,
    amountCents: 3000,
    paymentMethod: 'CARD',
    paidAt: PAID_AT,
    status: 'ACTIVE',
    createdAt: PAID_AT,
    ...overrides,
  };
}

/** appointmentLea: 95 € + 40 € = 135,00 € expected, SCHEDULED. */
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
    sales: db.getAllSync('SELECT * FROM sales ORDER BY rowid'),
    saleItems: db.getAllSync('SELECT * FROM sale_items ORDER BY rowid'),
    products: db.getAllSync('SELECT * FROM products ORDER BY rowid'),
    deposits: db.getAllSync('SELECT * FROM appointment_deposits ORDER BY rowid'),
    outbox: db.getAllSync('SELECT * FROM sync_outbox ORDER BY id'),
  };
}

function linkedMaskSale(id = 'sale-linked'): Sale {
  return {
    id,
    businessId: BUSINESS_ID,
    clientId: appointmentLea.clientId,
    appointmentId: appointmentLea.id,
    completedAt: new Date('2026-09-11T08:00:00.000Z'),
    items: [{ id: `${id}-item-0`, productId: productMask.id, productName: productMask.name, unitPrice: 50, quantity: 1 }],
  };
}

describe('Appointment deposit store — create and void', () => {
  it('persists a deposit with its exact cents and reloads it identically', () => {
    const db = openDatabase();

    insertAppointmentDeposit(db, deposit());

    expect(loadAppointmentDeposits(db)).toEqual([deposit()]);
    expect(loadSnapshot(db).appointmentDeposits).toEqual([deposit()]);
    expect(db.getFirstSync('SELECT amount_cents, payment_method, status, voided_at FROM appointment_deposits')).toEqual({
      amount_cents: 3000,
      payment_method: 'CARD',
      status: 'ACTIVE',
      voided_at: null,
    });
  });

  it('stores several deposits on one Appointment and derives the position from them', () => {
    const db = openDatabase();
    insertAppointmentDeposit(db, deposit({ id: 'd1', amountCents: 3000 }));
    insertAppointmentDeposit(db, deposit({ id: 'd2', amountCents: 2000, paymentMethod: 'CASH' }));

    expect(readAppointmentDepositPosition(db, appointmentLea.id)).toEqual({
      status: 'SCHEDULED',
      expectedTotalCents: 13500,
      activeDepositTotalCents: 5000,
      remainingCents: 8500,
    });
    expect(countAppointmentDeposits(db, appointmentLea.id)).toBe(2);
  });

  it('accepts exactly the remaining amount and refuses one cent more', () => {
    const db = openDatabase();
    insertAppointmentDeposit(db, deposit({ id: 'd1', amountCents: 13000 }));

    expect(() => insertAppointmentDeposit(db, deposit({ id: 'd2', amountCents: 501 }))).toThrow(
      expect.objectContaining({ reason: 'EXCEEDS_REMAINING' }),
    );
    insertAppointmentDeposit(db, deposit({ id: 'd3', amountCents: 500 }));
    expect(readAppointmentDepositPosition(db, appointmentLea.id)?.remainingCents).toBe(0);
  });

  it('refuses zero and negative amounts before any SQL', () => {
    const db = openDatabase();
    expect(() => insertAppointmentDeposit(db, deposit({ amountCents: 0 }))).toThrow(RangeError);
    expect(() => insertAppointmentDeposit(db, deposit({ amountCents: -100 }))).toThrow(RangeError);
    expect(loadAppointmentDeposits(db)).toEqual([]);
  });

  it.each(['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)('refuses a deposit on a %s Appointment', (status) => {
    const db = openDatabase();
    db.runSync('UPDATE appointments SET status = ? WHERE id = ?', [status, appointmentLea.id]);

    expect(() => insertAppointmentDeposit(db, deposit())).toThrow(
      expect.objectContaining({ reason: 'APPOINTMENT_NOT_OPEN' }),
    );
    expect(loadAppointmentDeposits(db)).toEqual([]);
  });

  it('refuses a deposit for an unknown Appointment', () => {
    const db = openDatabase();
    expect(() => insertAppointmentDeposit(db, deposit({ appointmentId: 'missing' }))).toThrow(
      expect.objectContaining({ reason: 'APPOINTMENT_NOT_FOUND' }),
    );
  });

  it('never records the same deposit twice (double submission)', () => {
    const db = openDatabase();
    insertAppointmentDeposit(db, deposit());

    expect(() => insertAppointmentDeposit(db, deposit())).toThrow(AppointmentDepositConflictError);
    expect(loadAppointmentDeposits(db)).toHaveLength(1);
  });

  it('voids an ACTIVE deposit: status + voided_at only, amount and paid_at kept', () => {
    const db = openDatabase();
    insertAppointmentDeposit(db, deposit());
    const voidedAt = new Date('2026-09-06T10:00:00.000Z');

    voidAppointmentDeposit(db, 'deposit-1', voidedAt);

    expect(loadAppointmentDeposits(db)).toEqual([{ ...deposit(), status: 'VOIDED', voidedAt }]);
    expect(readAppointmentDepositPosition(db, appointmentLea.id)?.activeDepositTotalCents).toBe(0);
    expect(() => voidAppointmentDeposit(db, 'deposit-1', voidedAt)).toThrow(
      expect.objectContaining({ reason: 'DEPOSIT_NOT_ACTIVE' }),
    );
  });

  it('refuses to void a deposit once the Appointment is COMPLETED', () => {
    const db = openDatabase();
    insertAppointmentDeposit(db, deposit());
    db.runSync("UPDATE appointments SET status = 'COMPLETED' WHERE id = ?", [appointmentLea.id]);

    expect(() => voidAppointmentDeposit(db, 'deposit-1', new Date())).toThrow(
      expect.objectContaining({ reason: 'APPOINTMENT_NOT_OPEN' }),
    );
    expect(loadAppointmentDeposits(db)[0]?.status).toBe('ACTIVE');
  });

  it.each(['CANCELLED', 'NO_SHOW'] as const)(
    'still corrects a mistaken entry on a %s Appointment (void yes, new deposit no)',
    (status) => {
      const db = openDatabase();
      insertAppointmentDeposit(db, deposit());
      db.runSync('UPDATE appointments SET status = ? WHERE id = ?', [status, appointmentLea.id]);
      const voidedAt = new Date('2026-09-12T09:00:00.000Z');

      voidAppointmentDeposit(db, 'deposit-1', voidedAt);

      expect(loadAppointmentDeposits(db)).toEqual([{ ...deposit(), status: 'VOIDED', voidedAt }]);
      expect(readAppointmentDepositPosition(db, appointmentLea.id)?.activeDepositTotalCents).toBe(0);
      expect(() => insertAppointmentDeposit(db, deposit({ id: 'deposit-2' }))).toThrow(
        expect.objectContaining({ reason: 'APPOINTMENT_NOT_OPEN' }),
      );
      expect(loadAppointmentDeposits(db)).toHaveLength(1);
    },
  );

  it('the table CHECKs refuse what the domain refuses', () => {
    const db = openDatabase();
    const insert =
      "INSERT INTO appointment_deposits (id, business_id, appointment_id, amount_cents, payment_method, paid_at, status, voided_at, recorded_at) VALUES ('x', 'b', 'a', ?, ?, 'now', ?, ?, 'now')";
    expect(() => db.runSync(insert, [0, 'CARD', 'ACTIVE', null])).toThrow();
    expect(() => db.runSync(insert, [100, 'CHEQUE', 'ACTIVE', null])).toThrow();
    expect(() => db.runSync(insert, [100, 'CARD', 'REFUNDED', null])).toThrow();
    expect(() => db.runSync(insert, [100, 'CARD', 'VOIDED', null])).toThrow();
    expect(() => db.runSync(insert, [100, 'CARD', 'ACTIVE', 'now'])).toThrow();
  });
});

describe('Appointment deposit store — every write that lowers the total is guarded', () => {
  // 135,00 € expected; 100,00 € already paid ahead.
  function withDeposits(): Db {
    const db = openDatabase();
    insertAppointmentDeposit(db, deposit({ id: 'd1', amountCents: 10000 }));
    return db;
  }

  it('a discount below the deposits is refused and nothing is written', () => {
    const db = withDeposits();
    const before = dumpAll(db);

    expect(() => updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 50 })).toThrow(
      AppointmentDepositShortfallError,
    );
    expect(dumpAll(db)).toEqual(before);
  });

  it('a discount keeping the total above the deposits is written', () => {
    const db = withDeposits();
    updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 20 });
    expect(readAppointmentDepositPosition(db, appointmentLea.id)?.expectedTotalCents).toBe(10800);
  });

  it('removing a service below the deposits is refused', () => {
    const db = withDeposits();
    const before = dumpAll(db);

    expect(() => removeAppointmentItem(db, appointmentLea.id, 'appointment-lea-item-0')).toThrow(
      AppointmentDepositShortfallError,
    );
    expect(dumpAll(db)).toEqual(before);
  });

  it('a full edit lowering a price below the deposits is refused; one above is written', () => {
    const db = withDeposits();
    const cheaper: Appointment = {
      ...appointmentLea,
      items: appointmentLea.items.map((item, index) => (index === 0 ? { ...item, price: 50 } : item)),
    };
    const before = dumpAll(db);
    expect(() => updateAppointment(db, cheaper)).toThrow(AppointmentDepositShortfallError);
    expect(dumpAll(db)).toEqual(before);

    const stillCovered: Appointment = {
      ...appointmentLea,
      items: appointmentLea.items.map((item, index) => (index === 0 ? { ...item, price: 60 } : item)),
    };
    updateAppointment(db, stillCovered);
    expect(readAppointmentDepositPosition(db, appointmentLea.id)?.expectedTotalCents).toBe(10000);
  });

  it('removing a linked Product below the deposits is refused: stock, lines and Sale untouched', () => {
    const db = openDatabase();
    completeSale(db, linkedMaskSale(), [{ productId: productMask.id, quantity: 1 }]);
    // 135 + 50 = 185 € expected; 150 € paid ahead.
    insertAppointmentDeposit(db, deposit({ amountCents: 15000 }));
    const before = dumpAll(db);

    expect(() =>
      deleteAppointmentProduct(db, appointmentLea.id, {
        productId: productMask.id,
        productName: productMask.name,
        unitPrice: 50,
      }),
    ).toThrow(AppointmentDepositShortfallError);
    expect(dumpAll(db)).toEqual(before);
  });

  it('a change that does not lower the total is never refused (lifecycle, notes)', () => {
    const db = withDeposits();
    updateAppointment(db, { ...appointmentLea, notes: 'Nouvelle note' });
    updateAppointment(db, {
      ...appointmentLea,
      status: 'CANCELLED',
      cancellation: { cancelledAt: new Date(), cancelledBy: 'CLIENT' },
    });
    expect(readAppointmentDepositPosition(db, appointmentLea.id)?.status).toBe('CANCELLED');
  });

  it('VOIDED deposits do not protect anything', () => {
    const db = withDeposits();
    voidAppointmentDeposit(db, 'd1', new Date());
    updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 50 });
    expect(readAppointmentDepositPosition(db, appointmentLea.id)?.expectedTotalCents).toBe(6750);
  });
});

describe('Appointment deposit store — checkout and prepaid completion', () => {
  const now = new Date('2026-09-11T12:00:00.000Z');

  it('the final checkout records ONLY the newly collected money', () => {
    const db = openDatabase();
    insertAppointmentDeposit(db, deposit({ amountCents: 3000 }));

    checkoutAppointment(db, appointmentLea.id, { paidAt: now, cardAmountCents: 10500, cashAmountCents: 0 });

    expect(db.getFirstSync('SELECT status, card_amount_cents, cash_amount_cents FROM appointments WHERE id = ?', [appointmentLea.id])).toEqual({
      status: 'COMPLETED',
      card_amount_cents: 10500,
      cash_amount_cents: 0,
    });
    expect(loadAppointmentDeposits(db)).toEqual([deposit({ amountCents: 3000 })]);
  });

  it('a fully prepaid Appointment completes WITHOUT any payment', () => {
    const db = openDatabase();
    insertAppointmentDeposit(db, deposit({ amountCents: 13500 }));

    completePrepaidAppointment(db, appointmentLea.id, now);

    expect(db.getFirstSync('SELECT status, paid_at, card_amount_cents, cash_amount_cents FROM appointments WHERE id = ?', [appointmentLea.id])).toEqual({
      status: 'COMPLETED',
      paid_at: null,
      card_amount_cents: null,
      cash_amount_cents: null,
    });
  });

  it('refuses a prepaid completion while money remains, without deposits, or before the start', () => {
    const db = openDatabase();
    expect(() => completePrepaidAppointment(db, appointmentLea.id, now)).toThrow(AppointmentCheckoutConflictError);
    insertAppointmentDeposit(db, deposit({ amountCents: 13400 }));
    expect(() => completePrepaidAppointment(db, appointmentLea.id, now)).toThrow(AppointmentCheckoutConflictError);
    insertAppointmentDeposit(db, deposit({ id: 'd2', amountCents: 100 }));
    expect(() => completePrepaidAppointment(db, appointmentLea.id, new Date('2026-09-01T00:00:00.000Z'))).toThrow(
      AppointmentCheckoutConflictError,
    );
    expect(db.getFirstSync('SELECT status FROM appointments WHERE id = ?', [appointmentLea.id])).toEqual({ status: 'SCHEDULED' });
  });
});

describe('Appointment deposit store — history and sync bookkeeping', () => {
  it('a deposit — even VOIDED — blocks permanent deletion of its Appointment', () => {
    const db = openDatabase();
    insertAppointmentDeposit(db, deposit());
    voidAppointmentDeposit(db, 'deposit-1', new Date());

    expect(countAppointmentReferences(db, appointmentLea.id)).toEqual({ hasPayment: false, saleCount: 0, depositCount: 1 });
    expect(() => deleteAppointment(db, appointmentLea.id)).toThrow(AppointmentDeleteConflictError);
  });

  it('create and void each mark ONE APPOINTMENT_DEPOSIT outbox entry, coalesced', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () =>
      createTestSeed({ appointments: [{ ...appointmentLea, businessId: REMOTE_BUSINESS_ID }] }),
    );
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);

    insertAppointmentDeposit(db, deposit({ businessId: REMOTE_BUSINESS_ID }));
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => [entry.aggregateType, entry.aggregateId, entry.operation, entry.revision])).toEqual([
      ['APPOINTMENT_DEPOSIT', 'deposit-1', 'UPSERT', 1],
    ]);

    voidAppointmentDeposit(db, 'deposit-1', new Date());
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => [entry.aggregateType, entry.operation, entry.revision])).toEqual([
      ['APPOINTMENT_DEPOSIT', 'UPSERT', 2],
    ]);
  });

  it('a refused deposit leaves no outbox entry', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () =>
      createTestSeed({ appointments: [{ ...appointmentLea, businessId: REMOTE_BUSINESS_ID }] }),
    );
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);

    expect(() => insertAppointmentDeposit(db, deposit({ businessId: REMOTE_BUSINESS_ID, amountCents: 99999 }))).toThrow();
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID)).toEqual([]);
  });
});
