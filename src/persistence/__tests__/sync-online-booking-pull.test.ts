// BeautIzzy — an online booking reaches the device through the EXISTING pull
// (docs/architecture/ONLINE_BOOKING.md §9.4, CLOUD_SYNC.md §16).
//
// The server creates the Client and the Appointment itself
// (`online_booking_create_booking`); no device ever pushed them. The payloads
// below are the wire shapes the real pull function returned for such a
// booking — a UUID Client with identity and contact only, a UUID Appointment
// stamped SCHEDULED for the app's staff identifier, one `<appointment>-item-0`
// item and the catalog phases under their own ids. This suite runs them
// through the real validator, the real pull worker and the real stores: the
// booking must appear like any appointment made on another device, be
// editable, protect its Client, and echo nothing back.

import { currentStaffMemberId } from '@/features/appointments/current-staff-member';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { updateAppointment } from '../stores/appointments';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { ClientDeleteConflictError, deleteClientPermanently, insertClient } from '../stores/clients';
import { approveInitialUpload } from '../sync/bootstrap';
import { countSyncOutboxRows } from '../sync/outbox';
import { PULL_OVERLAP_MS, readSyncPullCursor } from '../sync/pull-cursor';
import { createSyncPushWorker, didSyncRunChangeLocalData } from '../sync/push-worker';
import type { RemoteAppointmentPayload, RemoteClientPayload } from '../sync/remote-gateway';
import { readAcknowledgedRemoteVersion } from '../sync/state';
import { createFakeSyncRemote, type FakeSyncRemote } from '../testing/fake-sync-remote';
import { createTestSeed, REMOTE_BUSINESS_ID, remoteBusinessProfile } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const NOW = new Date('2026-11-13T08:00:00.000Z');

const ONLINE_CLIENT_ID = '94403108-01e7-42dd-8273-74691f6188a3';
const ONLINE_APPOINTMENT_ID = 'acff194f-6d1a-436d-8a77-a6de2289910b';

/** The Client a booking creates: identity and contact only — no note, no birthday, no consent. */
const onlineClient: RemoteClientPayload = {
  first_name: 'Marie',
  last_name: 'Dupont',
  phone: '06 12 34 56 78',
  email: 'marie.dupont@example.test',
  birthday: null,
  notes: null,
  photo_path: null,
  sms_marketing_consent: null,
  sms_marketing_consent_updated_at: null,
  sms_marketing_consent_source: null,
  archived_at: null,
};

/** The Appointment a booking creates, exactly as the pull returned it. */
function onlineAppointment(clientId: string): RemoteAppointmentPayload {
  return {
    client_id: clientId,
    staff_member_id: 'staff-amelie',
    start_at: '2026-11-16T13:00:00.000Z',
    status: 'SCHEDULED',
    notes: 'Réservation en ligne',
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    no_show_recorded_at: null,
    paid_at: null,
    card_amount_cents: null,
    cash_amount_cents: null,
    discount_percent: null,
    discount_amount_cents: null,
    client_reminder_enabled: null,
    items: [
      {
        id: `${ONLINE_APPOINTMENT_ID}-item-0`,
        item_order: 0,
        service_id: 'tech-couleur',
        service_option_id: null,
        service_name: 'Couleur',
        service_type: 'TECHNIQUE',
        price_cents: 8900,
        phases: [
          { id: 'tech-couleur-phase-0', position: 0, name: 'Application', duration_minutes: 30, requires_staff: true },
          { id: 'tech-couleur-phase-1', position: 1, name: 'Temps de pose', duration_minutes: 45, requires_staff: false },
          { id: 'tech-couleur-phase-2', position: 2, name: 'Rinçage', duration_minutes: 15, requires_staff: true },
        ],
      },
    ],
  };
}

function worker(db: SourisDatabase, remote: FakeSyncRemote) {
  const instance = createSyncPushWorker({ database: db, gateway: remote, now: () => NOW });
  return () => instance.run(REMOTE_BUSINESS_ID);
}

/** The professional's device: seeded, bound, uploaded and idle. */
async function openSyncedDevice(remote: FakeSyncRemote) {
  const db = openTestDatabase();
  bootstrapPersistence(db, createTestSeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
  const run = worker(db, remote);
  expect(await run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD' });
  expect(countSyncOutboxRows(db)).toBe(0);
  remote.clearRequests();
  return { db, run };
}

/** What `online_booking_create_booking` commits: the Client, then the Appointment. */
function serverBooks(remote: FakeSyncRemote, clientId = ONLINE_CLIENT_ID) {
  remote.advanceClock(60_000);
  remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', clientId, onlineClient);
  return remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'APPOINTMENT', ONLINE_APPOINTMENT_ID, onlineAppointment(clientId));
}

describe('an online booking pulled by the device', () => {
  it('appears as a normal Appointment with its Client, acknowledged, with nothing echoed back', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedDevice(remote);
    const version = serverBooks(remote);

    const result = await run();
    expect(result).toMatchObject({
      pushed: 0,
      pull: { status: 'PULLED', applied: 2, deleted: 0, failed: 0, conflicts: [], cursorAdvanced: true },
    });
    expect(didSyncRunChangeLocalData(result)).toBe(true);

    const snapshot = loadSnapshot(db);
    const appointment = snapshot.appointments.find((candidate) => candidate.id === ONLINE_APPOINTMENT_ID);
    expect(appointment).toMatchObject({
      businessId: REMOTE_BUSINESS_ID,
      clientId: ONLINE_CLIENT_ID,
      staffMemberId: currentStaffMemberId,
      status: 'SCHEDULED',
      notes: 'Réservation en ligne',
      startAt: new Date('2026-11-16T13:00:00.000Z'),
    });
    expect(appointment?.items).toEqual([
      {
        id: `${ONLINE_APPOINTMENT_ID}-item-0`,
        serviceId: 'tech-couleur',
        order: 0,
        serviceName: 'Couleur',
        serviceType: 'TECHNIQUE',
        price: 89,
        phases: [
          { id: 'tech-couleur-phase-0', name: 'Application', durationMinutes: 30, requiresStaff: true },
          { id: 'tech-couleur-phase-1', name: 'Temps de pose', durationMinutes: 45, requiresStaff: false },
          { id: 'tech-couleur-phase-2', name: 'Rinçage', durationMinutes: 15, requiresStaff: true },
        ],
      },
    ]);
    // Never paid, discounted, cancelled or flagged by the server.
    expect(appointment?.payment).toBeUndefined();
    expect(appointment?.discount).toBeUndefined();
    expect(appointment?.cancellation).toBeUndefined();
    expect(appointment?.clientReminderEnabled).toBeUndefined();

    expect(snapshot.clients.find((client) => client.id === ONLINE_CLIENT_ID)).toEqual({
      id: ONLINE_CLIENT_ID,
      firstName: 'Marie',
      lastName: 'Dupont',
      phone: '06 12 34 56 78',
      email: 'marie.dupont@example.test',
    });

    expect(
      readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, { aggregateType: 'APPOINTMENT', aggregateId: ONLINE_APPOINTMENT_ID })
        ?.remoteVersion,
    ).toBe(version);
    // No echo: the booking is not the device's change.
    expect(countSyncOutboxRows(db)).toBe(0);
    expect(remote.requests).toEqual([]);
    expect(await run()).toMatchObject({ pushed: 0, pull: { applied: 0, deleted: 0, failed: 0 } });
    expect(remote.requests).toEqual([]);
  });

  it('is then hers: she moves it and the push applies under the pulled version', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedDevice(remote);
    const version = serverBooks(remote);
    await run();

    const appointment = loadSnapshot(db).appointments.find((candidate) => candidate.id === ONLINE_APPOINTMENT_ID)!;
    updateAppointment(db, { ...appointment, startAt: new Date('2026-11-16T14:00:00.000Z') });

    expect(await run()).toMatchObject({ pushed: 1, conflicts: [] });
    const stored = remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', ONLINE_APPOINTMENT_ID)!;
    expect(stored.syncVersion).toBeGreaterThan(version);
    expect(stored.payload).toMatchObject({
      start_at: '2026-11-16T14:00:00.000Z',
      status: 'SCHEDULED',
      notes: 'Réservation en ligne',
      client_id: ONLINE_CLIENT_ID,
    });
  });

  it('protects its Client like any history: the local deletion guard refuses', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedDevice(remote);
    serverBooks(remote);
    await run();

    expect(() => deleteClientPermanently(db, ONLINE_CLIENT_ID)).toThrow(ClientDeleteConflictError);
    expect(loadSnapshot(db).clients.some((client) => client.id === ONLINE_CLIENT_ID)).toBe(true);
    expect(countSyncOutboxRows(db)).toBe(0);
  });

  it('converges when she deleted the matched Client before pulling the booking: the server moved it to a new Client', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedDevice(remote);

    // A Client she typed herself, synchronized, without any appointment.
    insertClient(db, { id: 'client-typed', firstName: 'Marie', lastName: 'Dupont', email: 'marie.dupont@example.test' });
    expect(await run()).toMatchObject({ pushed: 1 });

    // The customer books online: the server matches that Client. The device has not pulled yet …
    remote.advanceClock(60_000);
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'APPOINTMENT', ONLINE_APPOINTMENT_ID, onlineAppointment('client-typed'));
    // … and deletes the Client, which nothing references locally.
    deleteClientPermanently(db, 'client-typed');

    // The push tombstones it; in the same transaction the server (clients_online_booking_reattach)
    // creates a Client from the booking contact and moves the Appointment to it.
    remote.beforePull(() => {
      remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', ONLINE_CLIENT_ID, onlineClient);
      remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'APPOINTMENT', ONLINE_APPOINTMENT_ID, onlineAppointment(ONLINE_CLIENT_ID));
    });
    const result = await run();
    remote.beforePull(undefined);

    expect(result).toMatchObject({
      pushed: 1,
      conflicts: [],
      pull: { status: 'PULLED', applied: 2, failed: 0, conflicts: [], cursorAdvanced: true },
    });
    const snapshot = loadSnapshot(db);
    expect(snapshot.clients.some((client) => client.id === 'client-typed')).toBe(false);
    expect(snapshot.appointments.find((candidate) => candidate.id === ONLINE_APPOINTMENT_ID)?.clientId).toBe(ONLINE_CLIENT_ID);
    expect(snapshot.clients.find((client) => client.id === ONLINE_CLIENT_ID)?.email).toBe('marie.dupont@example.test');
    expect(readSyncPullCursor(db, REMOTE_BUSINESS_ID)).toBeDefined();
    expect(countSyncOutboxRows(db)).toBe(0);
  });

  it('converges on a device that ALREADY held the booking when another device deleted its Client', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedDevice(remote);

    // A Client she typed here, synchronized; the customer books online and the
    // server matches it; this device pulls the booking under that Client.
    insertClient(db, { id: 'client-typed', firstName: 'Marie', lastName: 'Dupont', email: 'marie.dupont@example.test' });
    expect(await run()).toMatchObject({ pushed: 1 });
    remote.advanceClock(60_000);
    const booked = remote.writeFromElsewhere(
      REMOTE_BUSINESS_ID,
      'APPOINTMENT',
      ONLINE_APPOINTMENT_ID,
      onlineAppointment('client-typed'),
    );
    expect(await run()).toMatchObject({ pull: { applied: 1, failed: 0 } });
    const cursorBefore = readSyncPullCursor(db, REMOTE_BUSINESS_ID)!;

    // Her OTHER device, which had not pulled it, deletes the Client. In that
    // one transaction the server tombstones it, creates a Client from the
    // booking contact and moves the Appointment to it — a newer revision.
    remote.advanceClock(60_000);
    remote.tombstoneFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', 'client-typed');
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', ONLINE_CLIENT_ID, onlineClient);
    const moved = remote.writeFromElsewhere(
      REMOTE_BUSINESS_ID,
      'APPOINTMENT',
      ONLINE_APPOINTMENT_ID,
      onlineAppointment(ONLINE_CLIENT_ID),
    );
    expect(moved).toBeGreaterThan(booked);

    // ONE pull, under the usual cursor: the new Client and the move are applied
    // first, so the tombstone then finds nothing referencing the old Client.
    const result = await run();
    expect(result).toMatchObject({
      pushed: 0,
      conflicts: [],
      pull: { status: 'PULLED', applied: 2, deleted: 1, failed: 0, conflicts: [], cursorAdvanced: true },
    });
    expect(remote.pulls[remote.pulls.length - 1]).toEqual(new Date(cursorBefore.getTime() - PULL_OVERLAP_MS));

    const snapshot = loadSnapshot(db);
    expect(snapshot.clients.some((client) => client.id === 'client-typed')).toBe(false);
    expect(snapshot.appointments.find((candidate) => candidate.id === ONLINE_APPOINTMENT_ID)?.clientId).toBe(ONLINE_CLIENT_ID);
    expect(
      readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, { aggregateType: 'APPOINTMENT', aggregateId: ONLINE_APPOINTMENT_ID })
        ?.remoteVersion,
    ).toBe(moved);
    expect(countSyncOutboxRows(db)).toBe(0);
  });
});
