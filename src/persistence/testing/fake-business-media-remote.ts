// Souris — in-memory Business media remote for tests (never imported by app code)
//
// One shared object store, like the Business media bucket: `forDevice` gives
// another device's view of the SAME store, writing downloads into that
// device's files.

import type { MemoryLocalFiles } from './memory-local-files';

import type { BusinessMediaRemote } from '../media/business-media';

export interface FakeBusinessMediaRemote extends BusinessMediaRemote {
  readonly objects: Map<string, string>;
  failUploads: boolean;
  failDownloads: boolean;
  failRemovals: boolean;
  downloadCount: number;
  onUpload?: (objectPath: string) => void;
  forDevice(files: MemoryLocalFiles): BusinessMediaRemote;
}

export function createFakeBusinessMediaRemote(files: MemoryLocalFiles): FakeBusinessMediaRemote {
  const objects = new Map<string, string>();

  const bind = (device: MemoryLocalFiles): BusinessMediaRemote => ({
    upload: async (objectPath, localFileUri) => {
      if (remote.failUploads) throw new Error('upload failed');
      if (objects.has(objectPath)) throw new Error('object exists');
      const content = device.readFile(localFileUri);
      if (content === undefined) throw new Error('missing local file');
      objects.set(objectPath, content);
      remote.onUpload?.(objectPath);
    },
    download: async (objectPath, destinationUri) => {
      if (remote.failDownloads) throw new Error('download failed');
      const content = objects.get(objectPath);
      if (content === undefined) throw new Error('object not found');
      remote.downloadCount += 1;
      device.addFile(destinationUri, content);
    },
    remove: async (objectPath) => {
      if (remote.failRemovals) throw new Error('remove failed');
      objects.delete(objectPath);
    },
  });

  const remote: FakeBusinessMediaRemote = {
    objects,
    failUploads: false,
    failDownloads: false,
    failRemovals: false,
    downloadCount: 0,
    ...bind(files),
    forDevice: bind,
  };
  return remote;
}
