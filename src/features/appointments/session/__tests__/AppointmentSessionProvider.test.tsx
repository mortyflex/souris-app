import { act, fireEvent, render, userEvent } from '@testing-library/react-native';
import {
  AppState,
  Pressable,
  Text,
  type AppStateStatus,
} from 'react-native';

import type { Appointment, Service } from '@/domain/appointments';
import {
  ServiceCatalogProvider,
  useServiceCatalog,
} from '@/features/services/session/ServiceCatalogProvider';

import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from '../AppointmentSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

const addedAppointment: Appointment = {
  id: 'appointment-added',
  businessId: 'fixture-business',
  clientId: 'legacy-client-added',
  staffMemberId: 'staff-amelie',
  startAt: new Date(2026, 7, 29, 16),
  status: 'SCHEDULED',
  items: [],
};

const cancelledAppointment: Appointment = {
  ...addedAppointment,
  id: 'appointment-cancelled',
  status: 'CANCELLED',
  cancellation: {
    cancelledAt: new Date(2026, 7, 29, 17),
    cancelledBy: 'CLIENT',
  },
};

const backdatedAppointment: Appointment = {
  ...addedAppointment,
  id: 'appointment-backdated',
  startAt: new Date(2026, 7, 28, 16),
};

function Probe() {
  const {
    appointments,
    addAppointment,
    deleteAppointment,
    getAppointmentById,
    updateAppointment,
  } =
    useAppointmentSession();
  const added = getAppointmentById('appointment-added');
  const cancelled = getAppointmentById('appointment-cancelled');
  const pastFixture = getAppointmentById('agenda-anais');
  const sameDayFixture = getAppointmentById('agenda-lea');
  const backdated = getAppointmentById('appointment-backdated');

  return (
    <>
      <Text>{`count:${appointments.length}`}</Text>
      <Text>{added?.appointment.clientId ?? 'not-found'}</Text>
      <Text>{added?.appointment.notes ?? 'no-notes'}</Text>
      <Text testID="added-status">{added?.appointment.status ?? 'no-status'}</Text>
      <Text testID="cancelled-status">{cancelled?.appointment.status ?? 'no-status'}</Text>
      <Text testID="backdated-status">{backdated?.appointment.status ?? 'no-status'}</Text>
      <Text testID="past-fixture-status">{pastFixture?.appointment.status ?? 'no-status'}</Text>
      <Text testID="same-day-fixture-status">
        {sameDayFixture?.appointment.status ?? 'no-status'}
      </Text>
      <Pressable
        testID="add-appointment"
        onPress={() => addAppointment({ appointment: addedAppointment })}
      />
      <Pressable
        testID="add-cancelled-appointment"
        onPress={() => addAppointment({ appointment: cancelledAppointment })}
      />
      <Pressable
        testID="add-backdated-appointment"
        onPress={() => addAppointment({ appointment: backdatedAppointment })}
      />
      <Pressable
        testID="update-appointment"
        onPress={() =>
          updateAppointment({
            appointment: { ...addedAppointment, notes: 'mis à jour' },
          })
        }
      />
      <Pressable
        testID="delete-added-appointment"
        onPress={() => deleteAppointment('appointment-added')}
      />
      <Pressable
        testID="delete-unknown-appointment"
        onPress={() => deleteAppointment('appointment-unknown')}
      />
    </>
  );
}

const BRUSHING_ID = 'service-brushing-brushing-1';

function CatalogProbe() {
  const { addAppointment } = useAppointmentSession();
  const { getServiceById } = useServiceCatalog();
  const brushing = getServiceById(BRUSHING_ID);
  const withDefaults = (updates: readonly Service[]) => {
    try {
      addAppointment({ appointment: addedAppointment }, updates);
    } catch {
      // The failure is observed through unchanged state below.
    }
  };

  return (
    <>
      <Text testID="brushing">
        {brushing ? `${brushing.price}:${brushing.phases[0]?.durationMinutes}` : 'missing'}
      </Text>
      <Pressable
        testID="create-with-defaults"
        onPress={() =>
          brushing &&
          withDefaults([
            { ...brushing, price: brushing.price + 5, phases: [{ ...brushing.phases[0]!, durationMinutes: 99 }] },
          ])
        }
      />
      <Pressable
        testID="create-with-broken-defaults"
        onPress={() =>
          brushing &&
          withDefaults([
            { ...brushing, price: brushing.price + 5 },
            { ...brushing, id: 'service-vanished' },
          ])
        }
      />
    </>
  );
}

describe('AppointmentSessionProvider — atomic creation with catalog defaults', () => {
  function renderWithCatalog() {
    return render(
      <TestPersistenceProvider>
        <ServiceCatalogProvider>
          <AppointmentSessionProvider>
            <Probe />
            <CatalogProbe />
          </AppointmentSessionProvider>
        </ServiceCatalogProvider>
      </TestPersistenceProvider>,
    );
  }

  it('commits the Appointment and the Service defaults together', async () => {
    const view = await renderWithCatalog();
    const before = view.getByTestId('brushing').props.children as string;

    await act(async () => fireEvent.press(view.getByTestId('create-with-defaults')));

    expect(view.getByText('legacy-client-added')).toBeTruthy();
    const after = view.getByTestId('brushing').props.children as string;
    expect(after).not.toBe(before);
    expect(after.endsWith(':99')).toBe(true);
  });

  it('leaves both the session and the catalog unchanged when the transaction fails', async () => {
    const view = await renderWithCatalog();
    const before = view.getByTestId('brushing').props.children as string;

    await act(async () => fireEvent.press(view.getByTestId('create-with-broken-defaults')));

    expect(view.getByText('not-found')).toBeTruthy();
    expect(view.getByTestId('brushing').props.children).toBe(before);
    expect(view.getByText('count:9')).toBeTruthy();
  });
});

describe('AppointmentSessionProvider', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(2026, 7, 29, 10, 0));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('seeds fixtures once and exposes added appointments through the same lookup', async () => {
    const view = await render(
      <TestPersistenceProvider>
        <AppointmentSessionProvider>
        <Probe />
        </AppointmentSessionProvider>
      </TestPersistenceProvider>,
    );

    expect(view.getByText('count:9')).toBeTruthy();
    expect(view.getByText('not-found')).toBeTruthy();
    expect(view.getByTestId('past-fixture-status').props.children).toBe('COMPLETED');
    expect(view.getByTestId('same-day-fixture-status').props.children).toBe('SCHEDULED');

    await act(async () => {
      fireEvent.press(view.getByTestId('add-appointment'));
    });

    expect(view.getByText('count:10')).toBeTruthy();
    expect(view.getByText('legacy-client-added')).toBeTruthy();
    expect(view.getByTestId('added-status').props.children).toBe('SCHEDULED');

    await act(async () => {
      fireEvent.press(view.getByTestId('update-appointment'));
    });
    expect(view.getByText('mis à jour')).toBeTruthy();

    view.rerender(
      <TestPersistenceProvider>
        <AppointmentSessionProvider>
        <Probe />
        </AppointmentSessionProvider>
      </TestPersistenceProvider>,
    );

    expect(view.getByText('count:10')).toBeTruthy();
  });

  it('finalizes an untouched prior-day appointment after local midnight', async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 23, 59, 30));
    const view = await render(
      <TestPersistenceProvider>
        <AppointmentSessionProvider>
        <Probe />
        </AppointmentSessionProvider>
      </TestPersistenceProvider>,
    );

    await act(async () => {
      fireEvent.press(view.getByTestId('add-appointment'));
    });
    expect(view.getByTestId('added-status').props.children).toBe('SCHEDULED');

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(view.getByTestId('added-status').props.children).toBe('COMPLETED');

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(view.getByTestId('added-status').props.children).toBe('COMPLETED');
  });

  it('finalizes an eligible backdated write immediately', async () => {
    const view = await render(
      <TestPersistenceProvider>
        <AppointmentSessionProvider>
        <Probe />
        </AppointmentSessionProvider>
      </TestPersistenceProvider>,
    );

    await act(async () => {
      fireEvent.press(view.getByTestId('add-backdated-appointment'));
    });

    expect(view.getByTestId('backdated-status').props.children).toBe('COMPLETED');
  });

  it('deletes an exact appointment and treats an unknown id as a no-op', async () => {
    const view = await render(
      <TestPersistenceProvider>
        <AppointmentSessionProvider>
        <Probe />
        </AppointmentSessionProvider>
      </TestPersistenceProvider>,
    );

    await act(async () => {
      fireEvent.press(view.getByTestId('add-appointment'));
    });
    expect(view.getByText('count:10')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('delete-added-appointment'));
    });
    expect(view.getByText('count:9')).toBeTruthy();
    expect(view.getByTestId('added-status').props.children).toBe('no-status');
    expect(view.getByTestId('same-day-fixture-status').props.children).toBe('SCHEDULED');

    await act(async () => {
      fireEvent.press(view.getByTestId('delete-unknown-appointment'));
    });
    expect(view.getByText('count:9')).toBeTruthy();
  });

  it('reconciles on foreground activation and preserves terminal outcomes', async () => {
    const user = userEvent.setup({
      advanceTimers: (delay) => jest.advanceTimersByTime(delay),
    });
    let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onAppStateChange = listener;
      return { remove: jest.fn() };
    });
    const view = await render(
      <TestPersistenceProvider>
        <AppointmentSessionProvider>
        <Probe />
        </AppointmentSessionProvider>
      </TestPersistenceProvider>,
    );

    await user.press(view.getByTestId('add-appointment'));
    await user.press(view.getByTestId('add-cancelled-appointment'));
    jest.setSystemTime(new Date(2026, 7, 30, 8, 0));

    await act(async () => {
      onAppStateChange?.('active');
    });

    expect(view.getByTestId('added-status').props.children).toBe('COMPLETED');
    expect(view.getByTestId('cancelled-status').props.children).toBe('CANCELLED');
  });
});
