// Souris — the app-side copy of the server reminder preference (Lot B)
//
// The server is authoritative; the provider mirrors it, keeps the
// Business-scoped cache fresh, falls back to that cache offline, and fails
// SAFE (disabled) when neither can answer.

import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { CommunicationsGatewayProvider } from '@/features/communications/session/CommunicationsGatewayProvider';
import {
  createFakeCommunicationsGateway,
  type FakeCommunicationsGateway,
} from '@/features/communications/testing/fake-communications-gateway';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { testBusiness, TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import {
  CommunicationPreferencesProvider,
  useCommunicationPreferences,
  type CommunicationPreferencesValue,
} from '../CommunicationPreferencesProvider';
import {
  readCachedCommunicationPreferences,
  writeCachedCommunicationPreferences,
} from '../preferences-cache';

function Probe({ capture }: { readonly capture: (value: CommunicationPreferencesValue) => void }) {
  const value = useCommunicationPreferences();
  capture(value);
  return <Text testID="probe-status">{value.state.status}</Text>;
}

async function renderProvider(
  gateway: FakeCommunicationsGateway | undefined,
  database = openTestDatabase(),
) {
  let latest: CommunicationPreferencesValue | undefined;
  const view = await render(
    <TestPersistenceProvider database={database}>
      <CommunicationsGatewayProvider gateway={gateway}>
        <CommunicationPreferencesProvider>
          <Probe
            capture={(value) => {
              latest = value;
            }}
          />
        </CommunicationPreferencesProvider>
      </CommunicationsGatewayProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return { view, database, value: () => latest! };
}

describe('loading', () => {
  it('mirrors the server answer and refreshes the cache', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedPreferences(testBusiness.id, {
      emailRemindersEnabled: true,
      replyToEmail: 'salon@example.test',
    });
    const { database, value } = await renderProvider(gateway);

    await waitFor(() => expect(value().state.status).toBe('ready'));
    expect(value().emailRemindersEnabled).toBe(true);
    expect(readCachedCommunicationPreferences(database, testBusiness.id)).toEqual({
      emailRemindersEnabled: true,
      replyToEmail: 'salon@example.test',
    });
  });

  it('falls back to the Business-scoped cache when the server cannot answer', async () => {
    const database = openTestDatabase();
    const gateway = createFakeCommunicationsGateway();
    gateway.failNext('NETWORK');
    // Bootstrap the schema first, then seed the cache the previous session wrote.
    const { value } = await (async () => {
      const rendered = await renderProvider(gateway, database);
      return rendered;
    })();
    // First load failed with an empty cache: offline, fail-safe disabled.
    expect(value().state.status).toBe('offline');
    expect(value().emailRemindersEnabled).toBe(false);

    writeCachedCommunicationPreferences(database, testBusiness.id, {
      emailRemindersEnabled: true,
      replyToEmail: 'salon@example.test',
    });
    gateway.failNext('NETWORK');
    await act(async () => {
      value().refresh();
    });
    await waitFor(() => expect(value().state.status).toBe('offline'));
    expect(value().emailRemindersEnabled).toBe(true);
    expect(value().state.preferences?.replyToEmail).toBe('salon@example.test');
  });

  it('a cache written for ANOTHER Business is never trusted', async () => {
    const database = openTestDatabase();
    const gateway = createFakeCommunicationsGateway();
    gateway.failNext('NETWORK');
    const { value } = await renderProvider(gateway, database);
    writeCachedCommunicationPreferences(database, 'another-business', {
      emailRemindersEnabled: true,
      replyToEmail: 'x@example.test',
    });
    gateway.failNext('NETWORK');
    await act(async () => {
      value().refresh();
    });
    expect(value().emailRemindersEnabled).toBe(false);
  });

  it('without a gateway (unconfigured Supabase) everything reads disabled', async () => {
    const { value } = await renderProvider(undefined);
    expect(value().state.status).toBe('offline');
    expect(value().emailRemindersEnabled).toBe(false);
  });
});

describe('updating', () => {
  it('persists on the server, then mirrors the accepted state and the cache', async () => {
    const gateway = createFakeCommunicationsGateway();
    const { database, value } = await renderProvider(gateway);

    await act(async () => {
      await value().update({ emailRemindersEnabled: true, replyToEmail: 'salon@example.test' });
    });

    expect(gateway.updates).toHaveLength(1);
    expect(value().emailRemindersEnabled).toBe(true);
    expect(readCachedCommunicationPreferences(database, testBusiness.id)?.emailRemindersEnabled).toBe(true);
  });

  it('a server refusal changes nothing locally', async () => {
    const gateway = createFakeCommunicationsGateway();
    const { database, value } = await renderProvider(gateway);

    await act(async () => {
      const result = await value().update({ emailRemindersEnabled: true, replyToEmail: 'nope' });
      expect(result.status).toBe('INVALID_REPLY_TO');
    });

    expect(value().emailRemindersEnabled).toBe(false);
    expect(readCachedCommunicationPreferences(database, testBusiness.id)?.emailRemindersEnabled ?? false).toBe(false);
  });
});
