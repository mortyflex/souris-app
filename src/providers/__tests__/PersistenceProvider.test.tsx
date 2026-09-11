import { act, fireEvent, render } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import type { SourisDatabase } from '@/persistence/database';
import type { FirstRunSeed } from '@/persistence/seed';
import { createTestSeed } from '@/persistence/testing/fixtures';
import { createMemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { PersistenceProvider, usePersistence } from '../PersistenceProvider';

let mounts = 0;

function Probe() {
  const { snapshot, resetForDevelopment } = usePersistence();
  const [clientCount, setClientCount] = useState(snapshot.clients.length);
  useEffect(() => {
    mounts += 1;
  }, []);

  return (
    <>
      <Text testID="clients">{clientCount}</Text>
      <Pressable testID="drop-local" onPress={() => setClientCount(0)} />
      <Pressable testID="reset" onPress={resetForDevelopment} />
    </>
  );
}

async function renderProvider(
  openDatabase: () => SourisDatabase,
  files = createMemoryLocalFiles(),
  createDevelopmentSeed?: () => FirstRunSeed,
) {
  const createSeed = jest.fn(createTestSeed);
  const onSettled = jest.fn();
  const view = await render(
    <PersistenceProvider
      createDevelopmentSeed={createDevelopmentSeed}
      createSeed={createSeed}
      files={files}
      onSettled={onSettled}
      openDatabase={openDatabase}
    >
      <Probe />
    </PersistenceProvider>,
  );
  return { view, createSeed, onSettled, files };
}

describe('PersistenceProvider', () => {
  beforeEach(() => {
    mounts = 0;
  });

  it('renders children only once the snapshot is hydrated and settles once', async () => {
    const { view, createSeed, onSettled } = await renderProvider(openTestDatabase);

    expect(view.getByTestId('clients').props.children).toBe(1);
    expect(createSeed).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('persistence-failure')).toBeNull();
  });

  it('reaches the same failure state when the database cannot be opened, and retry opens a fresh one', async () => {
    const openDatabase = jest
      .fn<SourisDatabase, []>()
      .mockImplementationOnce(() => {
        throw new Error('unable to open database file');
      })
      .mockImplementation(openTestDatabase);
    const { view, onSettled } = await renderProvider(openDatabase);

    expect(view.getByTestId('persistence-failure')).toBeTruthy();
    expect(view.getByText('Réessayer')).toBeTruthy();
    expect(onSettled).toHaveBeenCalledTimes(1);

    await act(async () => fireEvent.press(view.getByText('Réessayer')));

    expect(openDatabase).toHaveBeenCalledTimes(2);
    expect(view.queryByTestId('persistence-failure')).toBeNull();
    expect(view.getByTestId('clients').props.children).toBe(1);
  });

  it('shows a recoverable failure state when migration fails and retries with a fresh connection', async () => {
    const database = openTestDatabase();
    const failing: SourisDatabase = {
      ...database,
      getFirstSync: jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('disk I/O error');
        })
        .mockImplementation((sql: string, params?: readonly (string | number | null)[]) =>
          database.getFirstSync(sql, params),
        ),
    };
    // Retry opens a FRESH connection: the failing one is closed and replaced.
    const openDatabase = jest
      .fn<SourisDatabase, []>()
      .mockImplementationOnce(() => failing)
      .mockImplementation(openTestDatabase);
    const { view, onSettled } = await renderProvider(openDatabase);

    expect(view.getByTestId('persistence-failure')).toBeTruthy();
    expect(onSettled).toHaveBeenCalledTimes(1);

    await act(async () => fireEvent.press(view.getByText('Réessayer')));

    expect(openDatabase).toHaveBeenCalledTimes(2);
    expect(view.queryByTestId('persistence-failure')).toBeNull();
    expect(view.getByTestId('clients').props.children).toBe(1);
  });

  it('development reset wipes rows and owned images, seeds the DEVELOPMENT seed, and remounts the feature tree', async () => {
    const database = openTestDatabase();
    const files = createMemoryLocalFiles();
    files.addFile('file:///app/Documents/products/product-mask-1.jpg');
    files.addFile('file:///shared/Photos/IMG_0001.heic');
    const createDevelopmentSeed = jest.fn(() =>
      createTestSeed({ clients: [...createTestSeed().clients, { id: 'client-agenda-dev', firstName: 'Dev' }] }),
    );
    const { view, createSeed } = await renderProvider(() => database, files, createDevelopmentSeed);
    database.runSync("DELETE FROM clients WHERE id = 'client-lea'");
    await act(async () => fireEvent.press(view.getByTestId('drop-local')));
    expect(view.getByTestId('clients').props.children).toBe(0);
    expect(mounts).toBe(1);

    await act(async () => fireEvent.press(view.getByTestId('reset')));

    expect(createSeed).toHaveBeenCalledTimes(1);
    expect(createDevelopmentSeed).toHaveBeenCalledTimes(1);
    expect(mounts).toBe(2);
    expect(view.getByTestId('clients').props.children).toBe(2);
    expect(files.listFiles()).toEqual(['file:///shared/Photos/IMG_0001.heic']);
  });
});
