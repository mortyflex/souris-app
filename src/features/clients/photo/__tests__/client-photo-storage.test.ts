// Souris — Client photo storage lifecycle (upload → commit → cleanup)

import { createMemoryLocalFiles, type MemoryLocalFiles } from '@/persistence/testing/memory-local-files';

import {
  createClientPhotoPath,
  getClientPhotoCacheUri,
  readCachedClientPhotoUri,
  removeClientPhoto,
  resolveClientPhotoUri,
  saveClientPhoto,
  type ClientPhotoRemote,
} from '../client-photo-storage';
import {
  createFakeBusinessMediaRemote as createFakeClientPhotoRemote,
  type FakeBusinessMediaRemote as FakeClientPhotoRemote,
} from '@/persistence/testing/fake-business-media-remote';

const BUSINESS_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = 'client-lea';
const PREPARED = 'file:///app/Caches/ImageManipulator/prepared.jpg';

function setup() {
  const files = createMemoryLocalFiles();
  const remote = createFakeClientPhotoRemote(files);
  files.addFile(PREPARED, 'portrait-1');
  return { files, remote, storage: { files, remote } };
}

async function saveFirstPhoto(
  files: MemoryLocalFiles,
  remote: FakeClientPhotoRemote,
  commit: (path: string) => void = () => {},
) {
  return saveClientPhoto(
    { files, remote },
    { businessId: BUSINESS_ID, clientId: CLIENT_ID, photoId: 'photo-1', sourceUri: PREPARED, commit },
  );
}

describe('Client photo paths', () => {
  it('scopes every object under its Business and Client, one new object per photo', () => {
    expect(createClientPhotoPath(BUSINESS_ID, CLIENT_ID, 'photo-1')).toBe(
      `${BUSINESS_ID}/clients/client-lea/photo-1.jpg`,
    );
  });

  it('caches a photo under the app documents, as one flat file per path', () => {
    const files = createMemoryLocalFiles();
    expect(getClientPhotoCacheUri(files, `${BUSINESS_ID}/clients/client-lea/photo-1.jpg`)).toBe(
      `file:///app/Documents/client-photos/${BUSINESS_ID}_clients_client-lea_photo-1.jpg`,
    );
  });
});

describe('saveClientPhoto', () => {
  it('uploads first, then commits the stable path, and keeps a local copy', async () => {
    const { files, remote } = setup();
    const events: string[] = [];
    remote.onUpload = () => events.push('upload');

    const path = await saveFirstPhoto(files, remote, (committed) => events.push(`commit ${committed}`));

    expect(path).toBe(`${BUSINESS_ID}/clients/client-lea/photo-1.jpg`);
    expect(events).toEqual(['upload', `commit ${path}`]);
    expect(remote.objects.get(path)).toBe('portrait-1');
    expect(readCachedClientPhotoUri(files, path)).toBe(getClientPhotoCacheUri(files, path));
    // The temporary processed file is consumed; never referenced.
    expect(files.exists(PREPARED)).toBe(false);
  });

  it('never commits and leaves nothing behind when the upload fails', async () => {
    const { files, remote } = setup();
    remote.failUploads = true;
    const commit = jest.fn();

    await expect(saveFirstPhoto(files, remote, commit)).rejects.toThrow();
    expect(commit).not.toHaveBeenCalled();
    expect(remote.objects.size).toBe(0);
    expect(files.listFiles()).toEqual([]);
  });

  it('removes the new object when the commit fails, keeping the previous photo', async () => {
    const { files, remote } = setup();
    const previous = await saveFirstPhoto(files, remote);
    files.addFile(PREPARED, 'portrait-2');

    await expect(
      saveClientPhoto(
        { files, remote },
        {
          businessId: BUSINESS_ID,
          clientId: CLIENT_ID,
          photoId: 'photo-2',
          sourceUri: PREPARED,
          previousPhotoPath: previous,
          commit: () => {
            throw new Error('database write failed');
          },
        },
      ),
    ).rejects.toThrow('database write failed');
    await Promise.resolve();

    expect([...remote.objects.keys()]).toEqual([previous]);
    expect(readCachedClientPhotoUri(files, previous)).toBeDefined();
    expect(readCachedClientPhotoUri(files, createClientPhotoPath(BUSINESS_ID, CLIENT_ID, 'photo-2'))).toBeUndefined();
  });

  it('replaces: the new photo is committed BEFORE the previous one is removed', async () => {
    const { files, remote } = setup();
    const previous = await saveFirstPhoto(files, remote);
    files.addFile(PREPARED, 'portrait-2');
    let objectsAtCommit: string[] = [];

    const next = await saveClientPhoto(
      { files, remote },
      {
        businessId: BUSINESS_ID,
        clientId: CLIENT_ID,
        photoId: 'photo-2',
        sourceUri: PREPARED,
        previousPhotoPath: previous,
        commit: () => {
          objectsAtCommit = [...remote.objects.keys()];
        },
      },
    );
    await Promise.resolve();

    expect(objectsAtCommit.sort()).toEqual([previous, next].sort());
    expect([...remote.objects.keys()]).toEqual([next]);
    expect(readCachedClientPhotoUri(files, previous)).toBeUndefined();
    expect(readCachedClientPhotoUri(files, next)).toBeDefined();
  });

  it('keeps the previous photo when the replacement upload fails', async () => {
    const { files, remote } = setup();
    const previous = await saveFirstPhoto(files, remote);
    files.addFile(PREPARED, 'portrait-2');
    remote.failUploads = true;
    const commit = jest.fn();

    await expect(
      saveClientPhoto(
        { files, remote },
        {
          businessId: BUSINESS_ID,
          clientId: CLIENT_ID,
          photoId: 'photo-2',
          sourceUri: PREPARED,
          previousPhotoPath: previous,
          commit,
        },
      ),
    ).rejects.toThrow();

    expect(commit).not.toHaveBeenCalled();
    expect(remote.objects.get(previous)).toBe('portrait-1');
    expect(readCachedClientPhotoUri(files, previous)).toBeDefined();
  });

  it('refuses to save without a remote storage: a photo is never local-only', async () => {
    const files = createMemoryLocalFiles();
    files.addFile(PREPARED);
    const commit = jest.fn();

    await expect(
      saveClientPhoto(
        { files, remote: undefined },
        { businessId: BUSINESS_ID, clientId: CLIENT_ID, photoId: 'p', sourceUri: PREPARED, commit },
      ),
    ).rejects.toThrow();
    expect(commit).not.toHaveBeenCalled();
    expect(files.listFiles()).toEqual([]);
  });
});

describe('removeClientPhoto', () => {
  it('clears the reference at once, then removes the object and the local copy', async () => {
    const { files, remote } = setup();
    const path = await saveFirstPhoto(files, remote);
    const commit = jest.fn();

    removeClientPhoto({ files, remote }, { photoPath: path, commit });
    await Promise.resolve();

    expect(commit).toHaveBeenCalledWith(undefined);
    expect(remote.objects.size).toBe(0);
    expect(readCachedClientPhotoUri(files, path)).toBeUndefined();
  });

  it('keeps everything when the reference cannot be cleared', async () => {
    const { files, remote } = setup();
    const path = await saveFirstPhoto(files, remote);

    expect(() =>
      removeClientPhoto(
        { files, remote },
        {
          photoPath: path,
          commit: () => {
            throw new Error('database write failed');
          },
        },
      ),
    ).toThrow();
    expect(remote.objects.has(path)).toBe(true);
    expect(readCachedClientPhotoUri(files, path)).toBeDefined();
  });

  it('stays local-first when the remote removal fails', async () => {
    const { files, remote } = setup();
    const path = await saveFirstPhoto(files, remote);
    remote.failRemovals = true;
    const commit = jest.fn();

    removeClientPhoto({ files, remote }, { photoPath: path, commit });
    await Promise.resolve();

    expect(commit).toHaveBeenCalledWith(undefined);
    expect(readCachedClientPhotoUri(files, path)).toBeUndefined();
  });
});

describe('resolveClientPhotoUri', () => {
  it('serves the local copy without any network', async () => {
    const { files, remote, storage } = setup();
    const path = await saveFirstPhoto(files, remote);
    remote.failDownloads = true;

    await expect(resolveClientPhotoUri(storage, path)).resolves.toBe(getClientPhotoCacheUri(files, path));
  });

  it('downloads a photo taken on ANOTHER device once, then serves it locally', async () => {
    const { files: firstDevice, remote } = setup();
    const path = await saveFirstPhoto(firstDevice, remote);

    const secondDevice = createMemoryLocalFiles();
    const sharedRemote: ClientPhotoRemote = remote.forDevice(secondDevice);
    const [uri, again] = await Promise.all([
      resolveClientPhotoUri({ files: secondDevice, remote: sharedRemote }, path),
      resolveClientPhotoUri({ files: secondDevice, remote: sharedRemote }, path),
    ]);

    expect(uri).toBe(getClientPhotoCacheUri(secondDevice, path));
    expect(again).toBe(uri);
    expect(remote.downloadCount).toBe(1);
    expect(secondDevice.readFile(uri!)).toBe('portrait-1');
    // Only the cached copy remains: the temporary download is gone.
    expect(secondDevice.listFiles()).toEqual([uri]);
  });

  it('falls back (undefined → initials) when the photo cannot be had', async () => {
    const { files, remote, storage } = setup();
    remote.failDownloads = true;

    await expect(resolveClientPhotoUri(storage, `${BUSINESS_ID}/clients/x/y.jpg`)).resolves.toBeUndefined();
    await expect(
      resolveClientPhotoUri({ files, remote: undefined }, `${BUSINESS_ID}/clients/x/y.jpg`),
    ).resolves.toBeUndefined();
    expect(files.listFiles()).toEqual([PREPARED]);
  });
});
