import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { Appointment, AppointmentItem } from '@/domain/appointments';

import { createInitialClients } from '../../data/initial-clients';
import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from '@/features/appointments/session/AppointmentSessionProvider';
import { formatPrice } from '@/features/appointments/presentation';
import { ClientProfileScreen } from '../ClientProfileScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    SymbolView: () => React.createElement(React.Fragment, null),
  };
});

jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    DateTimePicker: () => React.createElement(View, null),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const cancelledItem: AppointmentItem = {
  id: 'cancelled-item',
  serviceId: 'service-cut',
  order: 0,
  serviceName: 'Coupe',
  serviceType: 'SERVICE',
  price: 42,
  phases: [{ id: 'cancelled-phase', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
};

const cancelledAppointment: Appointment = {
  id: 'cancelled-test',
  businessId: 'fixture-business',
  clientId: 'client-agenda-sofia',
  staffMemberId: 'staff-amelie',
  startAt: new Date(2026, 6, 5, 10),
  status: 'CANCELLED',
  items: [cancelledItem],
  cancellation: {
    cancelledAt: new Date(2026, 6, 5, 11),
    cancelledBy: 'CLIENT',
  },
};

const businessCancelledAppointment: Appointment = {
  ...cancelledAppointment,
  id: 'business-cancelled-test',
  startAt: new Date(2026, 6, 6, 10),
  cancellation: {
    cancelledAt: new Date(2026, 6, 6, 11),
    cancelledBy: 'BUSINESS',
  },
};

const futureAppointment: Appointment = {
  id: 'future-test',
  businessId: 'fixture-business',
  clientId: 'client-agenda-sofia',
  staffMemberId: 'staff-amelie',
  startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  status: 'SCHEDULED',
  items: [cancelledItem],
};

function SessionProbe() {
  const { clients, addClient } = useClientSession();
  const { addAppointment } = useAppointmentSession();
  const lea = clients.find((client) => client.id === 'client-agenda-lea');

  return (
    <>
      <Text testID="session-lea-first-name">{lea?.firstName ?? ''}</Text>
      <Text testID="session-lea-id">{lea?.id ?? ''}</Text>
      <Pressable
        testID="add-birthday-client"
        onPress={() =>
          addClient({
            id: 'client-birthday',
            firstName: 'Félix',
            lastName: 'Rouge',
            phone: '06 11 22 33 44',
            birthDate: '1994-10-12',
          })
        }
      />
      <Pressable
        testID="add-cancelled-appointment"
        onPress={() => addAppointment({ appointment: cancelledAppointment })}
      />
      <Pressable
        testID="add-business-cancelled-appointment"
        onPress={() => addAppointment({ appointment: businessCancelledAppointment })}
      />
      <Pressable
        testID="add-future-appointment"
        onPress={() => addAppointment({ appointment: futureAppointment })}
      />
    </>
  );
}

function renderProfile(clientId: string) {
  return render(
    <ClientSessionProvider>
      <AppointmentSessionProvider>
        <ClientProfileScreen clientId={clientId} />
        <SessionProbe />
      </AppointmentSessionProvider>
    </ClientSessionProvider>,
  );
}

const initialClients = createInitialClients();

describe('ClientProfileScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('shows a restrained not-found state for an unknown client id', async () => {
    const view = await renderProfile('client-missing');

    expect(view.getByText('Cliente introuvable')).toBeTruthy();
  });

  it('shows identity and Souris appointments for a fixture client', async () => {
    const view = await renderProfile('client-agenda-lea');

    expect(view.getByText('Léa Martin')).toBeTruthy();
    expect(view.getByText('Coloration')).toBeTruthy();
    expect(view.getByText(/09:00/)).toBeTruthy();
    expect(view.getByText('Rendez-vous réalisés')).toBeTruthy();
    expect(view.getByTestId('metric-completed').props.children).toBe('0');
    expect(view.getByTestId('metric-spent').props.children).toBe(formatPrice(0));
  });

  it('opens the existing Appointment Details from an appointment row', async () => {
    const view = await renderProfile('client-agenda-lea');

    await act(async () => {
      fireEvent.press(view.getByText('Coloration'));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/appointments/[appointmentId]',
      params: { appointmentId: 'agenda-lea' },
    });
  });

  it('navigates back through the native back control', async () => {
    const view = await renderProfile('client-agenda-lea');

    await act(async () => {
      fireEvent.press(view.getByLabelText('Retour'));
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows contact information and a friendly French birthday when present', async () => {
    const view = await renderProfile('client-birthday');

    await act(async () => {
      fireEvent.press(view.getByTestId('add-birthday-client'));
    });

    expect(view.getByText('Félix Rouge')).toBeTruthy();
    expect(view.getByText('06 11 22 33 44')).toBeTruthy();
    expect(view.getByText('12 octobre 1994')).toBeTruthy();
  });

  it('keeps the profile structure stable at zero: Activité with four zeros and the empty Rendez-vous state', async () => {
    const withoutAppointments = initialClients[0];

    const view = await renderProfile(withoutAppointments.id);

    expect(view.getByText('Activité')).toBeTruthy();
    expect(view.getByText('Rendez-vous réalisés')).toBeTruthy();
    expect(view.getByTestId('metric-completed').props.children).toBe('0');
    expect(view.getByTestId('metric-spent').props.children).toBe(formatPrice(0));
    expect(view.getByTestId('metric-noshow').props.children).toBe('0');
    expect(view.getByTestId('metric-cancelled').props.children).toBe('0');
    expect(view.getByText('Aucun rendez-vous enregistré.')).toBeTruthy();
    expect(view.queryByText(/0 visite|panier moyen/)).toBeNull();
  });

  it('keeps both cancellation actors visible while counting only the client cancellation', async () => {
    const view = await renderProfile('client-agenda-sofia');

    await act(async () => {
      fireEvent.press(view.getByTestId('add-cancelled-appointment'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('add-business-cancelled-appointment'));
    });

    expect(view.getByText(/Annulé par la cliente/)).toBeTruthy();
    expect(view.getByText(/Annulé par le salon/)).toBeTruthy();
    expect(view.getByTestId('metric-cancelled').props.children).toBe('1');
  });

  it('shows the next appointment when a future appointment exists', async () => {
    const view = await renderProfile('client-agenda-sofia');

    await act(async () => {
      fireEvent.press(view.getByTestId('add-future-appointment'));
    });

    expect(view.getByText('Prochain rendez-vous')).toBeTruthy();
    expect(view.getAllByText('Coupe')).toHaveLength(2);
  });

  it('opens the shared edit form prefilled and saves the updated identity', async () => {
    const view = await renderProfile('client-agenda-lea');

    await act(async () => {
      fireEvent.press(view.getByTestId('edit-client'));
    });

    expect(view.getByText('Modifier la cliente')).toBeTruthy();
    expect(view.getByDisplayValue('Léa')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prénom'), 'Léana');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom'), 'Martineau');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Enregistrer les modifications'));
    });

    expect(view.getByText('Léana Martineau')).toBeTruthy();
    expect(view.getByTestId('session-lea-first-name').props.children).toBe('Léana');
    expect(view.getByTestId('session-lea-id').props.children).toBe('client-agenda-lea');
  });

  it('discards edit changes on close', async () => {
    const view = await renderProfile('client-agenda-lea');

    await act(async () => {
      fireEvent.press(view.getByTestId('edit-client'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prénom'), 'Léana');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Fermer'));
    });

    expect(view.getByText('Léa Martin')).toBeTruthy();
    expect(view.queryByText('Léana')).toBeNull();
  });
});
