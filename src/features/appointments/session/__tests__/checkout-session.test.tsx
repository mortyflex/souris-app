import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { SourisDatabase } from '@/persistence/database';
import { loadAppointments } from '@/persistence/stores/appointments';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { AppointmentSessionProvider, useAppointmentSession } from '../AppointmentSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

/** A real SQLite database whose checkout / payment writes can be made to fail on demand. */
function openFailableDatabase() {
  const native = openTestDatabase();
  const control = { failPaymentWrites: false };
  const database: SourisDatabase = {
    ...native,
    runSync: (sql, params) => {
      if (
        control.failPaymentWrites &&
        /^UPDATE appointments SET (status = 'COMPLETED', paid_at|card_amount_cents)/.test(sql)
      ) {
        throw new Error('disk full');
      }
      return native.runSync(sql, params);
    },
  };
  return { database, control };
}

function Probe({ appointmentId }: { readonly appointmentId: string }) {
  const {
    appointments,
    checkoutAppointment,
    deleteAppointment,
    getAppointmentById,
    getAppointmentDeletionEligibility,
    updateAppointmentPayment,
  } = useAppointmentSession();
  const entry = getAppointmentById(appointmentId);
  const attempt = (task: () => void) => {
    try {
      task();
    } catch {
      // Failures are observed through unchanged state below.
    }
  };

  return (
    <>
      <Text testID="count">{appointments.length}</Text>
      <Text testID="status">{entry?.appointment.status ?? 'missing'}</Text>
      <Text testID="payment">
        {entry?.appointment.payment
          ? `${entry.appointment.payment.cardAmountCents}/${entry.appointment.payment.cashAmountCents}@${entry.appointment.payment.paidAt.toISOString()}`
          : 'none'}
      </Text>
      <Text testID="deletable">
        {String(getAppointmentDeletionEligibility(appointmentId).deletable)}
      </Text>
      <Pressable
        testID="checkout-card"
        onPress={() =>
          attempt(() => checkoutAppointment(appointmentId, { cardAmountCents: 7500, cashAmountCents: 0 }))
        }
      />
      <Pressable
        testID="checkout-cash"
        onPress={() =>
          attempt(() => checkoutAppointment(appointmentId, { cardAmountCents: 0, cashAmountCents: 7500 }))
        }
      />
      <Pressable
        testID="checkout-mixed"
        onPress={() =>
          attempt(() => checkoutAppointment(appointmentId, { cardAmountCents: 5000, cashAmountCents: 2500 }))
        }
      />
      <Pressable
        testID="checkout-negative"
        onPress={() =>
          attempt(() => checkoutAppointment(appointmentId, { cardAmountCents: -500, cashAmountCents: 0 }))
        }
      />
      <Pressable
        testID="edit-payment"
        onPress={() =>
          attempt(() => updateAppointmentPayment(appointmentId, { cardAmountCents: 3000, cashAmountCents: 4500 }))
        }
      />
      <Pressable testID="delete" onPress={() => attempt(() => deleteAppointment(appointmentId))} />
    </>
  );
}

function renderSession(appointmentId: string, database?: SourisDatabase) {
  return render(
    <TestPersistenceProvider database={database}>
      <AppointmentSessionProvider>
        <Probe appointmentId={appointmentId} />
      </AppointmentSessionProvider>
    </TestPersistenceProvider>,
  );
}

async function press(view: Awaited<ReturnType<typeof render>>, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
}

describe('AppointmentSessionProvider — checkout', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  // One render per test: the session owns day-rollover timers, so a second
  // tree inside the same fake-timer test would overlap React act scopes.
  it.each([
    ['checkout-card', '7500/0'],
    ['checkout-cash', '0/7500'],
    ['checkout-mixed', '5000/2500'],
  ])('records %s as COMPLETED with the payment %s', async (action, expected) => {
    const view = await renderSession('agenda-sofia');
    expect(view.getByTestId('status').props.children).toBe('SCHEDULED');

    await press(view, action);

    expect(view.getByTestId('status').props.children).toBe('COMPLETED');
    expect(view.getByTestId('payment').props.children).toBe(
      `${expected}@${new Date(2026, 7, 29, 15, 0).toISOString()}`,
    );
  });

  it('rejects a negative amount before anything changes', async () => {
    const view = await renderSession('agenda-sofia');

    await press(view, 'checkout-negative');

    expect(view.getByTestId('status').props.children).toBe('SCHEDULED');
    expect(view.getByTestId('payment').props.children).toBe('none');
  });

  it('refuses a checkout before the appointment started', async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 8, 0));
    const view = await renderSession('agenda-sofia');

    await press(view, 'checkout-card');

    expect(view.getByTestId('status').props.children).toBe('SCHEDULED');
    expect(view.getByTestId('payment').props.children).toBe('none');
  });

  it('leaves status, payment and state unchanged when the transaction fails', async () => {
    const { database, control } = openFailableDatabase();
    const view = await renderSession('agenda-sofia', database);
    control.failPaymentWrites = true;

    await press(view, 'checkout-card');

    expect(view.getByTestId('status').props.children).toBe('SCHEDULED');
    expect(view.getByTestId('payment').props.children).toBe('none');
    const stored = loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia');
    expect(stored?.status).toBe('SCHEDULED');
    expect(stored?.payment).toBeUndefined();

    control.failPaymentWrites = false;
    await press(view, 'checkout-card');
    expect(view.getByTestId('status').props.children).toBe('COMPLETED');
    expect(loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia')?.payment)
      .toMatchObject({ cardAmountCents: 7500 });
  });

  it('corrects a recorded split without duplicating it, regressing status, or moving paidAt', async () => {
    const view = await renderSession('agenda-sofia');
    await press(view, 'checkout-mixed');
    const before = view.getByTestId('payment').props.children as string;
    jest.setSystemTime(new Date(2026, 7, 29, 18, 0));

    await press(view, 'edit-payment');

    expect(view.getByTestId('status').props.children).toBe('COMPLETED');
    expect(view.getByTestId('payment').props.children).toBe(before.replace('5000/2500', '3000/4500'));
    expect(view.getByTestId('count').props.children).toBe(9);
  });

  it('keeps the stored payment when a correction fails', async () => {
    const { database, control } = openFailableDatabase();
    const view = await renderSession('agenda-sofia', database);
    await press(view, 'checkout-mixed');
    control.failPaymentWrites = true;

    await press(view, 'edit-payment');

    expect(view.getByTestId('payment').props.children).toContain('5000/2500');
    expect(loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia')?.payment)
      .toMatchObject({ cardAmountCents: 5000, cashAmountCents: 2500 });
  });

  it('never records a payment through automatic previous-day completion, and lets one be added afterwards', async () => {
    const view = await renderSession('agenda-anais');

    expect(view.getByTestId('status').props.children).toBe('COMPLETED');
    expect(view.getByTestId('payment').props.children).toBe('none');

    await press(view, 'edit-payment');
    expect(view.getByTestId('payment').props.children).toBe('none');

    await press(view, 'checkout-cash');
    expect(view.getByTestId('status').props.children).toBe('COMPLETED');
    expect(view.getByTestId('payment').props.children).toContain('0/7500');
  });

  it('refuses permanent deletion once a payment is recorded', async () => {
    const view = await renderSession('agenda-sofia');
    expect(view.getByTestId('deletable').props.children).toBe('true');

    await press(view, 'checkout-card');
    expect(view.getByTestId('deletable').props.children).toBe('false');

    await press(view, 'delete');

    expect(view.getByTestId('status').props.children).toBe('COMPLETED');
    expect(view.getByTestId('count').props.children).toBe(9);
  });
});
