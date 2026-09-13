import type { Appointment } from '@/domain/appointments';
import type { Sale } from '@/domain/sales';

import { getCheckoutExpectation, getExpectedTotalCents } from '../checkout-form';

const appointment: Appointment = {
  id: 'appointment-1',
  businessId: 'business-a',
  clientId: 'client-a',
  staffMemberId: 'staff-a',
  startAt: new Date(2026, 8, 12, 14, 0),
  status: 'SCHEDULED',
  items: [
    { id: 'i0', serviceId: 's', order: 0, serviceName: 'Coupe', serviceType: 'SERVICE', price: 42.5, phases: [] },
    { id: 'i1', serviceId: 't', order: 1, serviceName: 'Couleur', serviceType: 'TECHNIQUE', price: 32.79, phases: [] },
  ],
};

const sales: Sale[] = [
  {
    id: 'linked',
    businessId: 'business-a',
    appointmentId: 'appointment-1',
    completedAt: new Date(2026, 8, 12, 15, 0),
    items: [{ id: 'l0', productId: 'p', productName: 'Shampoo', unitPrice: 10, quantity: 2 }],
  },
  {
    id: 'other',
    businessId: 'business-a',
    completedAt: new Date(2026, 8, 12, 15, 0),
    items: [{ id: 'o0', productId: 'p', productName: 'Shampoo', unitPrice: 10, quantity: 5 }],
  },
];

describe('Appointment checkout expectation', () => {
  it('adds service snapshot prices and linked Product snapshots as exact cents', () => {
    const expectation = getCheckoutExpectation(appointment, sales);

    expect(expectation).toEqual({ servicesCents: 7529, productsCents: 2000 });
    expect(getExpectedTotalCents(expectation)).toBe(9529);
  });

  it('expects nothing for an empty appointment without linked Sales', () => {
    expect(getCheckoutExpectation({ ...appointment, items: [] }, [])).toEqual({
      servicesCents: 0,
      productsCents: 0,
    });
  });
});
