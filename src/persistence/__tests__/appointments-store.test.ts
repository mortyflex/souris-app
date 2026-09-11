import type { Appointment } from '@/domain/appointments';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import {
  deleteAppointment,
  insertAppointment,
  insertAppointmentWithServiceDefaults,
  loadAppointments,
  updateAppointment,
} from '../stores/appointments';
import { loadServices } from '../stores/services';
import { appointmentLea, createTestSeed, serviceColor, serviceCut } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

function countRows(db: ReturnType<typeof openTestDatabase>, table: string): number {
  return db.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

describe('Appointment store', () => {
  it('restores a multi-item, multi-phase snapshot exactly after a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [] }));

    insertAppointment(db, appointmentLea);

    const [reloaded] = loadSnapshot(db).appointments;
    expect(reloaded).toEqual(appointmentLea);
    expect(reloaded?.startAt.getTime()).toBe(appointmentLea.startAt.getTime());
    expect(reloaded?.items.map((item) => item.order)).toEqual([0, 1]);
    expect(reloaded?.items[0]?.phases.map((phase) => phase.requiresStaff)).toEqual([true, false, true]);
    expect(reloaded?.items[1]?.serviceOptionId).toBe('option-long');
    expect(Object.keys(reloaded?.items[0] ?? {})).not.toContain('serviceOptionId');
  });

  it('stores startAt as an instant and restores the same local calendar fields', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    const stored = db.getFirstSync<{ start_at: string }>(
      "SELECT start_at FROM appointments WHERE id = 'appointment-lea'",
    );
    expect(stored?.start_at).toBe(appointmentLea.startAt.toISOString());
    const reloaded = loadAppointments(db)[0]!;
    expect([reloaded.startAt.getFullYear(), reloaded.startAt.getMonth(), reloaded.startAt.getDate()]).toEqual([2026, 8, 11]);
    expect([reloaded.startAt.getHours(), reloaded.startAt.getMinutes()]).toEqual([9, 30]);
  });

  it('keeps client, start, item order, price, and duration edits across a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const [color, cut] = appointmentLea.items;
    const edited: Appointment = {
      ...appointmentLea,
      clientId: 'client-other',
      startAt: new Date(2026, 8, 12, 14, 0),
      notes: undefined,
      items: [
        { ...cut!, order: 0, price: 45 },
        {
          ...color!,
          order: 1,
          phases: color!.phases.map((phase, index) =>
            index === 1 ? { ...phase, durationMinutes: 50 } : phase,
          ),
        },
      ],
    };

    updateAppointment(db, edited);

    const reloaded = loadAppointments(db)[0]!;
    expect(reloaded.clientId).toBe('client-other');
    expect(reloaded.startAt.getTime()).toBe(edited.startAt.getTime());
    expect(reloaded.notes).toBeUndefined();
    expect(reloaded.items.map((item) => [item.id, item.order, item.price])).toEqual([
      ['appointment-lea-item-1', 0, 45],
      ['appointment-lea-item-0', 1, 95],
    ]);
    expect(reloaded.items[1]?.phases[1]?.durationMinutes).toBe(50);
    expect(countRows(db, 'appointment_items')).toBe(2);
    expect(countRows(db, 'appointment_phases')).toBe(4);
  });

  it('keeps cancellation, no-show, and completion outcomes across a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [] }));
    const cancelled: Appointment = {
      ...appointmentLea,
      id: 'appointment-cancelled',
      status: 'CANCELLED',
      cancellation: {
        cancelledAt: new Date(2026, 8, 10, 18, 5, 30, 250),
        cancelledBy: 'CLIENT',
        reason: 'Malade',
      },
    };
    const noShow: Appointment = {
      ...appointmentLea,
      id: 'appointment-no-show',
      status: 'NO_SHOW',
      noShow: { recordedAt: new Date(2026, 8, 11, 10) },
    };
    const completed: Appointment = { ...appointmentLea, id: 'appointment-completed', status: 'COMPLETED' };
    insertAppointment(db, cancelled);
    insertAppointment(db, noShow);
    insertAppointment(db, completed);

    const reloaded = loadAppointments(db);
    expect(reloaded).toEqual([cancelled, noShow, completed]);
    expect(reloaded[0]?.cancellation?.cancelledAt.getTime()).toBe(cancelled.cancellation?.cancelledAt.getTime());
    expect(reloaded[1]?.cancellation).toBeUndefined();
    expect(reloaded[2]?.noShow).toBeUndefined();
  });

  it('permanently deletes the Appointment together with every nested row', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    expect(countRows(db, 'appointment_items')).toBe(2);
    expect(countRows(db, 'appointment_phases')).toBe(4);

    deleteAppointment(db, appointmentLea.id);

    expect(loadAppointments(db)).toEqual([]);
    expect(countRows(db, 'appointment_items')).toBe(0);
    expect(countRows(db, 'appointment_phases')).toBe(0);
  });

  it('commits a new Appointment and its Service catalog defaults together', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [] }));
    const cheaperCut = { ...serviceCut, price: 38, phases: [{ ...serviceCut.phases[0]!, durationMinutes: 40 }] };

    insertAppointmentWithServiceDefaults(db, appointmentLea, [cheaperCut]);

    expect(loadAppointments(db)).toEqual([appointmentLea]);
    expect(loadServices(db).find((service) => service.id === serviceCut.id)).toEqual(cheaperCut);
    expect(loadServices(db).find((service) => service.id === serviceColor.id)).toEqual(serviceColor);
  });

  it('rolls back the Appointment when a Service default update fails', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [] }));
    const cheaperCut = { ...serviceCut, price: 38 };
    const vanished = { ...serviceColor, id: 'service-vanished', price: 1 };

    expect(() =>
      insertAppointmentWithServiceDefaults(db, appointmentLea, [cheaperCut, vanished]),
    ).toThrow('not found');

    expect(loadAppointments(db)).toEqual([]);
    expect(countRows(db, 'appointment_items')).toBe(0);
    expect(loadServices(db)).toEqual([serviceColor, serviceCut]);
  });

  it('rolls back the Service defaults when the Appointment write fails', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const cheaperCut = { ...serviceCut, price: 38 };

    // Same id as the seeded Appointment → primary key violation.
    expect(() => insertAppointmentWithServiceDefaults(db, appointmentLea, [cheaperCut])).toThrow();

    expect(loadAppointments(db)).toEqual([appointmentLea]);
    expect(loadServices(db).find((service) => service.id === serviceCut.id)).toEqual(serviceCut);
  });

  it('rolls back the whole write when a nested row is invalid', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [] }));
    const broken: Appointment = {
      ...appointmentLea,
      items: [appointmentLea.items[0]!, { ...appointmentLea.items[0]!, order: 1 }],
    };

    expect(() => insertAppointment(db, broken)).toThrow();
    expect(countRows(db, 'appointments')).toBe(0);
    expect(countRows(db, 'appointment_items')).toBe(0);
  });
});
