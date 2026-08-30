import { act, fireEvent, render, userEvent } from '@testing-library/react-native';
import {
  AppState,
  Pressable,
  Text,
  type AppStateStatus,
} from 'react-native';

import type { Appointment } from '@/domain/appointments';

import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from '../AppointmentSessionProvider';

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
      <AppointmentSessionProvider>
        <Probe />
      </AppointmentSessionProvider>,
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
      <AppointmentSessionProvider>
        <Probe />
      </AppointmentSessionProvider>,
    );

    expect(view.getByText('count:10')).toBeTruthy();
  });

  it('finalizes an untouched prior-day appointment after local midnight', async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 23, 59, 30));
    const view = await render(
      <AppointmentSessionProvider>
        <Probe />
      </AppointmentSessionProvider>,
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
      <AppointmentSessionProvider>
        <Probe />
      </AppointmentSessionProvider>,
    );

    await act(async () => {
      fireEvent.press(view.getByTestId('add-backdated-appointment'));
    });

    expect(view.getByTestId('backdated-status').props.children).toBe('COMPLETED');
  });

  it('deletes an exact appointment and treats an unknown id as a no-op', async () => {
    const view = await render(
      <AppointmentSessionProvider>
        <Probe />
      </AppointmentSessionProvider>,
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
      <AppointmentSessionProvider>
        <Probe />
      </AppointmentSessionProvider>,
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
