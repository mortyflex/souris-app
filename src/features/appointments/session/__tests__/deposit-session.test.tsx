// Souris — Appointment deposits through the Appointment session
// (docs/domain/APPOINTMENTS.md §25d): state follows SQLite, the stored rows
// are the authority, and money is never counted twice.

import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { getCashRegisterDaySummary } from '@/domain/cash-register';
import type { SourisDatabase } from '@/persistence/database';
import { loadAppointmentDeposits } from '@/persistence/stores/appointment-deposits';
import { loadAppointments } from '@/persistence/stores/appointments';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { AppointmentSessionProvider, useAppointmentSession } from '../AppointmentSessionProvider';

// agenda-sofia: 95,00 € expected, 14:00 on the pinned day.
const APPOINTMENT_ID = 'agenda-sofia';
const TODAY = new Date(2026, 7, 29, 15, 0);

function Probe() {
  const {
    appointments,
    checkoutAppointment,
    completePrepaidAppointment,
    deposits,
    getAppointmentById,
    recordAppointmentDeposit,
    setAppointmentDiscount,
    voidAppointmentDeposit,
  } = useAppointmentSession();
  const entry = getAppointmentById(APPOINTMENT_ID);
  const attempt = (task: () => void) => {
    try {
      task();
    } catch {
      // Failures are observed through unchanged state below.
    }
  };
  const record = (id: string, amountCents: number) =>
    attempt(() => {
      recordAppointmentDeposit({ id, appointmentId: APPOINTMENT_ID, amountCents, paymentMethod: 'CARD' });
    });
  const cashRegister = getCashRegisterDaySummary(
    { appointments: appointments.map(({ appointment }) => appointment), sales: [], deposits },
    TODAY,
  );

  return (
    <>
      <Text testID="status">{entry?.appointment.status ?? 'missing'}</Text>
      <Text testID="payment">
        {entry?.appointment.payment
          ? `${entry.appointment.payment.cardAmountCents}/${entry.appointment.payment.cashAmountCents}`
          : 'none'}
      </Text>
      <Text testID="deposits">{deposits.map((deposit) => `${deposit.id}:${deposit.amountCents}:${deposit.status}`).join(',')}</Text>
      <Text testID="discount">{JSON.stringify(entry?.appointment.discount ?? null)}</Text>
      <Text testID="cash-register">{`${cashRegister.totalCents}/${cashRegister.checkoutCount}`}</Text>
      <Pressable testID="deposit-30" onPress={() => record('deposit-a', 3000)} />
      <Pressable testID="deposit-30-again" onPress={() => record('deposit-a', 3000)} />
      <Pressable testID="deposit-65" onPress={() => record('deposit-b', 6500)} />
      <Pressable testID="deposit-95" onPress={() => record('deposit-c', 9500)} />
      <Pressable testID="deposit-too-much" onPress={() => record('deposit-d', 9501)} />
      <Pressable testID="void-a" onPress={() => attempt(() => voidAppointmentDeposit('deposit-a'))} />
      <Pressable
        testID="checkout-rest"
        onPress={() => attempt(() => checkoutAppointment(APPOINTMENT_ID, { cardAmountCents: 6500, cashAmountCents: 0 }))}
      />
      <Pressable
        testID="checkout-half-discount"
        onPress={() =>
          attempt(() =>
            checkoutAppointment(
              APPOINTMENT_ID,
              { cardAmountCents: 1000, cashAmountCents: 0 },
              { discount: { type: 'PERCENT', percent: 50 } },
            ),
          )
        }
      />
      <Pressable
        testID="discount-50"
        onPress={() => attempt(() => setAppointmentDiscount(APPOINTMENT_ID, { type: 'PERCENT', percent: 50 }))}
      />
      <Pressable testID="complete-prepaid" onPress={() => attempt(() => completePrepaidAppointment(APPOINTMENT_ID))} />
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

describe('AppointmentSessionProvider — deposits', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  beforeEach(() => {
    jest.setSystemTime(TODAY);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('records a deposit in SQLite first, then in state, and counts it in the Cash Register of today', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);

    await press(view, 'deposit-30');

    expect(text(view, 'deposits')).toBe('deposit-a:3000:ACTIVE');
    expect(loadAppointmentDeposits(database)).toEqual([
      expect.objectContaining({ id: 'deposit-a', amountCents: 3000, paymentMethod: 'CARD', paidAt: TODAY }),
    ]);
    expect(text(view, 'cash-register')).toBe('3000/1');
    expect(text(view, 'status')).toBe('SCHEDULED');
  });

  it('never records the same submission twice', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);

    await press(view, 'deposit-30');
    await press(view, 'deposit-30-again');

    expect(text(view, 'deposits')).toBe('deposit-a:3000:ACTIVE');
    expect(loadAppointmentDeposits(database)).toHaveLength(1);
  });

  it('refuses a deposit above what remains to collect', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);

    await press(view, 'deposit-too-much');

    expect(text(view, 'deposits')).toBe('');
    expect(loadAppointmentDeposits(database)).toEqual([]);
  });

  it('voids a deposit: kept as history, no longer counted', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);
    await press(view, 'deposit-30');

    await press(view, 'void-a');

    expect(text(view, 'deposits')).toBe('deposit-a:3000:VOIDED');
    expect(loadAppointmentDeposits(database)[0]).toMatchObject({ status: 'VOIDED', voidedAt: TODAY });
    expect(text(view, 'cash-register')).toBe('0/0');
  });

  it('the final checkout records ONLY the new money: 30 € deposit + 65 € payment = 95 €, once', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);
    await press(view, 'deposit-30');

    await press(view, 'checkout-rest');

    expect(text(view, 'status')).toBe('COMPLETED');
    expect(text(view, 'payment')).toBe('6500/0');
    expect(text(view, 'cash-register')).toBe('9500/2');
  });

  it('a fully prepaid Appointment completes with NO payment and no new Cash Register movement', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);
    await press(view, 'deposit-95');
    expect(text(view, 'cash-register')).toBe('9500/1');

    await press(view, 'complete-prepaid');

    expect(text(view, 'status')).toBe('COMPLETED');
    expect(text(view, 'payment')).toBe('none');
    expect(text(view, 'cash-register')).toBe('9500/1');
    const stored = loadAppointments(database).find((appointment) => appointment.id === APPOINTMENT_ID);
    expect(stored).toMatchObject({ status: 'COMPLETED' });
    expect(stored?.payment).toBeUndefined();
  });

  it('refuses a prepaid completion while money remains', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);
    await press(view, 'deposit-30');

    await press(view, 'complete-prepaid');

    expect(text(view, 'status')).toBe('SCHEDULED');
  });

  it('a discount below the deposits is refused — directly and at checkout — and nothing changes', async () => {
    const database = openTestDatabase();
    const view = await renderSession(database);
    await press(view, 'deposit-65');

    await press(view, 'discount-50');
    expect(text(view, 'discount')).toBe('null');

    await press(view, 'checkout-half-discount');
    expect(text(view, 'status')).toBe('SCHEDULED');
    expect(text(view, 'payment')).toBe('none');
    expect(text(view, 'discount')).toBe('null');
    const stored = loadAppointments(database).find((appointment) => appointment.id === APPOINTMENT_ID);
    expect(stored?.discount).toBeUndefined();
    expect(stored?.payment).toBeUndefined();
  });
});
