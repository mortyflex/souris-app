// BeautIzzy — Calendar Blocks are invisible to every client and financial derivation
//
// The isolation is structural, not a filter: a block lives in its own table
// and its own session, and the inputs of the Cash Register, the expected
// totals, the Client activity / history and the purchased products are
// Appointments and Sales — types a block cannot be. This suite pins that down
// end to end: same persisted data, with and without blocks over the very same
// hours, staff member and day → identical figures.

import { getAppointmentExpectedTotal } from '@/domain/appointments';
import {
  getCashRegisterDaySummary,
  getCashRegisterMonthSummary,
  getCashRegisterPayments,
} from '@/domain/cash-register';
import { getClientActivitySummary } from '@/features/clients/profile/presentation';
import { getClientSales } from '@/features/sales/presentation';
import { bootstrapPersistence, loadSnapshot } from '@/persistence/bootstrap';
import { checkoutAppointment } from '@/persistence/stores/appointments';
import { insertCalendarBlock } from '@/persistence/stores/calendar-blocks';
import { completeSale } from '@/persistence/stores/sales';
import {
  appointmentLea,
  BUSINESS_ID,
  clientLea,
  createTestSeed,
  productMask,
} from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

const paidAt = new Date('2026-09-11T10:45:00.000Z');
const now = new Date('2026-09-30T08:00:00.000Z');

function openWorkingDay() {
  const db = openTestDatabase();
  bootstrapPersistence(db, createTestSeed);
  checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 9000, cashAmountCents: 4500 });
  completeSale(
    db,
    {
      id: 'sale-lea',
      businessId: BUSINESS_ID,
      clientId: clientLea.id,
      completedAt: paidAt,
      payment: { paidAt, cardAmountCents: 5000, cashAmountCents: 0 },
      items: [{ id: 'sale-lea-item-0', productId: productMask.id, productName: productMask.name, unitPrice: 50, quantity: 1 }],
    },
    [{ productId: productMask.id, quantity: 1 }],
  );
  return db;
}

function figures(db: ReturnType<typeof openTestDatabase>) {
  const { appointments, sales } = loadSnapshot(db);
  const entries = appointments.map((appointment) => ({ appointment }));
  return {
    cashRegisterDay: getCashRegisterDaySummary({ appointments, sales }, paidAt),
    cashRegisterMonth: getCashRegisterMonthSummary({ appointments, sales }, paidAt),
    payments: getCashRegisterPayments({ appointments, sales }),
    expectedTotals: appointments.map((appointment) => getAppointmentExpectedTotal(appointment, sales)),
    clientActivity: getClientActivitySummary(entries, sales, clientLea.id, now),
    purchasedProducts: getClientSales(sales, clientLea.id),
  };
}

describe('Calendar Blocks — financial and client isolation', () => {
  it('changes no Cash Register figure, payment list, expected total, Client activity, history or purchased product', () => {
    const db = openWorkingDay();
    const before = figures(db);
    expect(before.cashRegisterDay.checkoutCount).toBeGreaterThan(0);
    expect(before.clientActivity.completedAppointmentCount).toBe(1);
    expect(before.clientActivity.totalSpent).toBeGreaterThan(0);

    // Same professional, same day, right over the paid Appointment and the Sale.
    for (const [id, startAt, endAt] of [
      ['block-over-appointment', appointmentLea.startAt, new Date(appointmentLea.startAt.getTime() + 3 * 3600_000)],
      ['block-over-sale', new Date(paidAt.getTime() - 1800_000), new Date(paidAt.getTime() + 1800_000)],
    ] as const) {
      insertCalendarBlock(db, {
        id,
        businessId: BUSINESS_ID,
        staffMemberId: appointmentLea.staffMemberId,
        startAt,
        endAt,
        reason: 'Pause',
      });
    }

    expect(loadSnapshot(db).calendarBlocks).toHaveLength(2);
    expect(figures(db)).toEqual(before);
  });

  it('adds no row to any payment list: there is no zero-amount line to invent', () => {
    const db = openWorkingDay();
    const paymentsBefore = figures(db).payments.length;

    insertCalendarBlock(db, {
      id: 'block',
      businessId: BUSINESS_ID,
      staffMemberId: appointmentLea.staffMemberId,
      startAt: paidAt,
      endAt: new Date(paidAt.getTime() + 3600_000),
      reason: 'Formation',
    });

    expect(figures(db).payments).toHaveLength(paymentsBefore);
    expect(JSON.stringify(figures(db))).not.toMatch(/Formation|Indisponible|block/);
  });
});
