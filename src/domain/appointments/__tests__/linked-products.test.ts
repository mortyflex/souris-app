import type { Sale } from '../../sales/types';
import {
  getAppointmentProductLines,
  getAppointmentProductUnitCount,
  isSameProductSnapshot,
} from '../linked-products';

const shampoo = { productId: 'shampoo', productName: 'ACG Shampoo', unitPrice: 10 };
const mask = { productId: 'mask', productName: 'Mask', unitPrice: 20 };

/** `appointmentId: null` builds a standalone Sale (no Appointment link). */
function sale(id: string, items: Sale['items'], appointmentId: string | null = 'appointment-1'): Sale {
  return {
    id,
    businessId: 'business-a',
    clientId: 'client-a',
    ...(appointmentId === null ? {} : { appointmentId }),
    completedAt: new Date(2026, 8, 12, 15, 0),
    items,
  };
}

describe('Appointment Product lines', () => {
  it('aggregates the same Product snapshot sold through separate Reventes into ONE row', () => {
    const lines = getAppointmentProductLines(
      [
        sale('sale-a', [{ id: 'a0', ...shampoo, quantity: 1 }]),
        sale('sale-b', [{ id: 'b0', ...shampoo, quantity: 1 }]),
      ],
      'appointment-1',
    );

    expect(lines).toEqual([
      expect.objectContaining({ ...shampoo, quantity: 2, totalCents: 2000 }),
    ]);
  });

  it('keeps separate rows for a different snapshot unit price instead of a false ×2', () => {
    const lines = getAppointmentProductLines(
      [
        sale('sale-a', [{ id: 'a0', ...shampoo, quantity: 1 }]),
        sale('sale-b', [{ id: 'b0', ...shampoo, unitPrice: 12, quantity: 1 }]),
      ],
      'appointment-1',
    );

    expect(lines).toEqual([
      expect.objectContaining({ productId: 'shampoo', unitPrice: 10, quantity: 1, totalCents: 1000 }),
      expect.objectContaining({ productId: 'shampoo', unitPrice: 12, quantity: 1, totalCents: 1200 }),
    ]);
    expect(lines[0]?.key).not.toBe(lines[1]?.key);
  });

  it('keeps separate rows for a renamed snapshot of the same Product', () => {
    const lines = getAppointmentProductLines(
      [
        sale('sale-a', [{ id: 'a0', ...shampoo, quantity: 1 }]),
        sale('sale-b', [{ id: 'b0', ...shampoo, productName: 'ACG Shampoo 250 ml', quantity: 1 }]),
      ],
      'appointment-1',
    );
    expect(lines.map((line) => line.productName)).toEqual(['ACG Shampoo', 'ACG Shampoo 250 ml']);
  });

  it('keeps first-sold order, mixes several Products, and ignores other Sales', () => {
    const lines = getAppointmentProductLines(
      [
        sale('sale-a', [
          { id: 'a0', ...shampoo, quantity: 1 },
          { id: 'a1', ...mask, quantity: 1 },
        ]),
        sale('sale-client', [{ id: 'c0', ...shampoo, quantity: 5 }], null),
        sale('sale-other', [{ id: 'o0', ...mask, quantity: 5 }], 'appointment-2'),
        sale('sale-b', [{ id: 'b0', ...shampoo, quantity: 1 }]),
      ],
      'appointment-1',
    );

    expect(lines).toEqual([
      expect.objectContaining({ ...shampoo, quantity: 2, totalCents: 2000 }),
      expect.objectContaining({ ...mask, quantity: 1, totalCents: 2000 }),
    ]);
    expect(getAppointmentProductLines([], 'appointment-1')).toEqual([]);
  });

  it('computes exact cents per line without floating-point drift', () => {
    const [line] = getAppointmentProductLines(
      [sale('sale-a', [{ id: 'a0', ...shampoo, unitPrice: 0.29, quantity: 3 }])],
      'appointment-1',
    );
    expect(line?.totalCents).toBe(87);
  });

  it('counts TOTAL UNITS for the section badge, not unique Products', () => {
    const lines = getAppointmentProductLines(
      [
        sale('sale-a', [
          { id: 'a0', ...shampoo, quantity: 1 },
          { id: 'a1', ...mask, quantity: 1 },
        ]),
        sale('sale-b', [{ id: 'b0', ...shampoo, quantity: 1 }]),
      ],
      'appointment-1',
    );
    expect(lines).toHaveLength(2);
    expect(getAppointmentProductUnitCount(lines)).toBe(3);
    expect(getAppointmentProductUnitCount([])).toBe(0);
  });

  it('compares snapshot identity on productId, productName and unitPrice', () => {
    expect(isSameProductSnapshot(shampoo, { ...shampoo })).toBe(true);
    expect(isSameProductSnapshot(shampoo, { ...shampoo, unitPrice: 12 })).toBe(false);
    expect(isSameProductSnapshot(shampoo, { ...shampoo, productName: 'Other' })).toBe(false);
    expect(isSameProductSnapshot(shampoo, { ...shampoo, productId: 'mask' })).toBe(false);
  });
});
