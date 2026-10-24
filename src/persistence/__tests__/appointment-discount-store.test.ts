import { getAppointmentExpectedTotal, type Appointment } from '@/domain/appointments';
import { getCashRegisterDaySummary } from '@/domain/cash-register';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import {
  AppointmentDiscountConflictError,
  checkoutAppointment,
  insertAppointment,
  updateAppointment,
  updateAppointmentDiscount,
} from '../stores/appointments';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { updateService } from '../stores/services';
import { loadSyncOutbox } from '../sync/outbox';
import {
  appointmentLea,
  createTestSeed,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
  serviceColor,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

function reload(db: ReturnType<typeof openTestDatabase>, id = appointmentLea.id): Appointment | undefined {
  return loadSnapshot(db).appointments.find((appointment) => appointment.id === id);
}

function rawDiscount(db: ReturnType<typeof openTestDatabase>) {
  return db.getFirstSync(
    'SELECT discount_percent, discount_amount_cents FROM appointments WHERE id = ?',
    [appointmentLea.id],
  );
}

describe('Appointment discount persistence', () => {
  it('loads an Appointment without a discount as "no discount"', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(rawDiscount(db)).toEqual({ discount_percent: null, discount_amount_cents: null });
    expect(reload(db)).toEqual(appointmentLea);
    expect('discount' in (reload(db) ?? {})).toBe(false);
  });

  it('persists a percentage discount created with the Appointment across a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [] }));
    const discounted: Appointment = { ...appointmentLea, discount: { type: 'PERCENT', percent: 20 } };

    insertAppointment(db, discounted);

    expect(rawDiscount(db)).toEqual({ discount_percent: 20, discount_amount_cents: null });
    expect(reload(db)).toEqual(discounted);
  });

  it('persists a fixed discount in integer cents across a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    updateAppointment(db, { ...appointmentLea, discount: { type: 'FIXED', amountCents: 1500 } });

    expect(rawDiscount(db)).toEqual({ discount_percent: null, discount_amount_cents: 1500 });
    expect(reload(db)?.discount).toEqual({ type: 'FIXED', amountCents: 1500 });
  });

  it('switches between the two types without ever holding both', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 10 });
    updateAppointmentDiscount(db, appointmentLea.id, { type: 'FIXED', amountCents: 500 });
    expect(rawDiscount(db)).toEqual({ discount_percent: null, discount_amount_cents: 500 });

    updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 50 });
    expect(rawDiscount(db)).toEqual({ discount_percent: 50, discount_amount_cents: null });
  });

  it('clears the discount, through the dedicated write and through a full update', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 20 });
    updateAppointmentDiscount(db, appointmentLea.id, undefined);
    expect(reload(db)).toEqual(appointmentLea);

    updateAppointmentDiscount(db, appointmentLea.id, { type: 'FIXED', amountCents: 2000 });
    updateAppointment(db, appointmentLea);
    expect(rawDiscount(db)).toEqual({ discount_percent: null, discount_amount_cents: null });
  });

  it('never touches the item snapshot prices, the notes or the payment columns', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const itemsBefore = db.getAllSync('SELECT * FROM appointment_items ORDER BY item_order');

    updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 50 });

    expect(db.getAllSync('SELECT * FROM appointment_items ORDER BY item_order')).toEqual(itemsBefore);
    expect(reload(db)).toEqual({ ...appointmentLea, discount: { type: 'PERCENT', percent: 50 } });
  });

  it('marks the APPOINTMENT aggregate for sync on every discount write', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    const revisionOf = () =>
      loadSyncOutbox(db, REMOTE_BUSINESS_ID).find(
        (entry) => entry.aggregateType === 'APPOINTMENT' && entry.aggregateId === appointmentLea.id,
      )?.revision ?? 0;
    const before = revisionOf();

    updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 20 });
    const afterSet = revisionOf();
    updateAppointmentDiscount(db, appointmentLea.id, undefined);

    expect(afterSet).toBeGreaterThan(before);
    expect(revisionOf()).toBeGreaterThan(afterSet);
  });

  it('refuses to rewrite the discount of a completed Appointment and writes nothing', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 20 });
    checkoutAppointment(db, appointmentLea.id, {
      paidAt: new Date(2026, 8, 11, 11, 0),
      cardAmountCents: 10800,
      cashAmountCents: 0,
    });

    expect(() => updateAppointmentDiscount(db, appointmentLea.id, undefined)).toThrow(
      AppointmentDiscountConflictError,
    );
    expect(() =>
      updateAppointmentDiscount(db, appointmentLea.id, { type: 'FIXED', amountCents: 5000 }),
    ).toThrow(AppointmentDiscountConflictError);
    expect(rawDiscount(db)).toEqual({ discount_percent: 20, discount_amount_cents: null });
    // The checkout itself kept the discount.
    expect(reload(db)?.discount).toEqual({ type: 'PERCENT', percent: 20 });
  });

  it('keeps gross, discount and final total after a catalog price change and a restart; the Cash Register follows the final total', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 20 });
    const before = getAppointmentExpectedTotal(reload(db)!, []);
    expect(before).toEqual({
      servicesCents: 13500,
      discountCents: 2700,
      productsCents: 0,
      expectedTotalCents: 10800,
    });

    // The catalog Service the item came from becomes more expensive.
    updateService(db, { ...serviceColor, price: 150 });
    expect(getAppointmentExpectedTotal(reload(db)!, [])).toEqual(before);

    const paidAt = new Date(2026, 8, 11, 11, 0);
    checkoutAppointment(db, appointmentLea.id, {
      paidAt,
      cardAmountCents: before.expectedTotalCents,
      cashAmountCents: 0,
    });
    const { appointments, sales } = loadSnapshot(db);
    expect(getCashRegisterDaySummary({ appointments, sales }, paidAt).totalCents).toBe(10800);
    expect(getAppointmentExpectedTotal(reload(db)!, [])).toEqual(before);
  });

  it('persists freely entered values — custom cents and a custom whole percentage — exactly, across a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    updateAppointmentDiscount(db, appointmentLea.id, { type: 'FIXED', amountCents: 750 });
    expect(rawDiscount(db)).toEqual({ discount_percent: null, discount_amount_cents: 750 });
    expect(reload(db)?.discount).toEqual({ type: 'FIXED', amountCents: 750 });
    expect(getAppointmentExpectedTotal(reload(db)!, [])).toMatchObject({ discountCents: 750, expectedTotalCents: 12750 });

    updateAppointmentDiscount(db, appointmentLea.id, { type: 'FIXED', amountCents: 1290 });
    expect(reload(db)?.discount).toEqual({ type: 'FIXED', amountCents: 1290 });

    updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 7 });
    expect(rawDiscount(db)).toEqual({ discount_percent: 7, discount_amount_cents: null });
    expect(reload(db)?.discount).toEqual({ type: 'PERCENT', percent: 7 });
    // 135 € × 7 % = 945 c, derived on reload — never stored.
    expect(getAppointmentExpectedTotal(reload(db)!, [])).toMatchObject({ discountCents: 945, expectedTotalCents: 12555 });
  });

  it('refuses an unknown Appointment and an invalid discount', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(() => updateAppointmentDiscount(db, 'missing', { type: 'PERCENT', percent: 20 })).toThrow(
      AppointmentDiscountConflictError,
    );
    expect(() => updateAppointmentDiscount(db, appointmentLea.id, { type: 'PERCENT', percent: 51 })).toThrow(RangeError);
    expect(() => insertAppointment(db, { ...appointmentLea, id: 'other', discount: { type: 'FIXED', amountCents: 12.5 } })).toThrow(RangeError);
    expect(rawDiscount(db)).toEqual({ discount_percent: null, discount_amount_cents: null });
  });
});
