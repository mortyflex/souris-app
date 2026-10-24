// BeautIzzy — a NEW Appointment with a deposit already received, through the
// Appointment session (`addAppointment(entry, deposit)`,
// docs/domain/APPOINTMENTS.md §25d): ONE transaction, state follows SQLite,
// never one record without the other, never the same deposit twice.

import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { Appointment } from '@/domain/appointments';
import { getCashRegisterDaySummary } from '@/domain/cash-register';
import type { SourisDatabase } from '@/persistence/database';
import * as depositStore from '@/persistence/stores/appointment-deposits';
import { loadAppointmentDeposits } from '@/persistence/stores/appointment-deposits';
import { loadAppointments } from '@/persistence/stores/appointments';
import { loadSyncOutbox } from '@/persistence/sync/outbox';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { AppointmentSessionProvider, useAppointmentSession } from '../AppointmentSessionProvider';

const TODAY = new Date(2026, 7, 29, 15, 0);
const NEW_ID = 'created-with-deposit';

/** Coupe 30 € + Balayage 70 € = 100,00 € expected, today at 14:00 (started, still SCHEDULED). */
const newAppointment: Appointment = {
  id: NEW_ID,
  businessId: 'business-test',
  clientId: 'client-agenda-sofia',
  staffMemberId: 'staff-amelie',
  startAt: new Date(2026, 7, 29, 14, 0),
  status: 'SCHEDULED',
  items: [
    {
      id: `${NEW_ID}-coupe`,
      serviceId: 'service-cut',
      order: 0,
      serviceName: 'Coupe',
      serviceType: 'SERVICE',
      price: 30,
      phases: [{ id: `${NEW_ID}-coupe-phase`, name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
    },
    {
      id: `${NEW_ID}-balayage`,
      serviceId: 'service-highlights',
      order: 1,
      serviceName: 'Balayage',
      serviceType: 'TECHNIQUE',
      price: 70,
      phases: [{ id: `${NEW_ID}-application`, name: 'Application', durationMinutes: 45, requiresStaff: true }],
    },
  ],
};

/** The same visit, but YESTERDAY: finalized COMPLETED on insert. */
const yesterdayAppointment: Appointment = {
  ...newAppointment,
  id: 'created-yesterday',
  startAt: new Date(2026, 7, 28, 14, 0),
};

function Probe() {
  const { appointments, deposits, addAppointment, checkoutAppointment, recordAppointmentDeposit } =
    useAppointmentSession();
  const attempt = (task: () => void) => {
    try {
      task();
    } catch {
      // Failures are observed through unchanged state below.
    }
  };
  const cashRegister = getCashRegisterDaySummary(
    { appointments: appointments.map(({ appointment }) => appointment), sales: [], deposits },
    TODAY,
  );
  const created = appointments.find(({ appointment }) => appointment.id === NEW_ID)?.appointment;

  return (
    <>
      <Text testID="created">{created ? `${created.status}:${created.items.length}` : 'missing'}</Text>
      <Text testID="deposits">
        {deposits.map((deposit) => `${deposit.appointmentId}:${deposit.id}:${deposit.amountCents}:${deposit.paymentMethod}:${deposit.status}`).join(',')}
      </Text>
      <Text testID="cash-register">{`${cashRegister.totalCents}/${cashRegister.cardCents}/${cashRegister.cashCents}/${cashRegister.checkoutCount}`}</Text>
      <Pressable
        testID="create-plain"
        onPress={() => attempt(() => addAppointment({ appointment: newAppointment }))}
      />
      <Pressable
        testID="create-with-30-cash"
        onPress={() =>
          attempt(() =>
            addAppointment({ appointment: newAppointment }, { id: 'deposit-new', amountCents: 3000, paymentMethod: 'CASH' }),
          )
        }
      />
      <Pressable
        testID="create-with-30-cash-again"
        onPress={() =>
          attempt(() =>
            addAppointment(
              { appointment: { ...newAppointment, id: 'created-twice' } },
              { id: 'deposit-new', amountCents: 3000, paymentMethod: 'CASH' },
            ),
          )
        }
      />
      <Pressable
        testID="create-with-too-much"
        onPress={() =>
          attempt(() =>
            addAppointment({ appointment: newAppointment }, { id: 'deposit-too-much', amountCents: 10_001, paymentMethod: 'CARD' }),
          )
        }
      />
      <Pressable
        testID="create-with-zero"
        onPress={() =>
          attempt(() =>
            addAppointment({ appointment: newAppointment }, { id: 'deposit-zero', amountCents: 0, paymentMethod: 'CARD' }),
          )
        }
      />
      <Pressable
        testID="create-yesterday-with-deposit"
        onPress={() =>
          attempt(() =>
            addAppointment({ appointment: yesterdayAppointment }, { id: 'deposit-yesterday', amountCents: 1000, paymentMethod: 'CARD' }),
          )
        }
      />
      <Pressable
        testID="checkout-rest"
        onPress={() => attempt(() => checkoutAppointment(NEW_ID, { cardAmountCents: 7000, cashAmountCents: 0 }))}
      />
      <Pressable
        testID="checkout-all"
        onPress={() => attempt(() => checkoutAppointment(NEW_ID, { cardAmountCents: 10_000, cashAmountCents: 0 }))}
      />
      <Pressable
        testID="deposit-later-20"
        onPress={() =>
          attempt(() =>
            recordAppointmentDeposit({ id: 'deposit-later', appointmentId: NEW_ID, amountCents: 2000, paymentMethod: 'CARD' }),
          )
        }
      />
    </>
  );
}

function renderSession(database: SourisDatabase) {
  return render(
    <TestPersistenceProvider database={database}>
      <AppointmentSessionProvider>
        <Probe />
      </AppointmentSessionProvider>
    </TestPersistenceProvider>,
  );
}

async function press(view: Awaited<ReturnType<typeof render>>, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
}

const text = (view: Awaited<ReturnType<typeof render>>, testID: string) => view.getByTestId(testID).props.children;
const storedAppointment = (database: SourisDatabase, id = NEW_ID) =>
  loadAppointments(database).find((appointment) => appointment.id === id);
const storedDeposits = (database: SourisDatabase) =>
  loadAppointmentDeposits(database).filter((deposit) => deposit.appointmentId.startsWith('created'));

describe('AppointmentSessionProvider — creation with a deposit', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  beforeEach(() => {
    jest.setSystemTime(TODAY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('without a deposit, creation is exactly as before: the Appointment alone, no deposit row', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);

    await press(view, 'create-plain');

    expect(text(view, 'created')).toBe('SCHEDULED:2');
    expect(text(view, 'deposits')).toBe('');
    expect(storedAppointment(database)).toMatchObject({ id: NEW_ID, status: 'SCHEDULED' });
    expect(storedDeposits(database)).toEqual([]);
  });

  it('with a deposit: Appointment and deposit are written together, received NOW, then both reach state', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);

    await press(view, 'create-with-30-cash');

    expect(text(view, 'created')).toBe('SCHEDULED:2');
    expect(text(view, 'deposits')).toBe(`${NEW_ID}:deposit-new:3000:CASH:ACTIVE`);
    expect(storedDeposits(database)).toEqual([
      expect.objectContaining({
        id: 'deposit-new',
        appointmentId: NEW_ID,
        businessId: 'business-test',
        amountCents: 3000,
        paymentMethod: 'CASH',
        status: 'ACTIVE',
        paidAt: TODAY,
        createdAt: TODAY,
      }),
    ]);
    // Counted once, today, as cash — the Appointment itself brought nothing yet.
    expect(text(view, 'cash-register')).toBe('3000/0/3000/1');
  });

  it('a second save with the same deposit id creates NOTHING: no second Appointment, no second deposit', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);
    await press(view, 'create-with-30-cash');

    await press(view, 'create-with-30-cash-again');

    expect(text(view, 'deposits')).toBe(`${NEW_ID}:deposit-new:3000:CASH:ACTIVE`);
    expect(storedDeposits(database)).toHaveLength(1);
    expect(storedAppointment(database, 'created-twice')).toBeUndefined();
  });

  it('a deposit above the total is refused whole: no Appointment either, nothing in state', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);

    await press(view, 'create-with-too-much');

    expect(text(view, 'created')).toBe('missing');
    expect(text(view, 'deposits')).toBe('');
    expect(storedAppointment(database)).toBeUndefined();
    expect(storedDeposits(database)).toEqual([]);
  });

  it('a zero deposit is refused whole, like « Prendre un acompte » refuses it', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);

    await press(view, 'create-with-zero');

    expect(text(view, 'created')).toBe('missing');
    expect(storedAppointment(database)).toBeUndefined();
    expect(storedDeposits(database)).toEqual([]);
  });

  it('a previous-day Appointment is finalized on insert and can therefore not take a deposit: nothing is saved', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);

    await press(view, 'create-yesterday-with-deposit');

    expect(storedAppointment(database, 'created-yesterday')).toBeUndefined();
    expect(storedDeposits(database)).toEqual([]);
    expect(text(view, 'deposits')).toBe('');
  });

  it('a failure while writing the deposit rolls the Appointment back too, and leaves no outbox entry', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);
    jest.spyOn(depositStore, 'insertAppointmentDeposit').mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    await press(view, 'create-with-30-cash');

    expect(text(view, 'created')).toBe('missing');
    expect(text(view, 'deposits')).toBe('');
    expect(storedAppointment(database)).toBeUndefined();
    expect(storedDeposits(database)).toEqual([]);
    expect(loadSyncOutbox(database, 'business-test')).toEqual([]);

    // The retry — the same draft, the same id — goes through once the write works.
    await press(view, 'create-with-30-cash');
    expect(text(view, 'created')).toBe('SCHEDULED:2');
    expect(storedDeposits(database)).toHaveLength(1);
  });

  it('the later checkout settles ONLY the remaining 70 €; the deposit is never charged or counted twice', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);
    await press(view, 'create-with-30-cash');

    await press(view, 'checkout-all');
    expect(text(view, 'created')).toBe('SCHEDULED:2');

    await press(view, 'checkout-rest');
    expect(text(view, 'created')).toBe('COMPLETED:2');
    expect(storedAppointment(database)?.payment).toMatchObject({ cardAmountCents: 7000, cashAmountCents: 0 });
    expect(text(view, 'cash-register')).toBe('10000/7000/3000/2');
  });

  it('« Prendre un acompte » on the saved Appointment still works, against the remaining 70 €', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);
    await press(view, 'create-with-30-cash');

    await press(view, 'deposit-later-20');

    expect(text(view, 'deposits')).toBe(
      `${NEW_ID}:deposit-new:3000:CASH:ACTIVE,${NEW_ID}:deposit-later:2000:CARD:ACTIVE`,
    );
    expect(storedDeposits(database)).toHaveLength(2);
    expect(text(view, 'cash-register')).toBe('5000/2000/3000/2');
  });
});
