import type { Sale } from '../../sales/types';
import {
  getAppointmentExpectedTotal,
  getAppointmentLinkedSales,
  getSaleTotalCents,
} from '../expected-total';
import type { Appointment } from '../types';

const appointment: Appointment = {
  id: 'appointment-1',
  businessId: 'business-a',
  clientId: 'client-a',
  staffMemberId: 'staff-a',
  startAt: new Date(2026, 8, 12, 14, 0),
  status: 'SCHEDULED',
  items: [
    { id: 'i1', serviceId: 'balayage', order: 1, serviceName: 'Balayage', serviceType: 'TECHNIQUE', price: 45, phases: [] },
    { id: 'i0', serviceId: 'cut', order: 0, serviceName: 'Coupe', serviceType: 'SERVICE', price: 35, phases: [] },
  ],
};

const saleA: Sale = {
  id: 'sale-a',
  businessId: 'business-a',
  clientId: 'client-a',
  appointmentId: 'appointment-1',
  completedAt: new Date(2026, 8, 12, 15, 0),
  items: [{ id: 'a0', productId: 'shampoo', productName: 'Shampoo', unitPrice: 15, quantity: 1 }],
};

const saleB: Sale = {
  ...saleA,
  id: 'sale-b',
  items: [{ id: 'b0', productId: 'mask', productName: 'Mask', unitPrice: 20, quantity: 1 }],
};

/** Same Client, not sold during the Appointment. */
const unrelatedForClient: Sale = {
  ...saleA,
  id: 'sale-unrelated',
  appointmentId: undefined,
  items: [{ id: 'u0', productId: 'serum', productName: 'Serum', unitPrice: 99, quantity: 1 }],
};

/** Standalone walk-in Sale with its own payment. */
const standalone: Sale = {
  id: 'sale-standalone',
  businessId: 'business-a',
  completedAt: new Date(2026, 8, 12, 16, 0),
  items: [{ id: 's0', productId: 'shampoo', productName: 'Shampoo', unitPrice: 15, quantity: 4 }],
  payment: { paidAt: new Date(2026, 8, 12, 16, 0), cardAmountCents: 6000, cashAmountCents: 0 },
};

/** A Sale of another Appointment. */
const otherAppointment: Sale = { ...saleA, id: 'sale-other', appointmentId: 'appointment-2' };

const sales = [saleA, unrelatedForClient, saleB, standalone, otherAppointment];

describe('Appointment expected total', () => {
  it('adds service snapshot prices and every linked Sale snapshot as exact cents', () => {
    expect(getAppointmentExpectedTotal(appointment, sales)).toEqual({
      servicesCents: 8000,
      productsCents: 3500,
      expectedTotalCents: 11500,
    });
  });

  it('excludes unrelated Sales of the same Client, standalone Sales, and other Appointments', () => {
    expect(getAppointmentLinkedSales(sales, 'appointment-1').map((sale) => sale.id)).toEqual([
      'sale-a',
      'sale-b',
    ]);
    expect(getAppointmentExpectedTotal(appointment, [unrelatedForClient, standalone, otherAppointment])).toEqual({
      servicesCents: 8000,
      productsCents: 0,
      expectedTotalCents: 8000,
    });
  });

  it('equals the services total when no linked Sale exists, and zero for an empty appointment', () => {
    expect(getAppointmentExpectedTotal(appointment, []).expectedTotalCents).toBe(8000);
    expect(getAppointmentExpectedTotal({ ...appointment, items: [] }, [])).toEqual({
      servicesCents: 0,
      productsCents: 0,
      expectedTotalCents: 0,
    });
  });

  it('decreases by exactly the deleted Sale when one of several Reventes is removed', () => {
    const before = getAppointmentExpectedTotal(appointment, sales);
    const after = getAppointmentExpectedTotal(
      appointment,
      sales.filter((sale) => sale.id !== 'sale-a'),
    );

    expect(before.expectedTotalCents - after.expectedTotalCents).toBe(1500);
    expect(after).toEqual({ servicesCents: 8000, productsCents: 2000, expectedTotalCents: 10000 });
  });

  it('reads snapshots only — catalog Product or Service price changes have no effect', () => {
    // A "current catalog" does not even reach the derivation: only the
    // snapshots stored on the Appointment and the Sales are consulted.
    const currentServiceCatalog = [{ id: 'cut', price: 999 }];
    const currentProductCatalog = [{ id: 'shampoo', price: 999 }];
    expect(currentServiceCatalog[0]?.price).toBe(999);
    expect(currentProductCatalog[0]?.price).toBe(999);

    expect(getAppointmentExpectedTotal(appointment, sales).expectedTotalCents).toBe(11500);
  });

  it('converts euro snapshots to cents per line without floating-point drift', () => {
    const priced: Appointment = {
      ...appointment,
      items: [
        { id: 'p0', serviceId: 's', order: 0, serviceName: 'A', serviceType: 'SERVICE', price: 42.5, phases: [] },
        { id: 'p1', serviceId: 't', order: 1, serviceName: 'B', serviceType: 'TECHNIQUE', price: 32.79, phases: [] },
      ],
    };
    const fractional: Sale = {
      ...saleA,
      items: [{ id: 'f0', productId: 'p', productName: 'P', unitPrice: 0.29, quantity: 3 }],
    };

    expect(getSaleTotalCents(fractional)).toBe(87);
    expect(getAppointmentExpectedTotal(priced, [fractional])).toEqual({
      servicesCents: 7529,
      productsCents: 87,
      expectedTotalCents: 7616,
    });
  });
});
