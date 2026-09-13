import type { Appointment } from '@/domain/appointments';
import type { Sale } from '@/domain/sales';

import { bootstrapPersistence } from '../bootstrap';
import {
  AppointmentCheckoutConflictError,
  AppointmentDeleteConflictError,
  checkoutAppointment,
  countAppointmentReferences,
  deleteAppointment,
  insertAppointment,
  loadAppointments,
  updateAppointment,
  updateAppointmentPayment,
} from '../stores/appointments';
import { completeSale, countAppointmentSales, loadSales } from '../stores/sales';
import { appointmentLea, clientLea, createTestSeed, productMask } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

function countRows(db: ReturnType<typeof openTestDatabase>, table: string): number {
  return db.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

function reload(db: ReturnType<typeof openTestDatabase>, id = appointmentLea.id): Appointment | undefined {
  return loadAppointments(db).find((appointment) => appointment.id === id);
}

const paidAt = new Date(2026, 8, 11, 11, 5, 30, 250);

const linkedSale: Sale = {
  id: 'sale-linked',
  businessId: 'business-test',
  clientId: clientLea.id,
  appointmentId: appointmentLea.id,
  completedAt: new Date(2026, 8, 11, 11, 0),
  items: [
    { id: 'sale-linked-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 2 },
  ],
};

describe('Appointment checkout store', () => {
  it('writes status and payment together and restores exact cents after a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 7500, cashAmountCents: 2001 });

    const reloaded = reload(db);
    expect(reloaded?.status).toBe('COMPLETED');
    expect(reloaded?.payment).toEqual({ paidAt, cardAmountCents: 7500, cashAmountCents: 2001 });
    expect(reloaded?.payment?.paidAt.getTime()).toBe(paidAt.getTime());
    expect(
      db.getFirstSync<{ paid_at: string; card_amount_cents: number; cash_amount_cents: number }>(
        "SELECT paid_at, card_amount_cents, cash_amount_cents FROM appointments WHERE id = 'appointment-lea'",
      ),
    ).toEqual({ paid_at: paidAt.toISOString(), card_amount_cents: 7500, cash_amount_cents: 2001 });
  });

  it('records a checkout on a completed appointment without payment, keeping its status', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [{ ...appointmentLea, status: 'COMPLETED' }] }));

    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 0, cashAmountCents: 9500 });

    expect(reload(db)).toMatchObject({ status: 'COMPLETED', payment: { cashAmountCents: 9500 } });
  });

  it('refuses a checkout for missing, cancelled, no-show, or already paid appointments', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [] }));
    insertAppointment(db, {
      ...appointmentLea,
      id: 'cancelled',
      status: 'CANCELLED',
      cancellation: { cancelledAt: paidAt, cancelledBy: 'CLIENT' },
    });
    insertAppointment(db, { ...appointmentLea, id: 'no-show', status: 'NO_SHOW', noShow: { recordedAt: paidAt } });
    insertAppointment(db, {
      ...appointmentLea,
      id: 'paid',
      status: 'COMPLETED',
      payment: { paidAt, cardAmountCents: 100, cashAmountCents: 0 },
    });
    const payment = { paidAt, cardAmountCents: 5000, cashAmountCents: 0 };

    for (const id of ['missing', 'cancelled', 'no-show', 'paid']) {
      expect(() => checkoutAppointment(db, id, payment)).toThrow(AppointmentCheckoutConflictError);
    }
    expect(reload(db, 'cancelled')?.status).toBe('CANCELLED');
    expect(reload(db, 'no-show')?.payment).toBeUndefined();
    expect(reload(db, 'paid')?.payment?.cardAmountCents).toBe(100);
  });

  it('rejects invalid cents before touching the row', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(() =>
      checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: -1, cashAmountCents: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 10.5, cashAmountCents: 0 }),
    ).toThrow(RangeError);
    expect(reload(db)).toEqual(appointmentLea);
  });

  it('corrects the split of a recorded payment without duplicating or moving it', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 5000, cashAmountCents: 2500 });

    updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: 3000, cashAmountCents: 4500 });

    expect(reload(db)?.payment).toEqual({ paidAt, cardAmountCents: 3000, cashAmountCents: 4500 });
    expect(countRows(db, 'appointments')).toBe(1);
  });

  it('refuses a payment correction when no payment was recorded', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [{ ...appointmentLea, status: 'COMPLETED' }] }));

    expect(() =>
      updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: 1, cashAmountCents: 0 }),
    ).toThrow(AppointmentCheckoutConflictError);
    expect(reload(db)?.payment).toBeUndefined();
  });

  it('keeps the payment through a generic snapshot update', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 9500, cashAmountCents: 0 });
    const paid = reload(db)!;

    updateAppointment(db, { ...paid, notes: 'Retouche' });

    expect(reload(db)).toEqual({ ...paid, notes: 'Retouche' });
  });
});

describe('Appointment permanent deletion guard', () => {
  it('still deletes an appointment without payment or linked Sale, with every nested row', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(countAppointmentReferences(db, appointmentLea.id)).toEqual({ hasPayment: false, saleCount: 0 });
    deleteAppointment(db, appointmentLea.id);

    expect(loadAppointments(db)).toEqual([]);
    expect(countRows(db, 'appointment_items')).toBe(0);
    expect(countRows(db, 'appointment_phases')).toBe(0);
  });

  it('refuses to delete a paid appointment', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 9500, cashAmountCents: 0 });

    expect(countAppointmentReferences(db, appointmentLea.id)).toEqual({ hasPayment: true, saleCount: 0 });
    expect(() => deleteAppointment(db, appointmentLea.id)).toThrow(AppointmentDeleteConflictError);
    expect(reload(db)?.payment?.cardAmountCents).toBe(9500);
    expect(countRows(db, 'appointment_items')).toBe(2);
  });

  it('refuses to delete an appointment linked to a Sale and never touches the Sale', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    completeSale(db, linkedSale, [{ productId: productMask.id, quantity: 2 }]);

    expect(countAppointmentSales(db, appointmentLea.id)).toBe(1);
    expect(countAppointmentReferences(db, appointmentLea.id)).toEqual({ hasPayment: false, saleCount: 1 });
    let error: unknown;
    try {
      deleteAppointment(db, appointmentLea.id);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AppointmentDeleteConflictError);
    expect((error as AppointmentDeleteConflictError).references).toEqual({ hasPayment: false, saleCount: 1 });
    expect(reload(db)).toEqual(appointmentLea);
    expect(loadSales(db)).toEqual([linkedSale]);
    expect(loadSales(db)[0]?.appointmentId).toBe(appointmentLea.id);
  });

  it('reports both references when a paid appointment also has linked Sales', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 9500, cashAmountCents: 0 });
    completeSale(db, linkedSale, [{ productId: productMask.id, quantity: 2 }]);
    completeSale(db, { ...linkedSale, id: 'sale-linked-2', items: [{ ...linkedSale.items[0]!, id: 'sale-linked-2-item-0', quantity: 1 }] }, [
      { productId: productMask.id, quantity: 1 },
    ]);

    expect(countAppointmentReferences(db, appointmentLea.id)).toEqual({ hasPayment: true, saleCount: 2 });
    expect(() => deleteAppointment(db, appointmentLea.id)).toThrow(AppointmentDeleteConflictError);
    expect(countRows(db, 'sales')).toBe(2);
  });
});

describe('Sale ↔ Appointment link', () => {
  it('round-trips appointmentId and leaves standalone Sales without one', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const standalone: Sale = { ...linkedSale, id: 'sale-standalone', appointmentId: undefined, items: [
      { ...linkedSale.items[0]!, id: 'sale-standalone-item-0', quantity: 1 },
    ] };

    completeSale(db, linkedSale, [{ productId: productMask.id, quantity: 2 }]);
    completeSale(db, standalone, [{ productId: productMask.id, quantity: 1 }]);

    const sales = loadSales(db);
    expect(sales[0]).toEqual(linkedSale);
    expect(Object.keys(sales[1] ?? {})).not.toContain('appointmentId');
    expect(countAppointmentSales(db, appointmentLea.id)).toBe(1);
    expect(countAppointmentSales(db, 'unknown')).toBe(0);
  });

  it('keeps a linked Sale readable after the Appointment id no longer resolves', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [] }));
    const orphanLink: Sale = { ...linkedSale, appointmentId: 'appointment-gone' };

    completeSale(db, orphanLink, [{ productId: productMask.id, quantity: 2 }]);

    expect(loadSales(db)).toEqual([orphanLink]);
  });
});
