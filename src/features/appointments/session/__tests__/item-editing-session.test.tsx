import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { Appointment } from '@/domain/appointments';
import type { SourisDatabase } from '@/persistence/database';
import { loadAppointments } from '@/persistence/stores/appointments';
import { loadServices } from '@/persistence/stores/services';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { AppointmentSessionProvider, useAppointmentSession } from '../AppointmentSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

/** A real SQLite database whose item writes can be made to fail on demand. */
function openFailableDatabase() {
  const native = openTestDatabase();
  const control = { failItemWrites: false };
  const database: SourisDatabase = {
    ...native,
    runSync: (sql, params) => {
      if (
        control.failItemWrites &&
        /^(UPDATE appointment_items SET item_order|DELETE FROM appointment_items)/.test(sql)
      ) {
        throw new Error('disk full');
      }
      return native.runSync(sql, params);
    },
  };
  return { database, control };
}

const APPOINTMENT_ID = 'three-service-appointment';

/** Three days ahead: previous-day reconciliation must never touch this Appointment. */
const threeServices: Appointment = {
  id: APPOINTMENT_ID,
  businessId: 'fixture-business',
  clientId: 'client-agenda-sofia',
  staffMemberId: 'staff-amelie',
  startAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  status: 'SCHEDULED',
  items: [
    {
      id: 'it-coupe',
      serviceId: 'service-cut',
      order: 0,
      serviceName: 'Coupe',
      serviceType: 'SERVICE',
      price: 30,
      phases: [{ id: 'coupe-phase', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
    },
    {
      id: 'it-balayage',
      serviceId: 'service-highlights',
      order: 1,
      serviceName: 'Balayage',
      serviceType: 'TECHNIQUE',
      price: 50,
      phases: [
        { id: 'bal-application', name: 'Application', durationMinutes: 45, requiresStaff: true },
        { id: 'bal-pose', name: 'Temps de pose', durationMinutes: 40, requiresStaff: false },
      ],
    },
    {
      id: 'it-brushing',
      serviceId: 'service-brushing',
      order: 2,
      serviceName: 'Brushing',
      serviceType: 'SERVICE',
      price: 20,
      phases: [{ id: 'brushing-phase', name: 'Brushing', durationMinutes: 20, requiresStaff: true }],
    },
  ],
};

function Probe() {
  const { addAppointment, getAppointmentById, removeAppointmentItem, reorderAppointmentItems } =
    useAppointmentSession();
  const entry = getAppointmentById(APPOINTMENT_ID);
  const attempt = (task: () => void) => {
    try {
      task();
    } catch {
      // Failures are observed through unchanged state below.
    }
  };
  return (
    <>
      <Text testID="items">
        {(entry?.appointment.items ?? [])
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((item) => `${item.id}:${item.order}:${item.phases.map((phase) => phase.durationMinutes).join('/')}`)
          .join('|')}
      </Text>
      <Text testID="status">{entry?.appointment.status ?? 'missing'}</Text>
      <Pressable testID="seed" onPress={() => addAppointment({ appointment: threeServices })} />
      <Pressable
        testID="reorder-balayage-first"
        onPress={() => attempt(() => reorderAppointmentItems(APPOINTMENT_ID, ['it-balayage', 'it-coupe', 'it-brushing']))}
      />
      <Pressable
        testID="reorder-invalid"
        onPress={() => attempt(() => reorderAppointmentItems(APPOINTMENT_ID, ['it-balayage', 'it-coupe']))}
      />
      <Pressable
        testID="remove-balayage"
        onPress={() => attempt(() => removeAppointmentItem(APPOINTMENT_ID, 'it-balayage'))}
      />
      <Pressable
        testID="remove-coupe"
        onPress={() => attempt(() => removeAppointmentItem(APPOINTMENT_ID, 'it-coupe'))}
      />
      <Pressable
        testID="remove-brushing"
        onPress={() => attempt(() => removeAppointmentItem(APPOINTMENT_ID, 'it-brushing'))}
      />
    </>
  );
}

async function renderSession(database?: SourisDatabase) {
  const view = await render(
    <TestPersistenceProvider database={database}>
      <AppointmentSessionProvider>
        <Probe />
      </AppointmentSessionProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {
    fireEvent.press(view.getByTestId('seed'));
  });
  expect(view.getByTestId('items').props.children).toBe(
    'it-coupe:0:30|it-balayage:1:45/40|it-brushing:2:20',
  );
  return view;
}

async function press(view: Awaited<ReturnType<typeof renderSession>>, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
}

function storedItems(database: SourisDatabase): string {
  const stored = loadAppointments(database).find((appointment) => appointment.id === APPOINTMENT_ID);
  return (stored?.items ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => `${item.id}:${item.order}`)
    .join('|');
}

describe('AppointmentSessionProvider — direct item edits', () => {
  it('reorders by stable ids, persists the order, and leaves timing snapshots and the catalog untouched', async () => {
    const { database } = openFailableDatabase();
    const view = await renderSession(database);
    const catalogBefore = JSON.stringify(loadServices(database));

    await press(view, 'reorder-balayage-first');

    expect(view.getByTestId('items').props.children).toBe(
      'it-balayage:0:45/40|it-coupe:1:30|it-brushing:2:20',
    );
    expect(storedItems(database)).toBe('it-balayage:0|it-coupe:1|it-brushing:2');
    expect(JSON.stringify(loadServices(database))).toBe(catalogBefore);
  });

  it('refuses an order that does not match the items — nothing changes', async () => {
    const { database } = openFailableDatabase();
    const view = await renderSession(database);

    await press(view, 'reorder-invalid');

    expect(view.getByTestId('items').props.children).toBe(
      'it-coupe:0:30|it-balayage:1:45/40|it-brushing:2:20',
    );
    expect(storedItems(database)).toBe('it-coupe:0|it-balayage:1|it-brushing:2');
  });

  it('removes one item, normalizes the order, persists, and keeps the last item forever', async () => {
    const { database } = openFailableDatabase();
    const view = await renderSession(database);

    await press(view, 'remove-balayage');
    expect(view.getByTestId('items').props.children).toBe('it-coupe:0:30|it-brushing:1:20');
    expect(storedItems(database)).toBe('it-coupe:0|it-brushing:1');

    await press(view, 'remove-coupe');
    expect(view.getByTestId('items').props.children).toBe('it-brushing:0:20');

    // The last Service can never be removed: session and SQLite keep it.
    await press(view, 'remove-brushing');
    expect(view.getByTestId('items').props.children).toBe('it-brushing:0:20');
    expect(storedItems(database)).toBe('it-brushing:0');
  });

  it('leaves session state and the stored rows unchanged when a reorder or a removal write fails', async () => {
    const { database, control } = openFailableDatabase();
    const view = await renderSession(database);
    control.failItemWrites = true;

    await press(view, 'reorder-balayage-first');
    await press(view, 'remove-balayage');

    expect(view.getByTestId('items').props.children).toBe(
      'it-coupe:0:30|it-balayage:1:45/40|it-brushing:2:20',
    );
    expect(storedItems(database)).toBe('it-coupe:0|it-balayage:1|it-brushing:2');

    control.failItemWrites = false;
    await press(view, 'remove-balayage');
    expect(storedItems(database)).toBe('it-coupe:0|it-brushing:1');
  });
});
