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

/** Fixture prices: a TECHNIQUE is 95 €, a SERVICE 42 € — each checkout settles EXACTLY its due. */
const DUE_CENTS: Readonly<Record<string, number>> = { 'agenda-sofia': 9500, 'agenda-anais': 4200 };

function Probe({ appointmentId }: { readonly appointmentId: string }) {
  const due = DUE_CENTS[appointmentId] ?? 0;
  const {
    appointments,
    checkoutAppointment,
    deleteAppointment,
    getAppointmentById,
    getAppointmentDeletionEligibility,
    setAppointmentDiscount,
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
      <Text testID="start">{entry?.appointment.startAt.toISOString() ?? 'missing'}</Text>
      <Text testID="deletable">
        {String(getAppointmentDeletionEligibility(appointmentId).deletable)}
      </Text>
      <Pressable
        testID="checkout-card"
        onPress={() =>
          attempt(() => checkoutAppointment(appointmentId, { cardAmountCents: due, cashAmountCents: 0 }))
        }
      />
      <Pressable
        testID="checkout-cash"
        onPress={() =>
          attempt(() => checkoutAppointment(appointmentId, { cardAmountCents: 0, cashAmountCents: due }))
        }
      />
      <Pressable
        testID="checkout-mixed"
        onPress={() =>
          attempt(() => checkoutAppointment(appointmentId, { cardAmountCents: 5000, cashAmountCents: due - 5000 }))
        }
      />
      <Text testID="discount">{JSON.stringify(entry?.appointment.discount ?? null)}</Text>
      <Pressable
        testID="checkout-discounted"
        onPress={() =>
          attempt(() =>
            checkoutAppointment(
              appointmentId,
              { cardAmountCents: due * 0.8, cashAmountCents: 0 },
              { discount: { type: 'PERCENT', percent: 20 } },
            ),
          )
        }
      />
      <Pressable
        testID="checkout-without-discount"
        onPress={() =>
          attempt(() =>
            checkoutAppointment(appointmentId, { cardAmountCents: due, cashAmountCents: 0 }, { discount: undefined }),
          )
        }
      />
      <Pressable
        testID="set-discount"
        onPress={() => attempt(() => setAppointmentDiscount(appointmentId, { type: 'PERCENT', percent: 10 }))}
      />
      <Pressable
        testID="checkout-over"
        onPress={() =>
          attempt(() => checkoutAppointment(appointmentId, { cardAmountCents: due + 100, cashAmountCents: 0 }))
        }
      />
      <Pressable
        testID="checkout-under"
        onPress={() =>
          attempt(() => checkoutAppointment(appointmentId, { cardAmountCents: due - 100, cashAmountCents: 0 }))
        }
      />
      <Pressable
        testID="checkout-appointment-day"
        onPress={() =>
          attempt(() =>
            checkoutAppointment(appointmentId, { cardAmountCents: 0, cashAmountCents: due }, undefined, 'APPOINTMENT_DAY'),
          )
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
          attempt(() => updateAppointmentPayment(appointmentId, { cardAmountCents: 3000, cashAmountCents: due - 3000 }))
        }
      />
      <Pressable
        testID="edit-payment-over"
        onPress={() =>
          attempt(() => updateAppointmentPayment(appointmentId, { cardAmountCents: due + 1, cashAmountCents: 0 }))
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
    ['checkout-card', '9500/0'],
    ['checkout-cash', '0/9500'],
    ['checkout-mixed', '5000/4500'],
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
      .toMatchObject({ cardAmountCents: 9500 });
  });

  it.each(['checkout-over', 'checkout-under'])(
    'refuses %s — a final checkout settles EXACTLY the due — and changes nothing',
    async (action) => {
      const database = openTestDatabase();
      const view = await renderSession('agenda-sofia', database);

      await press(view, action);

      expect(view.getByTestId('status').props.children).toBe('SCHEDULED');
      expect(view.getByTestId('payment').props.children).toBe('none');
      expect(loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia')?.payment)
        .toBeUndefined();
    },
  );

  it('writes the discount chosen at checkout together with the payment', async () => {
    const database = openTestDatabase();
    const view = await renderSession('agenda-sofia', database);

    await press(view, 'checkout-discounted');

    expect(view.getByTestId('status').props.children).toBe('COMPLETED');
    expect(view.getByTestId('discount').props.children).toBe('{"type":"PERCENT","percent":20}');
    const stored = loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia');
    expect(stored).toMatchObject({
      status: 'COMPLETED',
      discount: { type: 'PERCENT', percent: 20 },
      payment: { cardAmountCents: 7600, cashAmountCents: 0 },
    });
  });

  it('removes a stored discount chosen away at checkout', async () => {
    const database = openTestDatabase();
    const view = await renderSession('agenda-sofia', database);
    await press(view, 'set-discount');
    expect(view.getByTestId('discount').props.children).toBe('{"type":"PERCENT","percent":10}');

    await press(view, 'checkout-without-discount');

    expect(view.getByTestId('discount').props.children).toBe('null');
    expect(loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia')?.discount)
      .toBeUndefined();
  });

  it('rolls the discount back with the payment when the checkout write fails — never one without the other', async () => {
    const { database, control } = openFailableDatabase();
    const view = await renderSession('agenda-sofia', database);
    control.failPaymentWrites = true;

    await press(view, 'checkout-discounted');

    expect(view.getByTestId('status').props.children).toBe('SCHEDULED');
    expect(view.getByTestId('discount').props.children).toBe('null');
    const stored = loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia');
    expect(stored?.status).toBe('SCHEDULED');
    expect(stored?.discount).toBeUndefined();
    expect(stored?.payment).toBeUndefined();
  });

  it('lets an automatically completed appointment choose its discount with its FIRST payment', async () => {
    const database = openTestDatabase();
    const view = await renderSession('agenda-anais', database);
    expect(view.getByTestId('status').props.children).toBe('COMPLETED');

    await press(view, 'checkout-discounted');

    expect(view.getByTestId('payment').props.children).toContain('3360/0');
    expect(view.getByTestId('discount').props.children).toBe('{"type":"PERCENT","percent":20}');
    expect(loadAppointments(database).find((appointment) => appointment.id === 'agenda-anais')).toMatchObject({
      status: 'COMPLETED',
      discount: { type: 'PERCENT', percent: 20 },
      payment: { cardAmountCents: 3360, cashAmountCents: 0 },
    });
  });

  it('dates a late checkout on the appointment day when asked — its end, on its local day', async () => {
    const database = openTestDatabase();
    const view = await renderSession('agenda-anais', database);
    const startAt = new Date(view.getByTestId('start').props.children as string);

    await press(view, 'checkout-appointment-day');

    // Soin profond, 45 minutes: the money is dated at the end of the visit.
    const expectedPaidAt = new Date(startAt.getTime() + 45 * 60_000);
    expect(view.getByTestId('payment').props.children).toBe(`0/4200@${expectedPaidAt.toISOString()}`);
    expect(loadAppointments(database).find((appointment) => appointment.id === 'agenda-anais')?.payment?.paidAt)
      .toEqual(expectedPaidAt);
  });

  it('dates a same-day checkout now, even when the appointment day is asked', async () => {
    const view = await renderSession('agenda-sofia');

    await press(view, 'checkout-appointment-day');

    expect(view.getByTestId('payment').props.children).toBe(`0/9500@${new Date(2026, 7, 29, 15, 0).toISOString()}`);
  });

  it('corrects a recorded split without duplicating it, regressing status, or moving paidAt', async () => {
    const view = await renderSession('agenda-sofia');
    await press(view, 'checkout-mixed');
    const before = view.getByTestId('payment').props.children as string;
    jest.setSystemTime(new Date(2026, 7, 29, 18, 0));

    await press(view, 'edit-payment');

    expect(view.getByTestId('status').props.children).toBe('COMPLETED');
    expect(view.getByTestId('payment').props.children).toBe(before.replace('5000/4500', '3000/6500'));
    expect(view.getByTestId('count').props.children).toBe(9);

    await press(view, 'edit-payment-over');
    expect(view.getByTestId('payment').props.children).toBe(before.replace('5000/4500', '3000/6500'));
  });

  it('keeps the stored payment when a correction fails', async () => {
    const { database, control } = openFailableDatabase();
    const view = await renderSession('agenda-sofia', database);
    await press(view, 'checkout-mixed');
    control.failPaymentWrites = true;

    await press(view, 'edit-payment');

    expect(view.getByTestId('payment').props.children).toContain('5000/4500');
    expect(loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia')?.payment)
      .toMatchObject({ cardAmountCents: 5000, cashAmountCents: 4500 });
  });

  it('never records a payment through automatic previous-day completion, and lets one be added afterwards', async () => {
    const view = await renderSession('agenda-anais');

    expect(view.getByTestId('status').props.children).toBe('COMPLETED');
    expect(view.getByTestId('payment').props.children).toBe('none');

    await press(view, 'edit-payment');
    expect(view.getByTestId('payment').props.children).toBe('none');

    await press(view, 'checkout-cash');
    expect(view.getByTestId('status').props.children).toBe('COMPLETED');
    expect(view.getByTestId('payment').props.children).toContain('0/4200');
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
