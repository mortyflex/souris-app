import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { Appointment } from '@/domain/appointments';
import type { Sale } from '@/domain/sales';
import { createTestSeed } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { ClientDeleteConflictError } from '@/persistence/stores/clients';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { ClientSessionProvider, useClientSession } from '../ClientSessionProvider';

const appointmentForNadia: Appointment = {
  id: 'appointment-nadia',
  businessId: 'business-test',
  clientId: 'client-nadia',
  staffMemberId: 'staff-amelie',
  startAt: new Date(2026, 8, 12, 9),
  status: 'NO_SHOW',
  noShow: { recordedAt: new Date(2026, 8, 12, 10) },
  items: [
    {
      id: 'appointment-nadia-item',
      serviceId: 'service-cut',
      order: 0,
      serviceName: 'Coupe',
      serviceType: 'SERVICE',
      price: 42,
      phases: [{ id: 'cut', name: 'Coupe', durationMinutes: 45, requiresStaff: true }],
    },
  ],
};

const saleForNadia: Sale = {
  id: 'sale-nadia',
  businessId: 'business-test',
  clientId: 'client-nadia',
  completedAt: new Date(2026, 8, 10),
  items: [{ id: 'sale-nadia-item', productId: 'product-serum', productName: 'Sérum', unitPrice: 32, quantity: 1 }],
};

function Probe() {
  const {
    clients,
    activeClients,
    archivedClients,
    getClientById,
    archiveClient,
    restoreClient,
    updateClient,
    getClientDeletionEligibility,
    deleteClientPermanently,
  } = useClientSession();
  const nadia = getClientById('client-nadia');

  const attempt = (task: () => void) => {
    try {
      task();
      return 'ok';
    } catch (error) {
      return error instanceof ClientDeleteConflictError
        ? `conflict:${error.references.appointmentCount}:${error.references.saleCount}`
        : `error:${(error as Error).message}`;
    }
  };

  return (
    <>
      <Text testID="all">{clients.map((client) => client.id).join(',')}</Text>
      <Text testID="active">{activeClients.map((client) => client.id).join(',')}</Text>
      <Text testID="archived">{archivedClients.map((client) => client.id).join(',')}</Text>
      <Text testID="nadia">
        {nadia
          ? `${nadia.firstName}:${nadia.archivedAt ? nadia.archivedAt.toISOString() : 'active'}:${'archivedAt' in nadia}`
          : 'missing'}
      </Text>
      <Text testID="eligibility">
        {nadia ? String(getClientDeletionEligibility('client-nadia').deletable) : ''}
      </Text>
      <Pressable testID="archive" onPress={() => archiveClient('client-nadia')} />
      <Pressable testID="restore" onPress={() => restoreClient('client-nadia')} />
      <Pressable
        testID="rename"
        onPress={() => updateClient({ id: 'client-nadia', firstName: 'Nadia', lastName: 'Roy' })}
      />
      <Pressable testID="delete" onPress={() => deleteClientPermanently('client-nadia')} />
      <Pressable
        testID="archive-unknown"
        onPress={() => {
          lastOutcome = attempt(() => archiveClient('client-ghost'));
        }}
      />
      <Pressable
        testID="delete-attempt"
        onPress={() => {
          lastOutcome = attempt(() => deleteClientPermanently('client-nadia'));
        }}
      />
    </>
  );
}

/** Outcome of the last guarded mutation, read by the tests after the press. */
let lastOutcome = '';

function tree(db: ReturnType<typeof openTestDatabase>, seed: ReturnType<typeof createTestSeed>) {
  return (
    <TestPersistenceProvider database={db} createSeed={() => seed}>
      <ClientSessionProvider>
        <Probe />
      </ClientSessionProvider>
    </TestPersistenceProvider>
  );
}

const seedWithNadia = createTestSeed({
  clients: [{ id: 'client-lea', firstName: 'Léa' }, { id: 'client-nadia', firstName: 'Nadia' }],
  appointments: [],
});

async function press(view: Awaited<ReturnType<typeof render>>, testID: string) {
  await act(async () => fireEvent.press(view.getByTestId(testID)));
}

describe('ClientSessionProvider lifecycle', () => {
  beforeEach(() => {
    lastOutcome = '';
  });

  it('hydrates every Client as active and derives the active/archived collections', async () => {
    const view = await render(tree(openTestDatabase(), seedWithNadia));

    expect(view.getByTestId('all').props.children).toBe('client-lea,client-nadia');
    expect(view.getByTestId('active').props.children).toBe('client-lea,client-nadia');
    expect(view.getByTestId('archived').props.children).toBe('');
    expect(view.getByTestId('nadia').props.children).toBe('Nadia:active:false');
  });

  it('archives with a Date, keeps the Client resolvable, and restores by removing archivedAt', async () => {
    const view = await render(tree(openTestDatabase(), seedWithNadia));

    await press(view, 'archive');

    expect(view.getByTestId('active').props.children).toBe('client-lea');
    expect(view.getByTestId('archived').props.children).toBe('client-nadia');
    expect(view.getByTestId('all').props.children).toBe('client-lea,client-nadia');
    expect(view.getByTestId('nadia').props.children).toMatch(/^Nadia:\d{4}-\d{2}-\d{2}T.*Z:true$/);

    await press(view, 'restore');

    expect(view.getByTestId('active').props.children).toBe('client-lea,client-nadia');
    expect(view.getByTestId('archived').props.children).toBe('');
    expect(view.getByTestId('nadia').props.children).toBe('Nadia:active:false');
  });

  it('keeps the archived state when identity is edited', async () => {
    const view = await render(tree(openTestDatabase(), seedWithNadia));

    await press(view, 'archive');
    await press(view, 'rename');

    expect(view.getByTestId('archived').props.children).toBe('client-nadia');
    expect(view.getByTestId('nadia').props.children).toMatch(/^Nadia:.*Z:true$/);
  });

  it('preserves the exact lifecycle across an app restart, without re-seeding', async () => {
    const db = openTestDatabase();
    const first = await render(tree(db, seedWithNadia));
    await press(first, 'archive');
    const archivedLabel = first.getByTestId('nadia').props.children as string;
    await first.unmount();

    const second = await render(tree(db, seedWithNadia));
    expect(second.getByTestId('all').props.children).toBe('client-lea,client-nadia');
    expect(second.getByTestId('archived').props.children).toBe('client-nadia');
    expect(second.getByTestId('nadia').props.children).toBe(archivedLabel);

    await press(second, 'restore');
    await second.unmount();

    const third = await render(tree(db, seedWithNadia));
    expect(third.getByTestId('active').props.children).toBe('client-lea,client-nadia');
    expect(third.getByTestId('nadia').props.children).toBe('Nadia:active:false');
  });

  it('leaves state untouched when archiving an unknown Client', async () => {
    const view = await render(tree(openTestDatabase(), seedWithNadia));

    await press(view, 'archive-unknown');

    expect(lastOutcome).toBe('error:archiveClient: Client "client-ghost" not found');
    expect(view.getByTestId('all').props.children).toBe('client-lea,client-nadia');
    expect(view.getByTestId('archived').props.children).toBe('');
  });

  it('permanently deletes an unreferenced Client from the database and the session, surviving restart', async () => {
    const db = openTestDatabase();
    const view = await render(tree(db, seedWithNadia));

    await press(view, 'archive');
    expect(view.getByTestId('eligibility').props.children).toBe('true');
    await press(view, 'delete');

    expect(view.getByTestId('all').props.children).toBe('client-lea');
    expect(view.getByTestId('nadia').props.children).toBe('missing');
    await view.unmount();

    const restarted = await render(tree(db, seedWithNadia));
    expect(restarted.getByTestId('all').props.children).toBe('client-lea');
  });

  it('refuses deletion with a typed conflict when an Appointment references the Client', async () => {
    const view = await render(
      tree(openTestDatabase(), createTestSeed({ ...seedWithNadia, appointments: [appointmentForNadia] })),
    );

    await press(view, 'archive');
    expect(view.getByTestId('eligibility').props.children).toBe('false');
    await press(view, 'delete-attempt');

    expect(lastOutcome).toBe('conflict:1:0');
    expect(view.getByTestId('all').props.children).toBe('client-lea,client-nadia');
    expect(view.getByTestId('archived').props.children).toBe('client-nadia');
  });

  it('refuses deletion when a Sale references the Client, and when both do', async () => {
    const db = openTestDatabase();
    const view = await render(tree(db, createTestSeed({ ...seedWithNadia, sales: [saleForNadia] })));

    await press(view, 'delete-attempt');
    expect(lastOutcome).toBe('conflict:0:1');
    expect(view.getByTestId('all').props.children).toBe('client-lea,client-nadia');

    await view.unmount();
    const both = await render(
      tree(
        openTestDatabase(),
        createTestSeed({ ...seedWithNadia, appointments: [appointmentForNadia], sales: [saleForNadia] }),
      ),
    );
    await press(both, 'delete-attempt');
    expect(lastOutcome).toBe('conflict:1:1');
    expect(both.getByTestId('all').props.children).toBe('client-lea,client-nadia');
  });
});
