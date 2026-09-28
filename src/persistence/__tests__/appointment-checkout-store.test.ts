import type { Appointment } from '@/domain/appointments';
import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import {
  AppointmentDepositShortfallError,
  insertAppointmentDeposit,
} from '../stores/appointment-deposits';
import {
  AppointmentCheckoutAmountError,
  AppointmentCheckoutConflictError,
  AppointmentDeleteConflictError,
  AppointmentDiscountConflictError,
  checkoutAppointment,
  countAppointmentReferences,
  deleteAppointment,
  insertAppointment,
  loadAppointments,
  settleCompletedAppointmentWithDeposits,
  updateAppointment,
  updateAppointmentPayment,
} from '../stores/appointments';
import { completeSale, countAppointmentSales, loadSales } from '../stores/sales';
import {
  getCashRegisterDayEntries,
  getCashRegisterDaySummary,
  getCashRegisterMonthSummary,
} from '@/domain/cash-register';
import { getAppointmentDepositPosition, isAppointmentSettled } from '@/domain/appointments';
import { appointmentLea, clientLea, createTestSeed, productMask } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

function countRows(db: ReturnType<typeof openTestDatabase>, table: string): number {
  return db.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

function reload(db: ReturnType<typeof openTestDatabase>, id = appointmentLea.id): Appointment | undefined {
  return loadAppointments(db).find((appointment) => appointment.id === id);
}

const paidAt = new Date(2026, 8, 11, 11, 5, 30, 250);
/** Coloration 95 € + Coupe 40 €: what a final checkout of Léa settles. */
const LEA_DUE_CENTS = 13500;

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

    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 7499, cashAmountCents: 6001 });

    const reloaded = reload(db);
    expect(reloaded?.status).toBe('COMPLETED');
    expect(reloaded?.payment).toEqual({ paidAt, cardAmountCents: 7499, cashAmountCents: 6001 });
    expect(reloaded?.payment?.paidAt.getTime()).toBe(paidAt.getTime());
    expect(
      db.getFirstSync<{ paid_at: string; card_amount_cents: number; cash_amount_cents: number }>(
        "SELECT paid_at, card_amount_cents, cash_amount_cents FROM appointments WHERE id = 'appointment-lea'",
      ),
    ).toEqual({ paid_at: paidAt.toISOString(), card_amount_cents: 7499, cash_amount_cents: 6001 });
  });

  it('records a checkout on a completed appointment without payment, keeping its status', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [{ ...appointmentLea, status: 'COMPLETED' }] }));

    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 0, cashAmountCents: LEA_DUE_CENTS });

    expect(reload(db)).toMatchObject({ status: 'COMPLETED', payment: { cashAmountCents: LEA_DUE_CENTS } });
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
    // The exact due: only the status or the existing payment refuses.
    const payment = { paidAt, cardAmountCents: LEA_DUE_CENTS, cashAmountCents: 0 };

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
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 7500, cashAmountCents: 6000 });

    updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: 3000, cashAmountCents: 10500 });

    expect(reload(db)?.payment).toEqual({ paidAt, cardAmountCents: 3000, cashAmountCents: 10500 });
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
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: LEA_DUE_CENTS, cashAmountCents: 0 });
    const paid = reload(db)!;

    updateAppointment(db, { ...paid, notes: 'Retouche' });

    expect(reload(db)).toEqual({ ...paid, notes: 'Retouche' });
  });
});

describe('Appointment checkout store — exact settlement, re-verified on the stored rows', () => {
  const deposit = (amountCents: number, id = 'deposit-lea') => ({
    id,
    businessId: 'business-test',
    appointmentId: appointmentLea.id,
    amountCents,
    paymentMethod: 'CARD' as const,
    paidAt: new Date(2026, 8, 1, 10, 0),
    status: 'ACTIVE' as const,
    createdAt: new Date(2026, 8, 1, 10, 0),
  });

  function amountRefusal(task: () => void): string | undefined {
    try {
      task();
    } catch (error) {
      if (error instanceof AppointmentCheckoutAmountError) return error.refusal;
      throw error;
    }
    return undefined;
  }

  it('refuses one cent less or one cent more than the due, and writes nothing', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(
      amountRefusal(() =>
        checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 3000, cashAmountCents: 10499 }),
      ),
    ).toBe('UNDER_DUE');
    expect(
      amountRefusal(() =>
        checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 3000, cashAmountCents: 10501 }),
      ),
    ).toBe('EXCEEDS_DUE');
    expect(reload(db)).toEqual(appointmentLea);
  });

  it('settles only what the deposits leave: 135 € with a 30 € deposit is checked out as 105 €', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    insertAppointmentDeposit(db, deposit(3000));

    expect(
      amountRefusal(() =>
        checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: LEA_DUE_CENTS, cashAmountCents: 0 }),
      ),
    ).toBe('EXCEEDS_DUE');
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 2000, cashAmountCents: 8500 });
    expect(reload(db)?.payment).toEqual({ paidAt, cardAmountCents: 2000, cashAmountCents: 8500 });
  });

  it('never records a payment once deposits cover everything — COMPLETED without payment included', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    insertAppointmentDeposit(db, deposit(LEA_DUE_CENTS));
    // Completed without payment (a prepaid « Terminer », or the automatic previous-day completion).
    updateAppointment(db, { ...appointmentLea, status: 'COMPLETED' });

    for (const cents of [0, 1, 500]) {
      expect(
        amountRefusal(() => checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: cents, cashAmountCents: 0 })),
      ).toBe('ALREADY_SETTLED');
    }
    expect(reload(db)?.payment).toBeUndefined();
  });

  it('writes the checkout discount of a COMPLETED Appointment without payment, then settles the new due', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [{ ...appointmentLea, status: 'COMPLETED' }] }));

    checkoutAppointment(
      db,
      appointmentLea.id,
      { paidAt, cardAmountCents: 12000, cashAmountCents: 0 },
      { discount: { type: 'FIXED', amountCents: 1500 } },
    );

    expect(reload(db)).toMatchObject({
      status: 'COMPLETED',
      discount: { type: 'FIXED', amountCents: 1500 },
      payment: { cardAmountCents: 12000, cashAmountCents: 0 },
    });
  });

  it('rolls the checkout discount back with a refused amount — never one without the other', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [{ ...appointmentLea, status: 'COMPLETED' }] }));

    expect(
      amountRefusal(() =>
        checkoutAppointment(
          db,
          appointmentLea.id,
          { paidAt, cardAmountCents: LEA_DUE_CENTS, cashAmountCents: 0 },
          { discount: { type: 'PERCENT', percent: 10 } },
        ),
      ),
    ).toBe('EXCEEDS_DUE');
    expect(reload(db)).toEqual({ ...appointmentLea, status: 'COMPLETED' });
  });

  it('refuses a checkout discount taking a COMPLETED Appointment below its deposits', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    insertAppointmentDeposit(db, deposit(13000));
    updateAppointment(db, { ...appointmentLea, status: 'COMPLETED' });

    expect(() =>
      checkoutAppointment(
        db,
        appointmentLea.id,
        { paidAt, cardAmountCents: 0, cashAmountCents: 0 },
        { discount: { type: 'FIXED', amountCents: 1000 } },
      ),
    ).toThrow(AppointmentDepositShortfallError);
    expect(reload(db)?.discount).toBeUndefined();
    expect(reload(db)?.payment).toBeUndefined();
  });

  it('never changes the discount of an Appointment that already has its payment', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: LEA_DUE_CENTS, cashAmountCents: 0 });

    expect(() =>
      checkoutAppointment(
        db,
        appointmentLea.id,
        { paidAt, cardAmountCents: 12000, cashAmountCents: 0 },
        { discount: { type: 'FIXED', amountCents: 1500 } },
      ),
    ).toThrow(AppointmentDiscountConflictError);
    expect(reload(db)?.discount).toBeUndefined();
  });

  it('keeps an ordinary correction on the exact due: never one cent more or less', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: LEA_DUE_CENTS, cashAmountCents: 0 });

    expect(
      amountRefusal(() => updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: 13501, cashAmountCents: 0 })),
    ).toBe('EXCEEDS_DUE');
    expect(
      amountRefusal(() => updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: 13499, cashAmountCents: 0 })),
    ).toBe('UNDER_DUE');
    expect(reload(db)?.payment?.cardAmountCents).toBe(LEA_DUE_CENTS);
  });

  it('lets a LEGACY overpaid payment be kept or brought towards the due, never raised', () => {
    const db = openTestDatabase();
    // Recorded before the exact rule: 150 € received for 135 € due (a tip).
    bootstrapPersistence(db, () =>
      createTestSeed({
        appointments: [
          { ...appointmentLea, status: 'COMPLETED', payment: { paidAt, cardAmountCents: 15000, cashAmountCents: 0 } },
        ],
      }),
    );

    for (const [card, cash] of [[10000, 5000], [14000, 0], [LEA_DUE_CENTS, 0]] as const) {
      updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: card, cashAmountCents: cash });
      expect(reload(db)?.payment).toEqual({ paidAt, cardAmountCents: card, cashAmountCents: cash });
    }
  });

  it('lets a LEGACY underpaid payment (100 € recorded, 135 € due) be kept or raised to the due, never outside', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () =>
      createTestSeed({
        appointments: [
          { ...appointmentLea, status: 'COMPLETED', payment: { paidAt, cardAmountCents: 10000, cashAmountCents: 0 } },
        ],
      }),
    );

    expect(
      amountRefusal(() => updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: 9999, cashAmountCents: 0 })),
    ).toBe('UNDER_DUE');
    expect(
      amountRefusal(() => updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: 13501, cashAmountCents: 0 })),
    ).toBe('EXCEEDS_DUE');
    for (const [card, cash] of [[6000, 4000], [8000, 4000], [LEA_DUE_CENTS, 0]] as const) {
      updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: card, cashAmountCents: cash });
      expect(reload(db)?.payment).toEqual({ paidAt, cardAmountCents: card, cashAmountCents: cash });
    }
  });

  it('refuses to raise a legacy overpaid payment above what was recorded', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () =>
      createTestSeed({
        appointments: [
          { ...appointmentLea, status: 'COMPLETED', payment: { paidAt, cardAmountCents: 15000, cashAmountCents: 0 } },
        ],
      }),
    );

    expect(
      amountRefusal(() => updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: 15001, cashAmountCents: 0 })),
    ).toBe('EXCEEDS_DUE');
    expect(
      amountRefusal(() => updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: 13000, cashAmountCents: 0 })),
    ).toBe('UNDER_DUE');
    expect(reload(db)?.payment?.cardAmountCents).toBe(15000);
  });
});

describe('Appointment checkout store — a COMPLETED Appointment settled by its deposits after a discount', () => {
  // Léa: 135 € expected. 120 € received ahead on 1 September; a 15 € discount at the late checkout
  // brings the total down to exactly the deposits.
  const depositPaidAt = new Date(2026, 8, 1, 10, 0);
  const settledOn = new Date(2026, 8, 28, 18, 0);

  function openCompletedWithDeposit(amountCents = 12000) {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    insertAppointmentDeposit(db, {
      id: 'deposit-lea',
      businessId: 'business-test',
      appointmentId: appointmentLea.id,
      amountCents,
      paymentMethod: 'CASH',
      paidAt: depositPaidAt,
      status: 'ACTIVE',
      createdAt: depositPaidAt,
    });
    updateAppointment(db, { ...appointmentLea, status: 'COMPLETED' });
    return db;
  }

  function caisse(db: ReturnType<typeof openTestDatabase>) {
    const { appointments, sales, appointmentDeposits: deposits } = loadSnapshot(db);
    const sources = { appointments, sales, deposits };
    return {
      depositDay: getCashRegisterDaySummary(sources, depositPaidAt),
      depositDayEntries: getCashRegisterDayEntries(sources, depositPaidAt).map((entry) => entry.kind),
      settledDay: getCashRegisterDaySummary(sources, settledOn),
      month: getCashRegisterMonthSummary(sources, depositPaidAt),
    };
  }

  it('saves ONLY the discount: no payment, still COMPLETED, settled by the deposits', () => {
    const db = openCompletedWithDeposit();

    settleCompletedAppointmentWithDeposits(db, appointmentLea.id, { discount: { type: 'FIXED', amountCents: 1500 } });

    const stored = reload(db)!;
    expect(stored).toEqual({ ...appointmentLea, status: 'COMPLETED', discount: { type: 'FIXED', amountCents: 1500 } });
    expect(stored.payment).toBeUndefined();
    expect(
      db.getFirstSync("SELECT paid_at, card_amount_cents, cash_amount_cents FROM appointments WHERE id = 'appointment-lea'"),
    ).toEqual({ paid_at: null, card_amount_cents: null, cash_amount_cents: null });
    const { sales, appointmentDeposits } = loadSnapshot(db);
    expect(isAppointmentSettled(stored, getAppointmentDepositPosition(stored, sales, appointmentDeposits))).toBe(true);
  });

  it('adds no Caisse receipt and never counts the deposit twice', () => {
    const db = openCompletedWithDeposit();
    const before = caisse(db);
    expect(before.depositDay).toMatchObject({ totalCents: 12000, cashCents: 12000, checkoutCount: 1 });
    expect(before.depositDayEntries).toEqual(['DEPOSIT']);

    settleCompletedAppointmentWithDeposits(db, appointmentLea.id, { discount: { type: 'FIXED', amountCents: 1500 } });

    expect(caisse(db)).toEqual(before);
    expect(caisse(db).settledDay.totalCents).toBe(0);
  });

  it('refuses while something is still due — the exact checkout of that rest is then required', () => {
    const db = openCompletedWithDeposit();

    // 10 € off: 125 € expected, 5 € still due.
    expect(() =>
      settleCompletedAppointmentWithDeposits(db, appointmentLea.id, { discount: { type: 'FIXED', amountCents: 1000 } }),
    ).toThrow(AppointmentCheckoutConflictError);
    expect(reload(db)?.discount).toBeUndefined();

    expect(() =>
      checkoutAppointment(
        db,
        appointmentLea.id,
        { paidAt: settledOn, cardAmountCents: 0, cashAmountCents: 0 },
        { discount: { type: 'FIXED', amountCents: 1000 } },
      ),
    ).toThrow(AppointmentCheckoutAmountError);
    checkoutAppointment(
      db,
      appointmentLea.id,
      { paidAt: settledOn, cardAmountCents: 500, cashAmountCents: 0 },
      { discount: { type: 'FIXED', amountCents: 1000 } },
    );
    expect(reload(db)).toMatchObject({
      discount: { type: 'FIXED', amountCents: 1000 },
      payment: { cardAmountCents: 500, cashAmountCents: 0 },
    });
  });

  it('keeps refusing a discount below the deposits', () => {
    const db = openCompletedWithDeposit();

    expect(() =>
      settleCompletedAppointmentWithDeposits(db, appointmentLea.id, { discount: { type: 'FIXED', amountCents: 2000 } }),
    ).toThrow(AppointmentDepositShortfallError);
    expect(reload(db)?.discount).toBeUndefined();
  });

  it('is only for a COMPLETED Appointment without payment', () => {
    const open = openTestDatabase();
    bootstrapPersistence(open, createTestSeed);
    insertAppointmentDeposit(open, {
      id: 'deposit-open',
      businessId: 'business-test',
      appointmentId: appointmentLea.id,
      amountCents: 12000,
      paymentMethod: 'CARD',
      paidAt: depositPaidAt,
      status: 'ACTIVE',
      createdAt: depositPaidAt,
    });
    // Still SCHEDULED: « Terminer » (prepaid completion) is its path, not this one.
    expect(() =>
      settleCompletedAppointmentWithDeposits(open, appointmentLea.id, { discount: { type: 'FIXED', amountCents: 1500 } }),
    ).toThrow(AppointmentCheckoutConflictError);
    expect(reload(open)).toEqual(appointmentLea);

    const paid = openTestDatabase();
    bootstrapPersistence(paid, () =>
      createTestSeed({
        appointments: [
          { ...appointmentLea, status: 'COMPLETED', payment: { paidAt, cardAmountCents: LEA_DUE_CENTS, cashAmountCents: 0 } },
        ],
      }),
    );
    expect(() =>
      settleCompletedAppointmentWithDeposits(paid, appointmentLea.id, { discount: { type: 'FIXED', amountCents: 1500 } }),
    ).toThrow(AppointmentDiscountConflictError);
    expect(reload(paid)?.discount).toBeUndefined();
  });
});

describe('Appointment permanent deletion guard', () => {
  it('still deletes an appointment without payment or linked Sale, with every nested row', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(countAppointmentReferences(db, appointmentLea.id)).toEqual({ hasPayment: false, saleCount: 0, depositCount: 0 });
    deleteAppointment(db, appointmentLea.id);

    expect(loadAppointments(db)).toEqual([]);
    expect(countRows(db, 'appointment_items')).toBe(0);
    expect(countRows(db, 'appointment_phases')).toBe(0);
  });

  it('refuses to delete a paid appointment', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: LEA_DUE_CENTS, cashAmountCents: 0 });

    expect(countAppointmentReferences(db, appointmentLea.id)).toEqual({ hasPayment: true, saleCount: 0, depositCount: 0 });
    expect(() => deleteAppointment(db, appointmentLea.id)).toThrow(AppointmentDeleteConflictError);
    expect(reload(db)?.payment?.cardAmountCents).toBe(LEA_DUE_CENTS);
    expect(countRows(db, 'appointment_items')).toBe(2);
  });

  it('refuses to delete an appointment linked to a Sale and never touches the Sale', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    completeSale(db, linkedSale, [{ productId: productMask.id, quantity: 2 }]);

    expect(countAppointmentSales(db, appointmentLea.id)).toBe(1);
    expect(countAppointmentReferences(db, appointmentLea.id)).toEqual({ hasPayment: false, saleCount: 1, depositCount: 0 });
    let error: unknown;
    try {
      deleteAppointment(db, appointmentLea.id);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AppointmentDeleteConflictError);
    expect((error as AppointmentDeleteConflictError).references).toEqual({ hasPayment: false, saleCount: 1, depositCount: 0 });
    expect(reload(db)).toEqual(appointmentLea);
    expect(loadSales(db)).toEqual([linkedSale]);
    expect(loadSales(db)[0]?.appointmentId).toBe(appointmentLea.id);
  });

  it('reports both references when a paid appointment also has linked Sales', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: LEA_DUE_CENTS, cashAmountCents: 0 });
    completeSale(db, linkedSale, [{ productId: productMask.id, quantity: 2 }]);
    completeSale(db, { ...linkedSale, id: 'sale-linked-2', items: [{ ...linkedSale.items[0]!, id: 'sale-linked-2-item-0', quantity: 1 }] }, [
      { productId: productMask.id, quantity: 1 },
    ]);

    expect(countAppointmentReferences(db, appointmentLea.id)).toEqual({ hasPayment: true, saleCount: 2, depositCount: 0 });
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
