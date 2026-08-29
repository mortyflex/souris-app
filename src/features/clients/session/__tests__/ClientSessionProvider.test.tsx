import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { Appointment, AppointmentItem } from '@/domain/appointments';
import type { Client } from '@/domain/clients';

import { getResolvedClientDisplayName } from '../../presentation';
import { createInitialClients } from '../../data/initial-clients';
import { ClientSessionProvider, useClientSession } from '../ClientSessionProvider';

const addedClient: Client = {
  id: 'client-created',
  firstName: 'Nouvelle',
  lastName: 'Cliente',
  phone: '06 12 34 56 78',
};

const appointmentItem: AppointmentItem = {
  id: 'item-1',
  serviceId: 'service-cut',
  order: 0,
  serviceName: 'Coupe',
  serviceType: 'SERVICE',
  price: 42,
  phases: [{ id: 'phase-1', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
};
const existingAppointment: Appointment = {
  id: 'appointment-existing',
  businessId: 'fixture-business',
  clientId: 'client-agenda-lea',
  staffMemberId: 'staff-amelie',
  startAt: new Date(2026, 7, 24, 9),
  status: 'SCHEDULED',
  items: [appointmentItem],
};

function Probe() {
  const { clients, getClientById, addClient, updateClient } = useClientSession();
  const sofia = getClientById('client-agenda-sofia');
  const added = getClientById('client-created');
  const lea = getClientById('client-agenda-lea');
  const resolvedAppointmentName = getResolvedClientDisplayName(
    getClientById(existingAppointment.clientId),
  );

  return (
    <>
      <Text>{`count:${clients.length}`}</Text>
      <Text>{sofia ? `${sofia.firstName} ${sofia.lastName}` : 'sofia-missing'}</Text>
      <Text>{added ? `${added.firstName} ${added.lastName}` : 'added-missing'}</Text>
      <Text>{`lea:${lea?.firstName ?? 'missing'}`}</Text>
      <Text>{`appointment-client-id:${existingAppointment.clientId}`}</Text>
      <Text>{`appointment-resolved-name:${resolvedAppointmentName}`}</Text>
      <Pressable testID="add-client" onPress={() => addClient(addedClient)} />
      <Pressable
        testID="update-client"
        onPress={() =>
          updateClient({
            id: 'client-agenda-lea',
            firstName: 'Léana',
            lastName: 'Martin',
          })
        }
      />
    </>
  );
}

describe('ClientSessionProvider', () => {
  it('seeds the coherent initial source and exposes lookup', async () => {
    const view = await render(
      <ClientSessionProvider>
        <Probe />
      </ClientSessionProvider>,
    );

    expect(view.getByText(`count:${createInitialClients().length}`)).toBeTruthy();
    expect(view.getByText('Sofia Petit')).toBeTruthy();
    expect(view.getByText('added-missing')).toBeTruthy();
  });

  it('makes a newly added client retrievable immediately, with its id retained', async () => {
    const view = await render(
      <ClientSessionProvider>
        <Probe />
      </ClientSessionProvider>,
    );

    await act(async () => {
      fireEvent.press(view.getByTestId('add-client'));
    });

    expect(view.getByText('Nouvelle Cliente')).toBeTruthy();
    expect(view.getByText(`count:${createInitialClients().length + 1}`)).toBeTruthy();
  });

  it('updates a client immutably with its stable id and propagates identity', async () => {
    const view = await render(
      <ClientSessionProvider>
        <Probe />
      </ClientSessionProvider>,
    );

    expect(view.getByText('lea:Léa')).toBeTruthy();
    expect(view.getByText('appointment-resolved-name:Léa Martin')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('update-client'));
    });

    expect(view.getByText('lea:Léana')).toBeTruthy();
    expect(view.getByText('appointment-resolved-name:Léana Martin')).toBeTruthy();
  });

  it('never requires the Appointment object to be rewritten on client edit', async () => {
    const view = await render(
      <ClientSessionProvider>
        <Probe />
      </ClientSessionProvider>,
    );

    const beforeId = view.getByText('appointment-client-id:client-agenda-lea').props.children;
    expect(beforeId).toBe('appointment-client-id:client-agenda-lea');

    await act(async () => {
      fireEvent.press(view.getByTestId('update-client'));
    });

    expect(view.getByText('appointment-client-id:client-agenda-lea').props.children).toBe(
      'appointment-client-id:client-agenda-lea',
    );
  });

  it('does not mutate the initial source when clients are added', () => {
    const initial = createInitialClients();
    const before = initial.length;

    const next = [...initial, addedClient];

    expect(initial.length).toBe(before);
    expect(initial.some((client) => client.id === 'client-created')).toBe(false);
    expect(next.some((client) => client.id === 'client-created')).toBe(true);
  });
});
