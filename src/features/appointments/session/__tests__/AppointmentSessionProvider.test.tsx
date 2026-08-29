import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

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
  startAt: new Date(2026, 7, 24, 16),
  status: 'SCHEDULED',
  items: [],
};

function Probe() {
  const { appointments, addAppointment, getAppointmentById, updateAppointment } =
    useAppointmentSession();
  const added = getAppointmentById('appointment-added');

  return (
    <>
      <Text>{`count:${appointments.length}`}</Text>
      <Text>{added?.appointment.clientId ?? 'not-found'}</Text>
      <Text>{added?.appointment.notes ?? 'no-notes'}</Text>
      <Pressable
        testID="add-appointment"
        onPress={() => addAppointment({ appointment: addedAppointment })}
      />
      <Pressable
        testID="update-appointment"
        onPress={() =>
          updateAppointment({
            appointment: { ...addedAppointment, notes: 'mis à jour' },
          })
        }
      />
    </>
  );
}

describe('AppointmentSessionProvider', () => {
  it('seeds fixtures once and exposes added appointments through the same lookup', async () => {
    const view = await render(
      <AppointmentSessionProvider>
        <Probe />
      </AppointmentSessionProvider>,
    );

    expect(view.getByText('count:9')).toBeTruthy();
    expect(view.getByText('not-found')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('add-appointment'));
    });

    expect(view.getByText('count:10')).toBeTruthy();
    expect(view.getByText('legacy-client-added')).toBeTruthy();

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
});
