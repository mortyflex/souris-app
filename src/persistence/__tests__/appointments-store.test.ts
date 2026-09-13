import type { Appointment } from '@/domain/appointments';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import {
  AppointmentItemConflictError,
  deleteAppointment,
  insertAppointment,
  loadAppointments,
  removeAppointmentItem,
  reorderAppointmentItems,
  updateAppointment,
  updateAppointmentItemPhaseDurations,
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

  it('creates the Appointment snapshot only: adjusted timing never reaches the Service rows', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [] }));
    const [color, cut] = appointmentLea.items;
    const adjusted: Appointment = {
      ...appointmentLea,
      items: [
        {
          ...color!,
          price: 110,
          phases: color!.phases.map((phase, index) =>
            index === 1 ? { ...phase, durationMinutes: 0 } : phase,
          ),
        },
        { ...cut!, phases: [{ ...cut!.phases[0]!, durationMinutes: 5 }] },
      ],
    };

    insertAppointment(db, adjusted);

    expect(loadAppointments(db)).toEqual([adjusted]);
    expect(loadAppointments(db)[0]?.items[0]?.phases[1]?.durationMinutes).toBe(0);
    expect(loadServices(db)).toEqual([serviceColor, serviceCut]);
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

  describe('appointment-specific timing', () => {
    const colorItemId = 'appointment-lea-item-0';
    const processingPhaseId = serviceColor.phases[1]!.id;

    function reloadLea(db: ReturnType<typeof openTestDatabase>) {
      return loadAppointments(db).find((entry) => entry.id === appointmentLea.id)!;
    }

    it('persists a zero-minute phase as zero and keeps the phase row after a reload', () => {
      const db = openTestDatabase();
      bootstrapPersistence(db, createTestSeed);

      updateAppointmentItemPhaseDurations(db, appointmentLea.id, colorItemId, [
        { phaseId: processingPhaseId, durationMinutes: 0 },
      ]);

      const reloaded = reloadLea(db);
      expect(reloaded.items[0]?.phases).toHaveLength(serviceColor.phases.length);
      expect(reloaded.items[0]?.phases[1]).toEqual({ ...serviceColor.phases[1]!, durationMinutes: 0 });
      expect(countRows(db, 'appointment_phases')).toBe(4);
    });

    it('writes several phases of one item atomically and never touches the catalog or other items', () => {
      const db = openTestDatabase();
      bootstrapPersistence(db, createTestSeed);
      const [application, processing] = serviceColor.phases;

      updateAppointmentItemPhaseDurations(db, appointmentLea.id, colorItemId, [
        { phaseId: application!.id, durationMinutes: 7 },
        { phaseId: processing!.id, durationMinutes: 12 },
      ]);

      const reloaded = reloadLea(db);
      expect(reloaded.items[0]?.phases.map((phase) => phase.durationMinutes)).toEqual([7, 12, serviceColor.phases[2]!.durationMinutes]);
      expect(reloaded.items[1]).toEqual(appointmentLea.items[1]);
      expect(loadServices(db).find((service) => service.id === serviceColor.id)).toEqual(serviceColor);
    });

    it('rolls back every phase when one phase does not belong to the item', () => {
      const db = openTestDatabase();
      bootstrapPersistence(db, createTestSeed);

      expect(() =>
        updateAppointmentItemPhaseDurations(db, appointmentLea.id, colorItemId, [
          { phaseId: processingPhaseId, durationMinutes: 5 },
          { phaseId: 'cut', durationMinutes: 5 },
        ]),
      ).toThrow('not found');

      expect(reloadLea(db)).toEqual(appointmentLea);
    });

    it('refuses timing changes once the stored Appointment is terminal, and for an unknown Appointment', () => {
      const db = openTestDatabase();
      bootstrapPersistence(db, createTestSeed);
      updateAppointment(db, { ...appointmentLea, status: 'COMPLETED' });

      expect(() =>
        updateAppointmentItemPhaseDurations(db, appointmentLea.id, colorItemId, [
          { phaseId: processingPhaseId, durationMinutes: 5 },
        ]),
      ).toThrow('no longer allows timing changes');
      expect(() =>
        updateAppointmentItemPhaseDurations(db, 'appointment-unknown', colorItemId, [
          { phaseId: processingPhaseId, durationMinutes: 5 },
        ]),
      ).toThrow('no longer allows timing changes');
      expect(() =>
        updateAppointmentItemPhaseDurations(db, appointmentLea.id, colorItemId, [
          { phaseId: processingPhaseId, durationMinutes: -5 },
        ]),
      ).toThrow(RangeError);

      expect(reloadLea(db).items[0]?.phases[1]?.durationMinutes).toBe(serviceColor.phases[1]!.durationMinutes);
    });
  });

  describe('direct item edits from Appointment Details', () => {
    /** Lea: Coloration (item-0, 3 phases) then Coupe (item-1, 1 phase). */
    const COLOR = 'appointment-lea-item-0';
    const CUT = 'appointment-lea-item-1';

    function reload(db: ReturnType<typeof openTestDatabase>): Appointment {
      const reloaded = loadAppointments(db).find((entry) => entry.id === appointmentLea.id);
      if (!reloaded) throw new Error('appointment-lea missing');
      return reloaded;
    }

    function refusal(task: () => void): string | undefined {
      try {
        task();
        return undefined;
      } catch (error) {
        return error instanceof AppointmentItemConflictError ? error.reason : 'unexpected';
      }
    }

    it('reorders by stable item id, keeps phases and prices, and survives a restart', () => {
      const db = openTestDatabase();
      bootstrapPersistence(db, createTestSeed);

      reorderAppointmentItems(db, appointmentLea.id, [CUT, COLOR]);

      const reloaded = reload(db);
      expect(reloaded.items.map((item) => [item.id, item.order])).toEqual([
        [CUT, 0],
        [COLOR, 1],
      ]);
      expect(reloaded.items.find((item) => item.id === COLOR)?.phases).toEqual(appointmentLea.items[0]?.phases);
      expect(reloaded.items.find((item) => item.id === CUT)?.price).toBe(40);
      expect(loadServices(db).map((service) => service.id)).toEqual([serviceColor.id, serviceCut.id]);
      expect(countRows(db, 'appointment_phases')).toBe(4);
    });

    it('refuses an order that does not name every stored item exactly once', () => {
      const db = openTestDatabase();
      bootstrapPersistence(db, createTestSeed);

      expect(refusal(() => reorderAppointmentItems(db, appointmentLea.id, [CUT]))).toBe('ORDER_MISMATCH');
      expect(refusal(() => reorderAppointmentItems(db, appointmentLea.id, [CUT, CUT]))).toBe('ORDER_MISMATCH');
      expect(refusal(() => reorderAppointmentItems(db, appointmentLea.id, [CUT, COLOR, 'ghost']))).toBe(
        'ORDER_MISMATCH',
      );
      expect(refusal(() => reorderAppointmentItems(db, 'unknown', [CUT, COLOR]))).toBe('APPOINTMENT_NOT_FOUND');
      expect(reload(db).items.map((item) => item.id)).toEqual([COLOR, CUT]);
    });

    it('removes one item with its phases, normalizes the remaining order, and survives a restart', () => {
      const db = openTestDatabase();
      bootstrapPersistence(db, createTestSeed);

      removeAppointmentItem(db, appointmentLea.id, COLOR);

      const reloaded = reload(db);
      expect(reloaded.items.map((item) => [item.id, item.order])).toEqual([[CUT, 0]]);
      expect(countRows(db, 'appointment_items')).toBe(1);
      expect(countRows(db, 'appointment_phases')).toBe(1);
      expect(reloaded.notes).toBe(appointmentLea.notes);
      expect(reloaded.startAt.getTime()).toBe(appointmentLea.startAt.getTime());
      // The catalog keeps every Service and its phases.
      expect(loadServices(db).find((service) => service.id === serviceColor.id)?.phases).toHaveLength(3);
    });

    it('never removes the last item and refuses unknown items — nothing changes', () => {
      const db = openTestDatabase();
      bootstrapPersistence(db, createTestSeed);
      removeAppointmentItem(db, appointmentLea.id, COLOR);

      expect(refusal(() => removeAppointmentItem(db, appointmentLea.id, CUT))).toBe('LAST_ITEM');
      expect(refusal(() => removeAppointmentItem(db, appointmentLea.id, 'ghost'))).toBe('ITEM_NOT_FOUND');
      expect(reload(db).items.map((item) => item.id)).toEqual([CUT]);
      expect(countRows(db, 'appointment_phases')).toBe(1);
    });

    it('refuses both edits once the Appointment reached a terminal outcome', () => {
      const db = openTestDatabase();
      bootstrapPersistence(db, createTestSeed);
      updateAppointment(db, {
        ...appointmentLea,
        status: 'CANCELLED',
        cancellation: { cancelledAt: new Date(2026, 8, 10, 9), cancelledBy: 'BUSINESS' },
      });

      expect(refusal(() => reorderAppointmentItems(db, appointmentLea.id, [CUT, COLOR]))).toBe(
        'APPOINTMENT_NOT_EDITABLE',
      );
      expect(refusal(() => removeAppointmentItem(db, appointmentLea.id, COLOR))).toBe('APPOINTMENT_NOT_EDITABLE');
      expect(reload(db).items.map((item) => [item.id, item.order])).toEqual([
        [COLOR, 0],
        [CUT, 1],
      ]);
    });

    it('rolls a removal back entirely when a later write of the transaction fails', () => {
      const native = openTestDatabase();
      const db: typeof native = {
        ...native,
        runSync: (sql, params) => {
          if (sql.startsWith('UPDATE appointment_items SET item_order')) throw new Error('disk full');
          return native.runSync(sql, params);
        },
      };
      bootstrapPersistence(db, createTestSeed);

      expect(() => removeAppointmentItem(db, appointmentLea.id, COLOR)).toThrow('disk full');

      expect(reload(db).items.map((item) => item.id)).toEqual([COLOR, CUT]);
      expect(countRows(db, 'appointment_phases')).toBe(4);
    });
  });
});
