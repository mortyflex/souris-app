// BeautIzzy — a late checkout dated « Jour du rendez-vous », recorded OFFLINE and
// synced the next day: `paid_at` is the instant chosen on the device, carried
// unchanged through push, pull and a fresh-device restore — never the record,
// push or server insertion time — so the Caisse day never moves
// (docs/domain/APPOINTMENTS.md §25b).

import { getAppointmentPaymentInstant, type Appointment } from '@/domain/appointments';
import { getCashRegisterDaySummary } from '@/domain/cash-register';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { checkoutAppointment } from '../stores/appointments';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { approveInitialRestore, approveInitialUpload } from '../sync/bootstrap';
import { countSyncOutboxRows } from '../sync/outbox';
import { createSyncPushWorker } from '../sync/push-worker';
import { createFakeSyncRemote, type FakeSyncRemote } from '../testing/fake-sync-remote';
import {
  appointmentLea,
  createTestSeed,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

/** Completed automatically on 20 July, never checked out. */
const july20: Appointment = { ...appointmentLea, startAt: new Date(2026, 6, 20, 9, 30), status: 'COMPLETED' };
const UPLOADED_AT = new Date(2026, 8, 27, 9, 0);
const RECORDED_OFFLINE_AT = new Date(2026, 8, 28, 18, 0);
const SYNCED_AT = new Date(2026, 8, 29, 9, 0);
const LEA_DUE_CENTS = 13500;

function worker(db: SourisDatabase, remote: FakeSyncRemote, now: Date) {
  const instance = createSyncPushWorker({ database: db, gateway: remote, now: () => now });
  return () => instance.run(REMOTE_BUSINESS_ID);
}

function caisseDay(db: SourisDatabase, day: Date): number {
  const { appointments, sales, appointmentDeposits } = loadSnapshot(db);
  return getCashRegisterDaySummary({ appointments, sales, deposits: appointmentDeposits }, day).totalCents;
}

describe('late checkout business date — offline, then synced the next day', () => {
  it('keeps paid_at on the appointment day through push, pull and restore', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = openTestDatabase();
    bootstrapPersistence(source, () => createTestSeed({ appointments: [july20] }));
    bindLocalDatabaseToBusiness(source, remoteBusinessProfile);
    expect(approveInitialUpload(source, REMOTE_BUSINESS_ID, UPLOADED_AT).status).toBe('APPROVED');
    expect(await worker(source, remote, UPLOADED_AT)()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', failed: 0 });

    // 28 September, offline: « Jour du rendez-vous » chosen in the checkout sheet.
    const paidAt = getAppointmentPaymentInstant(july20, 'APPOINTMENT_DAY', RECORDED_OFFLINE_AT);
    checkoutAppointment(source, july20.id, { paidAt, cardAmountCents: 4000, cashAmountCents: 9500 });
    expect(countSyncOutboxRows(source)).toBe(1);
    expect(caisseDay(source, new Date(2026, 6, 20))).toBe(LEA_DUE_CENTS);
    expect(caisseDay(source, RECORDED_OFFLINE_AT)).toBe(0);

    // 29 September: back online, the outbox is pushed.
    expect(await worker(source, remote, SYNCED_AT)()).toMatchObject({ status: 'PUSHED', failed: 0, conflicts: [] });
    expect(countSyncOutboxRows(source)).toBe(0);
    expect(loadSnapshot(source).appointments[0]?.payment?.paidAt).toEqual(paidAt);

    // Another device restores the Business: the same instant, the same Caisse day.
    const restored = openTestDatabase();
    bootstrapPersistence(restored, () => createTestSeed({ clients: [], services: [], products: [], appointments: [] }));
    bindLocalDatabaseToBusiness(restored, remoteBusinessProfile);
    const run = worker(restored, remote, SYNCED_AT);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
    expect(approveInitialRestore(restored, REMOTE_BUSINESS_ID, SYNCED_AT).status).toBe('APPROVED');
    expect(await run()).toMatchObject({ status: 'RESTORED' });

    const restoredAppointment = loadSnapshot(restored).appointments.find((appointment) => appointment.id === july20.id);
    expect(restoredAppointment?.payment).toEqual({ paidAt, cardAmountCents: 4000, cashAmountCents: 9500 });
    expect(caisseDay(restored, new Date(2026, 6, 20))).toBe(LEA_DUE_CENTS);
    expect(caisseDay(restored, RECORDED_OFFLINE_AT)).toBe(0);
    expect(caisseDay(restored, SYNCED_AT)).toBe(0);
  });
});
