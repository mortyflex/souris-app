// « Encaissements du jour » (Accueil) and the Caisse read ONE selection: the
// money actually received on a local civil day, net of the money given back
// that day (getCashRegisterDaySummary). This matrix pins what that day total
// includes, case by case.

import { checkoutAppointment, type Appointment, type AppointmentDeposit } from '../../appointments';
import type { Sale, SaleAdjustment } from '../../sales';
import { getCashRegisterDayEntries, getCashRegisterDaySummary, type CashRegisterSources } from '..';

const day = new Date(2026, 10, 1, 12, 0);
const at = (hour: number, minute = 0) => new Date(2026, 10, 1, hour, minute);
const yesterday = (hour: number, minute = 0) => new Date(2026, 9, 31, hour, minute);

function appointment(id: string, startAt: Date, price: number): Appointment {
  return {
    id,
    businessId: 'b',
    clientId: `client-${id}`,
    staffMemberId: 's',
    startAt,
    status: 'SCHEDULED',
    items: [
      {
        id: `${id}-i`,
        serviceId: 'svc',
        order: 0,
        serviceName: 'Coupe',
        serviceType: 'SERVICE',
        price,
        phases: [{ id: `${id}-ph`, name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
      },
    ],
  };
}

const paidAppointment = checkoutAppointment(appointment('a', at(9), 40), { cardAmountCents: 4000, cashAmountCents: 0 }, at(10));

function directSale(id: string, paidAt: Date, cents: number): Sale {
  return {
    id,
    businessId: 'b',
    clientId: 'client-s',
    completedAt: paidAt,
    items: [{ id: `${id}-1`, productId: 'p', productName: 'Shampooing', unitPrice: cents / 100, quantity: 1 }],
    payment: { paidAt, cardAmountCents: cents, cashAmountCents: 0 },
  };
}

/** A product sold DURING the paid Appointment: its money is in the Appointment checkout. */
const revente: Sale = {
  id: 'revente',
  businessId: 'b',
  clientId: 'client-a',
  appointmentId: 'a',
  completedAt: at(10),
  items: [{ id: 'revente-1', productId: 'p', productName: 'Masque', unitPrice: 25, quantity: 1 }],
};

function deposit(id: string, paidAt: Date, cents: number, status: AppointmentDeposit['status'] = 'ACTIVE'): AppointmentDeposit {
  return {
    id,
    businessId: 'b',
    appointmentId: 'later',
    amountCents: cents,
    paymentMethod: 'CASH',
    paidAt,
    status,
    createdAt: paidAt,
    ...(status === 'VOIDED' ? { voidedAt: at(11) } : {}),
  } as AppointmentDeposit;
}

function adjustment(id: string, saleId: string, cents: number, overrides: Partial<SaleAdjustment> = {}): SaleAdjustment {
  return {
    id,
    businessId: 'b',
    saleId,
    kind: 'REFUND',
    reason: 'CUSTOMER_REFUND',
    staffMemberId: 's',
    items: [],
    refundCardCents: cents,
    refundCashCents: 0,
    initialStatus: 'SETTLED',
    status: 'SETTLED',
    refundedAt: at(15),
    settledAt: at(15),
    recordedAt: at(15),
    ...overrides,
  };
}

const total = (sources: CashRegisterSources, when: Date = day) => getCashRegisterDaySummary(sources, when).totalCents;
const none = { appointments: [], sales: [] } as const;

describe('the day total read by Accueil « encaissé » and the Caisse', () => {
  it('Appointment revenue only: the checkout received today', () => {
    expect(total({ ...none, appointments: [paidAppointment] })).toBe(4000);
  });

  it('a direct product sale only', () => {
    expect(total({ ...none, sales: [directSale('s', at(11), 1800)] })).toBe(1800);
  });

  it('mixed: Appointment + its Revente + a direct sale — the Revente never counted twice', () => {
    expect(total({ appointments: [paidAppointment], sales: [revente, directSale('s', at(11), 1800)] })).toBe(5800);
  });

  it('a deposit counts on the day it was received; a VOIDED one never', () => {
    expect(total({ ...none, deposits: [deposit('d1', at(8), 3000), deposit('d2', at(8), 2000, 'VOIDED')] })).toBe(3000);
    expect(total({ ...none, deposits: [deposit('d1', yesterday(8), 3000)] })).toBe(0);
  });

  it('partial and full refunds settled today are subtracted', () => {
    const sale = directSale('s', at(11), 1800);
    expect(total({ ...none, sales: [sale], saleAdjustments: [adjustment('r', 's', 1200)] })).toBe(600);
    expect(total({ ...none, sales: [sale], saleAdjustments: [adjustment('r', 's', 1800)] })).toBe(0);
  });

  it('an exceptional outflow (additional refund) is money given back like any refund; its voided source counts nothing', () => {
    const sale = directSale('s', at(11), 1800);
    const saleAdjustments = [
      adjustment('a', 's', 1200),
      adjustment('b', 's', 1000, { status: 'VOIDED', voidedAt: at(16) }),
      adjustment('b-outflow', 's', 1000, { recordedAt: at(16), settledAt: at(16) }),
    ];
    // 18 € in, 12 € + 10 € really given back: −4 € for the day, never −14 €.
    expect(total({ ...none, sales: [sale], saleAdjustments })).toBe(-400);
  });

  it('a compensation (money given back by the client) comes back on its own day', () => {
    const sale = directSale('s', at(11), 1800);
    const refund = adjustment('r', 's', 1200);
    const back = adjustment('back', 's', 1200, { kind: 'REVERSAL', reason: 'REFUND_RETURNED', reversesAdjustmentId: 'r', refundedAt: at(17), settledAt: at(17), recordedAt: at(17) });
    expect(total({ ...none, sales: [sale], saleAdjustments: [refund, back] })).toBe(1800);
  });

  it('pending and voided refunds move nothing', () => {
    const sale = directSale('s', at(11), 1800);
    const pending = adjustment('p', 's', 500, { initialStatus: 'PENDING', status: 'PENDING', refundedAt: undefined, settledAt: undefined });
    const voided = adjustment('v', 's', 700, { status: 'VOIDED', voidedAt: at(16) });
    expect(total({ ...none, sales: [sale], saleAdjustments: [pending, voided] })).toBe(1800);
  });

  it('day boundaries: the local day of the money, never the sale day nor a UTC date', () => {
    const lateYesterday = directSale('late', yesterday(23, 59), 9900);
    const earlyToday = directSale('early', at(0, 0), 500);
    expect(total({ ...none, sales: [lateYesterday, earlyToday] })).toBe(500);
    // Sold yesterday, refunded today: the refund belongs to today, the sale to yesterday.
    const refund = adjustment('r', 'late', 1000);
    expect(total({ ...none, sales: [lateYesterday], saleAdjustments: [refund] })).toBe(-1000);
    expect(total({ ...none, sales: [lateYesterday], saleAdjustments: [refund] }, yesterday(12))).toBe(9900);
  });

  it('the listed operations are exactly what the total counts', () => {
    const sources: CashRegisterSources = {
      appointments: [paidAppointment],
      sales: [revente, directSale('s', at(11), 1800)],
      deposits: [deposit('d1', at(8), 3000)],
      saleAdjustments: [adjustment('r', 's', 1200)],
    };
    const entries = getCashRegisterDayEntries(sources, day);
    expect(entries.map((entry) => entry.kind)).toEqual(['DEPOSIT', 'APPOINTMENT', 'SALE', 'SALE_ADJUSTMENT']);
    const sum = entries.reduce((cents, entry) => cents + entry.payment.cardAmountCents + entry.payment.cashAmountCents, 0);
    expect(sum).toBe(total(sources));
    expect(sum).toBe(3000 + 4000 + 1800 - 1200);
  });
});
