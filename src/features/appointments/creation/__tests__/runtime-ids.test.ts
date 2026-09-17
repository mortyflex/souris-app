import { isUuidV4 } from '@/shared/lib/uuid';

import { createAppointmentId, createAppointmentItemId, createNewAppointmentItemId } from '../runtime-ids';

describe('Appointment runtime ids', () => {
  it('emits a globally unique UUID v4 for every new Appointment', () => {
    const ids = Array.from({ length: 200 }, () => createAppointmentId());

    expect(ids.every(isUuidV4)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps deriving item ids from the parent id, unique inside the Appointment', () => {
    const appointmentId = createAppointmentId();

    expect(createAppointmentItemId(appointmentId, 0)).toBe(`${appointmentId}-item-0`);
    expect(createAppointmentItemId(appointmentId, 1)).toBe(`${appointmentId}-item-1`);
    expect(createAppointmentItemId('appointment-1757840400000-1', 2)).toBe('appointment-1757840400000-1-item-2');

    const added = createNewAppointmentItemId(appointmentId, new Date(1_757_840_400_000));
    expect(added.startsWith(`${appointmentId}-item-new-1757840400000-`)).toBe(true);
    expect(createNewAppointmentItemId(appointmentId, new Date(1_757_840_400_000))).not.toBe(added);
  });
});
