// BeautIzzy — business mutation protection (BeautIzzy Plus, Phase 4)
//
// The real (app) business providers under the real BusinessAccessProvider,
// with enforcement ENABLED and a scripted store:
//
//   * which entitlements permit mutations, which refuse them, over time;
//   * a refused mutation changes nothing — no row, no outbox entry, no upload,
//     no gateway call, no state — whole or not at all;
//   * access changes are observed without a remount, in both directions;
//   * reading, synchronization (queued pushes, pulls), automatic appointment
//     finalization, consent withdrawal and session housekeeping stay
//     available under read-only access;
//   * one account never inherits another's access;
//   * enforcement disabled refuses nothing.
//
// The production constant stays untouched: the harness enables enforcement
// explicitly, test by test.

import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import type { SubscriptionStatus, SubscriptionVerification } from '@/domain/access';
import type { Appointment } from '@/domain/appointments';
import type { CalendarBlock } from '@/domain/calendar-blocks';
import type { Client } from '@/domain/clients';
import type { SaleDraft } from '@/domain/sales';
import { type BusinessAccessValue, useBusinessAccess } from '@/features/access/session/BusinessAccessProvider';
import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from '@/features/appointments/session/AppointmentSessionProvider';
import type { AppointmentSessionValue } from '@/features/appointments/session/types';
import { useAuth, type AuthSessionValue } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import {
  CalendarBlockSessionProvider,
  useCalendarBlockSession,
  type CalendarBlockSessionValue,
} from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { runClientImport } from '@/features/clients/import/run-client-import';
import { ClientSessionProvider, useClientSession } from '@/features/clients/session/ClientSessionProvider';
import type { ClientSessionValue } from '@/features/clients/session/types';
import {
  CommunicationPreferencesProvider,
  useCommunicationPreferences,
  type CommunicationPreferencesValue,
} from '@/features/communications/preferences/CommunicationPreferencesProvider';
import { CommunicationsGatewayProvider } from '@/features/communications/session/CommunicationsGatewayProvider';
import {
  createFakeCommunicationsGateway,
  type FakeCommunicationsGateway,
} from '@/features/communications/testing/fake-communications-gateway';
import { ProductCatalogProvider, useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import type { ProductCatalogSessionValue } from '@/features/products/session/types';
import { SaleSessionProvider, useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import type { SaleSessionValue } from '@/features/sales/session/types';
import { ServiceCatalogProvider, useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import type { ServiceCatalogSessionValue } from '@/features/services/session/types';
import { bootstrapPersistence, loadSnapshot } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import type { FirstRunSeed } from '@/persistence/seed';
import { loadAppointments } from '@/persistence/stores/appointments';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import { loadClients } from '@/persistence/stores/clients';
import { findProduct } from '@/persistence/stores/products';
import { loadSales } from '@/persistence/stores/sales';
import { approveInitialUpload } from '@/persistence/sync/bootstrap';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { createSyncPushWorker } from '@/persistence/sync/push-worker';
import { createFakeBusinessMediaRemote } from '@/persistence/testing/fake-business-media-remote';
import { createFakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import {
  appointmentLea,
  BUSINESS_ID,
  clientLea,
  createTestSeed,
  productMask,
  productSerum,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
  serviceCut,
} from '@/persistence/testing/fixtures';
import { createMemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { BusinessMediaProvider } from '@/providers/BusinessMediaProvider';
import { usePersistence, type PersistenceValue } from '@/providers/PersistenceProvider';
import {
  TestPersistenceProvider,
  type TestBusinessAccessOptions,
} from '@/providers/testing/TestPersistenceProvider';

import { SUBSCRIPTION_ENFORCEMENT } from '../enforcement';
import { createFakeSubscriptionSource, UNAVAILABLE_VERIFICATION } from '../testing/fake-subscription-source';
import { BusinessAccessDeniedError, isBusinessAccessDeniedError } from '../write-guard';

// A refused Product save never reaches the photo pipeline; the real one needs
// native image tooling anyway.
const mockPrepareProductPhoto = jest.fn();
jest.mock('@/features/products/images/product-photo-processing', () => ({
  prepareProductPhoto: (uri: string) => mockPrepareProductPhoto(uri),
}));

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const GRACE_MS = 72 * HOUR_MS;

const NOW = new Date('2026-10-15T09:00:00.000Z');
const FUTURE = new Date('2026-11-01T09:00:00.000Z');

const verified = (status: SubscriptionStatus): SubscriptionVerification => ({ kind: 'verified', status });
const ACTIVE = verified({ kind: 'active', plan: 'monthly', expiresAt: FUTURE });
const TRIAL = verified({ kind: 'trial', plan: 'annual', expiresAt: FUTURE });
const COMPLIMENTARY = verified({ kind: 'complimentary' });
const COMPLIMENTARY_DATED = verified({ kind: 'complimentary', expiresAt: FUTURE });
const CANCELLED_UNTIL_FUTURE = verified({ kind: 'cancelled-active', plan: 'monthly', expiresAt: FUTURE });
const EXPIRED = verified({ kind: 'expired' });
const NEVER = verified({ kind: 'never' });

/** An Appointment far ahead: never finalized by the previous-day rule, editable in every test. */
const FUTURE_APPOINTMENT_ID = 'appointment-future';
const futureAppointment: Appointment = {
  ...appointmentLea,
  id: FUTURE_APPOINTMENT_ID,
  startAt: new Date(2030, 5, 10, 10),
  items: appointmentLea.items.map((item, index) => ({
    ...item,
    id: `${FUTURE_APPOINTMENT_ID}-item-${index}`,
    phases: item.phases.map((phase) => ({ ...phase, id: `${FUTURE_APPOINTMENT_ID}-${phase.id}` })),
  })),
};
/** 95 € + 40 € of item snapshots: what a checkout must settle exactly. */
const FUTURE_APPOINTMENT_DUE_CENTS = 13_500;

const seed = (): FirstRunSeed => createTestSeed({ appointments: [appointmentLea, futureAppointment] });

/** Bound to the remote Business, like a synchronizing device: every write records its sync intent. */
function openBoundDatabase(): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, seed);
  bindLocalDatabaseToBusiness(database, remoteBusinessProfile);
  return database;
}

const newClient = (id: string): Client => ({ id, firstName: 'Nouvelle', lastName: id });

const calendarBlock = (id: string): CalendarBlock => ({
  id,
  businessId: BUSINESS_ID,
  staffMemberId: 'staff-amelie',
  startAt: new Date(2030, 5, 12, 12),
  endAt: new Date(2030, 5, 12, 13),
  reason: 'Pause',
});

const standaloneSale = (id: string): SaleDraft => ({
  id,
  businessId: BUSINESS_ID,
  clientId: clientLea.id,
  payment: { cardAmountCents: 3200, cashAmountCents: 0 },
  completedAt: new Date(),
  lines: [{ id: `${id}-line`, productId: productSerum.id, quantity: 1 }],
});

interface Sessions {
  readonly clients: ClientSessionValue;
  readonly services: ServiceCatalogSessionValue;
  readonly products: ProductCatalogSessionValue;
  readonly sales: SaleSessionValue;
  readonly appointments: AppointmentSessionValue;
  readonly calendarBlocks: CalendarBlockSessionValue;
  readonly preferences: CommunicationPreferencesValue;
  readonly access: BusinessAccessValue;
  readonly auth: AuthSessionValue;
  readonly persistence: PersistenceValue;
}

let latest: Sessions | undefined;
let mounts = 0;

/** What every screen sees; the latest context values are captured after each commit. */
function Probe() {
  const sessions: Sessions = {
    clients: useClientSession(),
    services: useServiceCatalog(),
    products: useProductCatalog(),
    sales: useSaleSession(),
    appointments: useAppointmentSession(),
    calendarBlocks: useCalendarBlockSession(),
    preferences: useCommunicationPreferences(),
    access: useBusinessAccess(),
    auth: useAuth(),
    persistence: usePersistence(),
  };
  useEffect(() => {
    latest = sessions;
  });
  useEffect(() => {
    mounts += 1;
  }, []);
  const { access } = sessions.access;
  return (
    <Text testID="state">
      {[
        `${access.mode}:${access.reason}`,
        `clients:${sessions.clients.clients.length}`,
        `services:${sessions.services.services.length}`,
        `products:${sessions.products.products.map((product) => `${product.id}=${product.stockQuantity}`).join('+')}`,
        `sales:${sessions.sales.sales.length}`,
        `appointments:${sessions.appointments.appointments.map(({ appointment }) => `${appointment.id}=${appointment.status}`).join('+')}`,
        `deposits:${sessions.appointments.deposits.length}`,
        `blocks:${sessions.calendarBlocks.calendarBlocks.length}`,
      ].join('|')}
    </Text>
  );
}

type RenderedView = Awaited<ReturnType<typeof render>>;
const stateOf = (view: RenderedView) => view.getByTestId('state').props.children as string;
const sessions = () => latest!;

interface Harness {
  readonly access: TestBusinessAccessOptions;
  readonly database?: SourisDatabase;
  readonly communications?: FakeCommunicationsGateway;
}

async function renderApp({ access, database = openBoundDatabase(), communications = createFakeCommunicationsGateway() }: Harness) {
  const files = createMemoryLocalFiles();
  const media = createFakeBusinessMediaRemote(files);
  const view = await render(
    <TestPersistenceProvider access={access} createSeed={seed} database={database} files={files}>
      <BusinessMediaProvider remote={media}>
        <CommunicationsGatewayProvider gateway={communications}>
          <ClientSessionProvider>
            <ServiceCatalogProvider>
              <ProductCatalogProvider>
                <SaleSessionProvider>
                  <AppointmentSessionProvider>
                    <CalendarBlockSessionProvider>
                      <CommunicationPreferencesProvider>
                        <Probe />
                      </CommunicationPreferencesProvider>
                    </CalendarBlockSessionProvider>
                  </AppointmentSessionProvider>
                </SaleSessionProvider>
              </ProductCatalogProvider>
            </ServiceCatalogProvider>
          </ClientSessionProvider>
        </CommunicationsGatewayProvider>
      </BusinessMediaProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return { view, database, files, media, communications };
}

/** A store answering `first` at launch, then whatever a test emits or scripts. */
function sourceAnswering(first: SubscriptionVerification) {
  const source = createFakeSubscriptionSource();
  source.respondWith(first);
  return source;
}

/** An injectable clock a test moves by hand. */
function clockAt(instant: Date) {
  let now = instant;
  return { clock: () => now, moveTo: (next: Date) => void (now = next) };
}

/** Runs a mutation (sync or async) and returns what it threw, or undefined. */
async function attempt(task: () => unknown): Promise<unknown> {
  let error: unknown;
  await act(async () => {
    try {
      await task();
    } catch (caught) {
      error = caught;
    }
  });
  return error;
}

/** Every observable the protection must leave untouched. */
function fingerprint(database: SourisDatabase, view: RenderedView) {
  return { snapshot: loadSnapshot(database), outbox: countSyncOutboxRows(database), state: stateOf(view) };
}

/** Every user-initiated mutation the business providers expose, with valid arguments. */
const MUTATIONS: readonly { readonly name: string; readonly run: (s: Sessions) => unknown }[] = [
  { name: 'clients.addClient', run: (s) => s.clients.addClient(newClient('client-new')) },
  { name: 'clients.addClients', run: (s) => s.clients.addClients([newClient('client-import-1'), newClient('client-import-2')]) },
  { name: 'clients.updateClient', run: (s) => s.clients.updateClient({ ...clientLea, firstName: 'Léana' }) },
  { name: 'clients.setClientPhoto', run: (s) => s.clients.setClientPhoto(clientLea.id, `${BUSINESS_ID}/clients/${clientLea.id}/photo.jpg`) },
  { name: 'clients.archiveClient', run: (s) => s.clients.archiveClient(clientLea.id) },
  { name: 'clients.restoreClient', run: (s) => s.clients.restoreClient(clientLea.id) },
  { name: 'clients.deleteClientPermanently', run: (s) => s.clients.deleteClientPermanently(clientLea.id) },
  { name: 'services.addService', run: (s) => s.services.addService({ ...serviceCut, id: 'service-new' }) },
  { name: 'services.updateService', run: (s) => s.services.updateService({ ...serviceCut, price: 50 }) },
  { name: 'services.setServiceActive', run: (s) => s.services.setServiceActive(serviceCut.id, false) },
  { name: 'services.deleteService', run: (s) => s.services.deleteService(serviceCut.id) },
  { name: 'products.addProduct', run: (s) => s.products.addProduct({ ...productSerum, id: 'product-new' }) },
  {
    name: 'products.addProduct (with a new photo)',
    run: (s) => s.products.addProduct({ ...productSerum, id: 'product-new-photo' }, { kind: 'replace', uri: 'file:///tmp/photo.jpg' }),
  },
  { name: 'products.updateProduct', run: (s) => s.products.updateProduct({ ...productSerum, price: 40 }) },
  {
    name: 'products.updateProduct (with a new photo)',
    run: (s) => s.products.updateProduct(productSerum, { kind: 'replace', uri: 'file:///tmp/photo.jpg' }),
  },
  { name: 'products.setProductActive', run: (s) => s.products.setProductActive(productSerum.id, false) },
  { name: 'products.setProductStock', run: (s) => s.products.setProductStock(productSerum.id, 9) },
  { name: 'products.deleteProduct', run: (s) => s.products.deleteProduct(productSerum.id) },
  { name: 'sales.completeSale', run: (s) => s.sales.completeSale(standaloneSale('sale-new')) },
  {
    name: 'sales.deleteAppointmentProduct',
    run: (s) =>
      s.sales.deleteAppointmentProduct(FUTURE_APPOINTMENT_ID, {
        productId: productMask.id,
        productName: productMask.name,
        unitPrice: productMask.price,
      }),
  },
  { name: 'appointments.addAppointment', run: (s) => s.appointments.addAppointment({ appointment: { ...futureAppointment, id: 'appointment-new', items: [] } }) },
  {
    name: 'appointments.addAppointment (with a deposit already received)',
    run: (s) =>
      s.appointments.addAppointment(
        { appointment: { ...futureAppointment, id: 'appointment-new-deposit' } },
        { id: 'deposit-at-creation', amountCents: 3000, paymentMethod: 'CASH' },
      ),
  },
  { name: 'appointments.updateAppointment', run: (s) => s.appointments.updateAppointment({ appointment: { ...futureAppointment, notes: 'changed' } }) },
  {
    name: 'appointments.updateAppointmentItemTiming',
    run: (s) =>
      s.appointments.updateAppointmentItemTiming(FUTURE_APPOINTMENT_ID, `${FUTURE_APPOINTMENT_ID}-item-0`, [
        { phaseId: `${FUTURE_APPOINTMENT_ID}-color-processing`, durationMinutes: 40 },
      ]),
  },
  {
    name: 'appointments.reorderAppointmentItems',
    run: (s) => s.appointments.reorderAppointmentItems(FUTURE_APPOINTMENT_ID, [`${FUTURE_APPOINTMENT_ID}-item-1`, `${FUTURE_APPOINTMENT_ID}-item-0`]),
  },
  { name: 'appointments.removeAppointmentItem', run: (s) => s.appointments.removeAppointmentItem(FUTURE_APPOINTMENT_ID, `${FUTURE_APPOINTMENT_ID}-item-1`) },
  { name: 'appointments.setAppointmentDiscount', run: (s) => s.appointments.setAppointmentDiscount(FUTURE_APPOINTMENT_ID, { type: 'PERCENT', percent: 10 }) },
  {
    name: 'appointments.checkoutAppointment',
    run: (s) => s.appointments.checkoutAppointment(FUTURE_APPOINTMENT_ID, { cardAmountCents: FUTURE_APPOINTMENT_DUE_CENTS, cashAmountCents: 0 }),
  },
  { name: 'appointments.completePrepaidAppointment', run: (s) => s.appointments.completePrepaidAppointment(FUTURE_APPOINTMENT_ID) },
  {
    name: 'appointments.updateAppointmentPayment',
    run: (s) => s.appointments.updateAppointmentPayment(FUTURE_APPOINTMENT_ID, { cardAmountCents: 0, cashAmountCents: FUTURE_APPOINTMENT_DUE_CENTS }),
  },
  { name: 'appointments.deleteAppointment', run: (s) => s.appointments.deleteAppointment(FUTURE_APPOINTMENT_ID) },
  {
    name: 'appointments.recordAppointmentDeposit',
    run: (s) => s.appointments.recordAppointmentDeposit({ id: 'deposit-new', appointmentId: FUTURE_APPOINTMENT_ID, amountCents: 2000, paymentMethod: 'CARD' }),
  },
  { name: 'appointments.voidAppointmentDeposit', run: (s) => s.appointments.voidAppointmentDeposit('deposit-new') },
  { name: 'calendarBlocks.addCalendarBlock', run: (s) => s.calendarBlocks.addCalendarBlock(calendarBlock('block-new')) },
  { name: 'calendarBlocks.updateCalendarBlock', run: (s) => s.calendarBlocks.updateCalendarBlock(calendarBlock('block-new')) },
  { name: 'calendarBlocks.deleteCalendarBlock', run: (s) => s.calendarBlocks.deleteCalendarBlock('block-new') },
  {
    name: 'communications.enableEmailReminders',
    run: (s) => s.preferences.update({ emailRemindersEnabled: true, replyToEmail: 'salon@example.test' }),
  },
];

describe('business mutation protection (enforcement enabled)', () => {
  beforeEach(() => {
    mounts = 0;
    mockPrepareProductPhoto.mockClear();
  });

  afterEach(() => {
    latest = undefined;
  });

  describe('which entitlements permit mutations', () => {
    it.each([
      ['active', ACTIVE],
      ['trial', TRIAL],
      ['complimentary without an end', COMPLIMENTARY],
      ['complimentary with an end ahead', COMPLIMENTARY_DATED],
      ['cancelled-active before its end', CANCELLED_UNTIL_FUTURE],
    ])('%s: a mutation is written, queued for sync and reflected in state', async (_label, verification) => {
      const { view, database } = await renderApp({
        access: { enforcement: 'enabled', source: sourceAnswering(verification), clock: () => NOW },
      });
      expect(stateOf(view)).toContain('full:entitled');
      const outboxBefore = countSyncOutboxRows(database);

      expect(await attempt(() => sessions().clients.addClient(newClient('client-new')))).toBeUndefined();

      expect(loadClients(database).some((client) => client.id === 'client-new')).toBe(true);
      expect(countSyncOutboxRows(database)).toBe(outboxBefore + 1);
      expect(stateOf(view)).toContain('clients:2');
    });

    it.each([
      ['expired', EXPIRED, 'subscription-expired'],
      ['never subscribed', NEVER, 'never-subscribed'],
      ['verification unavailable with no proof', UNAVAILABLE_VERIFICATION, 'no-entitlement-evidence'],
    ])('%s: the mutation is refused with a typed reason and nothing changes', async (_label, verification, reason) => {
      const { view, database } = await renderApp({
        access: { enforcement: 'enabled', source: sourceAnswering(verification), clock: () => NOW },
      });
      expect(stateOf(view)).toContain(`read-only:${reason}`);
      const before = fingerprint(database, view);

      const error = await attempt(() => sessions().clients.addClient(newClient('client-new')));

      expect(isBusinessAccessDeniedError(error)).toBe(true);
      expect((error as BusinessAccessDeniedError).reason).toBe(reason);
      expect((error as BusinessAccessDeniedError).operation).toBe('clients.addClient');
      expect(fingerprint(database, view)).toEqual(before);
    });

    it('offline grace permits mutations until the grace deadline, then refuses them', async () => {
      const time = clockAt(NOW);
      const expiresAt = new Date(NOW.getTime() + 2 * HOUR_MS);
      const source = sourceAnswering(verified({ kind: 'active', plan: 'monthly', expiresAt }));
      const { view, database } = await renderApp({ access: { enforcement: 'enabled', source, clock: time.clock } });
      expect(stateOf(view)).toContain('full:entitled');

      // The entitlement ended an hour ago and the store cannot be reached: the proof grants the grace.
      time.moveTo(new Date(expiresAt.getTime() + HOUR_MS));
      await act(async () => source.emit(fakeUser.id, UNAVAILABLE_VERIFICATION));
      expect(stateOf(view)).toContain('full:offline-grace');
      expect(await attempt(() => sessions().clients.addClient(newClient('client-in-grace')))).toBeUndefined();
      expect(loadClients(database).some((client) => client.id === 'client-in-grace')).toBe(true);

      // The grace is over and still nothing could be verified.
      time.moveTo(new Date(expiresAt.getTime() + GRACE_MS + MINUTE_MS));
      await act(async () => source.emit(fakeUser.id, UNAVAILABLE_VERIFICATION));
      expect(stateOf(view)).toContain('read-only:grace-elapsed');
      const before = fingerprint(database, view);
      const error = await attempt(() => sessions().clients.addClient(newClient('client-after-grace')));
      expect((error as BusinessAccessDeniedError).reason).toBe('grace-elapsed');
      expect(fingerprint(database, view)).toEqual(before);
    });

    it('cancelled-active permits mutations before its end and refuses them afterward, with no grace', async () => {
      const time = clockAt(NOW);
      const expiresAt = new Date(NOW.getTime() + 2 * HOUR_MS);
      const source = sourceAnswering(verified({ kind: 'cancelled-active', plan: 'annual', expiresAt }));
      const { view, database } = await renderApp({ access: { enforcement: 'enabled', source, clock: time.clock } });
      expect(stateOf(view)).toContain('full:entitled');
      expect(await attempt(() => sessions().clients.addClient(newClient('client-before-end')))).toBeUndefined();

      time.moveTo(new Date(expiresAt.getTime() + MINUTE_MS));
      await act(async () => source.emit(fakeUser.id, UNAVAILABLE_VERIFICATION));
      expect(stateOf(view)).toContain('read-only:subscription-expired');
      const before = fingerprint(database, view);
      const error = await attempt(() => sessions().clients.addClient(newClient('client-after-end')));
      expect((error as BusinessAccessDeniedError).reason).toBe('subscription-expired');
      expect(fingerprint(database, view)).toEqual(before);
    });
  });

  describe('a refused mutation changes nothing', () => {
    it('every guarded mutation: typed refusal, no row, no outbox entry, no upload, no gateway call, no state change', async () => {
      const { view, database, media, communications } = await renderApp({
        access: { enforcement: 'enabled', source: sourceAnswering(EXPIRED), clock: () => NOW },
      });
      expect(stateOf(view)).toContain('read-only:subscription-expired');
      const before = fingerprint(database, view);

      for (const mutation of MUTATIONS) {
        const error = await attempt(() => mutation.run(sessions()));
        expect([mutation.name, isBusinessAccessDeniedError(error)]).toEqual([mutation.name, true]);
        expect((error as BusinessAccessDeniedError).reason).toBe('subscription-expired');
        expect([mutation.name, fingerprint(database, view)]).toEqual([mutation.name, before]);
      }

      expect(media.objects.size).toBe(0);
      expect(mockPrepareProductPhoto).not.toHaveBeenCalled();
      expect(communications.calls.update).toBe(0);
      expect(communications.calls.updateLifecycle).toBe(0);
    });

    it('names the refused operation', async () => {
      await renderApp({ access: { enforcement: 'enabled', source: sourceAnswering(NEVER), clock: () => NOW } });
      const error = await attempt(() => sessions().sales.completeSale(standaloneSale('sale-new')));
      expect(error).toBeInstanceOf(BusinessAccessDeniedError);
      expect((error as BusinessAccessDeniedError).operation).toBe('sales.completeSale');
      expect((error as BusinessAccessDeniedError).reason).toBe('never-subscribed');
    });

    it('a compound operation cannot partially execute: no Sale and no stock decrement, no discount and no payment', async () => {
      const { view, database } = await renderApp({
        access: { enforcement: 'enabled', source: sourceAnswering(EXPIRED), clock: () => NOW },
      });

      expect(isBusinessAccessDeniedError(await attempt(() => sessions().sales.completeSale(standaloneSale('sale-new'))))).toBe(true);
      expect(loadSales(database)).toHaveLength(0);
      expect(findProduct(database, productSerum.id)?.stockQuantity).toBe(productSerum.stockQuantity);
      expect(stateOf(view)).toContain(`${productSerum.id}=${productSerum.stockQuantity}`);

      expect(
        isBusinessAccessDeniedError(
          await attempt(() =>
            sessions().appointments.checkoutAppointment(
              FUTURE_APPOINTMENT_ID,
              { cardAmountCents: FUTURE_APPOINTMENT_DUE_CENTS - 1350, cashAmountCents: 0 },
              { discount: { type: 'PERCENT', percent: 10 } },
            ),
          ),
        ),
      ).toBe(true);
      const stored = loadAppointments(database).find((appointment) => appointment.id === FUTURE_APPOINTMENT_ID);
      expect(stored?.status).toBe('SCHEDULED');
      expect(stored?.discount).toBeUndefined();
      expect(stored?.payment).toBeUndefined();
      expect(stateOf(view)).toContain(`${FUTURE_APPOINTMENT_ID}=SCHEDULED`);
    });

    it('a refused deposit correction leaves the deposit recorded while access was full exactly as it is', async () => {
      const source = sourceAnswering(ACTIVE);
      const { view, database } = await renderApp({ access: { enforcement: 'enabled', source, clock: () => NOW } });
      expect(
        await attempt(() =>
          sessions().appointments.recordAppointmentDeposit({
            id: 'deposit-1',
            appointmentId: FUTURE_APPOINTMENT_ID,
            amountCents: 2000,
            paymentMethod: 'CARD',
          }),
        ),
      ).toBeUndefined();
      expect(stateOf(view)).toContain('deposits:1');

      await act(async () => source.emit(fakeUser.id, EXPIRED));
      const before = fingerprint(database, view);
      expect(isBusinessAccessDeniedError(await attempt(() => sessions().appointments.voidAppointmentDeposit('deposit-1')))).toBe(true);
      expect(fingerprint(database, view)).toEqual(before);
      expect(sessions().appointments.deposits.find((deposit) => deposit.id === 'deposit-1')?.status).toBe('ACTIVE');
    });

    it('a chunked client import refused at its first chunk writes nothing and reports the failure', async () => {
      const { database } = await renderApp({
        access: { enforcement: 'enabled', source: sourceAnswering(EXPIRED), clock: () => NOW },
      });
      const batch = [newClient('import-1'), newClient('import-2'), newClient('import-3')];
      const clientsBefore = loadClients(database).length;

      let outcome: Awaited<ReturnType<typeof runClientImport>> | undefined;
      await act(async () => {
        outcome = await runClientImport(batch, sessions().clients.addClients, { chunkSize: 2, yieldToUi: async () => {} });
      });

      expect(outcome).toEqual({ completed: [], remaining: batch, failure: 'WRITE_FAILED' });
      expect(loadClients(database)).toHaveLength(clientsBefore);
    });
  });

  describe('access changes are observed without a remount', () => {
    it('full → read-only → full, the same mounted providers refuse then permit again', async () => {
      const source = sourceAnswering(ACTIVE);
      const { view, database } = await renderApp({ access: { enforcement: 'enabled', source, clock: () => NOW } });
      expect(await attempt(() => sessions().clients.addClient(newClient('client-while-full')))).toBeUndefined();

      // The store pushes a revocation (a refund, a cancellation reaching its end).
      await act(async () => source.emit(fakeUser.id, EXPIRED));
      expect(stateOf(view)).toContain('read-only:subscription-expired');
      expect(isBusinessAccessDeniedError(await attempt(() => sessions().clients.addClient(newClient('client-while-read-only'))))).toBe(true);
      expect(loadClients(database).some((client) => client.id === 'client-while-read-only')).toBe(false);

      // A later confirmed entitlement restores mutation access.
      await act(async () => source.emit(fakeUser.id, ACTIVE));
      expect(stateOf(view)).toContain('full:entitled');
      expect(await attempt(() => sessions().clients.addClient(newClient('client-restored')))).toBeUndefined();
      expect(loadClients(database).some((client) => client.id === 'client-restored')).toBe(true);

      expect(mounts).toBe(1);
      expect(stateOf(view)).toContain('clients:3');
    });
  });

  describe('what read-only access keeps', () => {
    it('reading: every collection, lookup, derived eligibility and conflict check stays available', async () => {
      const source = sourceAnswering(ACTIVE);
      const { view } = await renderApp({ access: { enforcement: 'enabled', source, clock: () => NOW } });
      expect(await attempt(() => sessions().sales.completeSale(standaloneSale('sale-history')))).toBeUndefined();
      expect(await attempt(() => sessions().calendarBlocks.addCalendarBlock(calendarBlock('block-history')))).toBeUndefined();

      await act(async () => source.emit(fakeUser.id, EXPIRED));
      expect(stateOf(view)).toContain('read-only:subscription-expired');

      const s = sessions();
      expect(s.clients.clients.length).toBeGreaterThan(0);
      expect(s.clients.activeClients.length).toBeGreaterThan(0);
      expect(s.clients.getClientById(clientLea.id)?.firstName).toBe('Léa');
      expect(s.services.activeServices.length).toBeGreaterThan(0);
      expect(s.services.getServiceById(serviceCut.id)?.name).toBe('Coupe');
      expect(s.products.activeProducts.length).toBeGreaterThan(0);
      expect(s.products.getProductById(productMask.id)?.stockQuantity).toBe(productMask.stockQuantity);
      expect(s.sales.getSaleById('sale-history')?.items).toHaveLength(1);
      expect(s.appointments.appointments.length).toBe(2);
      expect(s.appointments.getAppointmentById(FUTURE_APPOINTMENT_ID)?.appointment.items).toHaveLength(2);
      expect(s.appointments.getAppointmentDeletionEligibility(FUTURE_APPOINTMENT_ID).deletable).toBe(true);
      expect(s.clients.getClientDeletionEligibility(clientLea.id).deletable).toBe(false);
      expect(s.calendarBlocks.getCalendarBlockById('block-history')?.reason).toBe('Pause');
      expect(s.calendarBlocks.findConflict(calendarBlock('block-candidate'))?.type).toBe('CALENDAR_BLOCK');
      expect(s.preferences.state.status).toBe('ready');
      expect(s.access.canMutate).toBe(false);
      expect(s.access.writeRefusal).toBe('subscription-expired');
    });

    it('synchronization: changes queued while access was full are pushed, remote changes are pulled and adopted, nothing refused is ever sent', async () => {
      const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
      const source = sourceAnswering(ACTIVE);
      const { view, database } = await renderApp({ access: { enforcement: 'enabled', source, clock: () => NOW } });
      expect(await attempt(() => sessions().clients.addClient(newClient('client-queued')))).toBeUndefined();
      expect(countSyncOutboxRows(database)).toBeGreaterThan(0);

      await act(async () => source.emit(fakeUser.id, EXPIRED));
      expect(stateOf(view)).toContain('read-only:subscription-expired');
      expect(isBusinessAccessDeniedError(await attempt(() => sessions().clients.addClient(newClient('client-refused'))))).toBe(true);

      // The worker the runner drives, untouched by access: the queued Client reaches the remote.
      expect(approveInitialUpload(database, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
      const worker = createSyncPushWorker({ database, gateway: remote });
      const first = await worker.run(REMOTE_BUSINESS_ID);
      expect(first.status).toBe('PUSHED');
      expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', 'client-queued')).toBeDefined();
      expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', 'client-refused')).toBeUndefined();
      expect(remote.requests.some((request) => request.aggregateId === 'client-refused')).toBe(false);
      expect(countSyncOutboxRows(database)).toBe(0);

      // Another device adds a Client: the pull applies it and the providers adopt it in place, still read-only.
      remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', 'client-remote', {
        first_name: 'Remote',
        last_name: 'Device',
        phone: null,
        email: null,
        birthday: null,
        notes: null,
        photo_path: null,
        sms_marketing_consent: null,
        sms_marketing_consent_updated_at: null,
        sms_marketing_consent_source: null,
        archived_at: null,
      });
      const second = await worker.run(REMOTE_BUSINESS_ID);
      expect(second.status === 'PUSHED' && second.pull?.status === 'PULLED' && second.pull.applied).toBe(1);
      await act(async () => sessions().persistence.reloadSnapshot());
      expect(sessions().clients.getClientById('client-remote')?.firstName).toBe('Remote');
      expect(stateOf(view)).toContain('read-only:subscription-expired');
      expect(countSyncOutboxRows(database)).toBe(0);
      expect(mounts).toBe(1);
    });

    it('automatic previous-day finalization still runs and persists under read-only access', async () => {
      const { view, database } = await renderApp({
        access: { enforcement: 'enabled', source: sourceAnswering(EXPIRED), clock: () => NOW },
      });
      expect(stateOf(view)).toContain('read-only:subscription-expired');

      // The seeded Appointment of a past day was SCHEDULED; the session finalized it at mount.
      expect(stateOf(view)).toContain(`${appointmentLea.id}=COMPLETED`);
      expect(loadAppointments(database).find((appointment) => appointment.id === appointmentLea.id)?.status).toBe('COMPLETED');
      expect(stateOf(view)).toContain(`${FUTURE_APPOINTMENT_ID}=SCHEDULED`);
    });

    it('reminder opt-out: switching reminders OFF reaches the server; switching them ON is refused before any call', async () => {
      const communications = createFakeCommunicationsGateway();
      communications.seedPreferences(BUSINESS_ID, { emailRemindersEnabled: true, replyToEmail: 'salon@example.test' });
      await renderApp({
        access: { enforcement: 'enabled', source: sourceAnswering(EXPIRED), clock: () => NOW },
        communications,
      });

      let result: Awaited<ReturnType<CommunicationPreferencesValue['update']>> | undefined;
      await act(async () => {
        result = await sessions().preferences.update({ emailRemindersEnabled: false, replyToEmail: 'salon@example.test' });
      });
      expect(result?.status).toBe('UPDATED');
      expect(communications.calls.update).toBe(1);
      expect(sessions().preferences.emailRemindersEnabled).toBe(false);

      const error = await attempt(() =>
        sessions().preferences.update({ emailRemindersEnabled: true, replyToEmail: 'salon@example.test' }),
      );
      expect(isBusinessAccessDeniedError(error)).toBe(true);
      expect((error as BusinessAccessDeniedError).operation).toBe('communications.enableEmailReminders');
      expect(communications.calls.update).toBe(1);
      expect(sessions().preferences.emailRemindersEnabled).toBe(false);
    });

    it('signing out stays possible and drops the access session', async () => {
      const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
      const { view } = await renderApp({
        access: { enforcement: 'enabled', source: sourceAnswering(EXPIRED), clock: () => NOW, auth },
      });
      expect(stateOf(view)).toContain('read-only:subscription-expired');

      await act(async () => sessions().auth.signOut());

      expect(auth.calls.signOut).toBe(1);
      expect(sessions().auth.state.status).toBe('unauthenticated');
      // Nobody signed in: a fresh pending session, nothing of the previous one.
      expect(sessions().access.verification).toBeUndefined();
      expect(stateOf(view)).toContain('read-only:no-entitlement-evidence');
    });
  });

  describe('account isolation', () => {
    it('a user switch never reuses the previous user’s access: the new account is verified on its own', async () => {
      const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
      const source = sourceAnswering(ACTIVE);
      const { view, database } = await renderApp({ access: { enforcement: 'enabled', source, clock: () => NOW, auth } });
      expect(stateOf(view)).toContain('full:entitled');

      source.respondWith(NEVER);
      await act(async () => auth.emitSession({ id: 'user-other', email: 'other@example.com' }));

      expect(source.calls.verify).toEqual([fakeUser.id, 'user-other']);
      expect(stateOf(view)).toContain('read-only:never-subscribed');
      const error = await attempt(() => sessions().clients.addClient(newClient('client-other')));
      expect((error as BusinessAccessDeniedError).reason).toBe('never-subscribed');
      expect(loadClients(database).some((client) => client.id === 'client-other')).toBe(false);
    });
  });
});

describe('business mutation protection (enforcement disabled — the production state)', () => {
  afterEach(() => {
    latest = undefined;
  });

  it('the production constant is still disabled', () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
  });

  it('refuses nothing whatever the store says: every mutation behaves as before', async () => {
    const { view, database } = await renderApp({
      access: { enforcement: 'disabled', source: sourceAnswering(EXPIRED), clock: () => NOW },
    });
    expect(stateOf(view)).toContain('full:enforcement-disabled');
    expect(sessions().access.writeRefusal).toBeUndefined();

    expect(await attempt(() => sessions().clients.addClient(newClient('client-new')))).toBeUndefined();
    expect(await attempt(() => sessions().services.setServiceActive(serviceCut.id, false))).toBeUndefined();
    expect(await attempt(() => sessions().products.setProductStock(productSerum.id, 9))).toBeUndefined();
    expect(await attempt(() => sessions().sales.completeSale(standaloneSale('sale-new')))).toBeUndefined();
    expect(await attempt(() => sessions().appointments.setAppointmentDiscount(FUTURE_APPOINTMENT_ID, { type: 'FIXED', amountCents: 500 }))).toBeUndefined();
    expect(await attempt(() => sessions().calendarBlocks.addCalendarBlock(calendarBlock('block-new')))).toBeUndefined();
    expect(await attempt(() => sessions().preferences.update({ emailRemindersEnabled: true, replyToEmail: 'salon@example.test' }))).toBeUndefined();

    expect(loadClients(database).some((client) => client.id === 'client-new')).toBe(true);
    expect(loadSales(database)).toHaveLength(1);
    expect(stateOf(view)).toContain('blocks:1');
    expect(sessions().preferences.emailRemindersEnabled).toBe(true);
  });
});
