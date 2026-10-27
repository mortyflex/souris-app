// BeautIzzy — the LocalFiles of a Playground demo (development ONLY)
//
// The demo runtime hands the real screens a file boundary that never reaches
// the device file system: every URI lives under a `file:///playground-demo/`
// prefix that no production directory uses, and every entry lives in this
// object's memory and dies with it. Nothing is created in the application's
// Documents or Caches directories, and nothing of them is read.
//
// Media (client photos, product photos) also needs the Business media remote,
// which the demo leaves undefined: the screens report the photo as
// unavailable before any copy is attempted (persistence/media/business-media.ts).

import { isInsideDirectory, type LocalFiles } from '@/persistence/files/local-files';

export const DEMO_DOCUMENT_DIRECTORY_URI = 'file:///playground-demo/Documents/';
export const DEMO_CACHE_DIRECTORY_URI = 'file:///playground-demo/Caches/';

export function createPlaygroundDemoFiles(): LocalFiles {
  const files = new Set<string>();
  const directories = new Set<string>([DEMO_DOCUMENT_DIRECTORY_URI, DEMO_CACHE_DIRECTORY_URI]);

  return {
    documentDirectoryUri: DEMO_DOCUMENT_DIRECTORY_URI,
    cacheDirectoryUri: DEMO_CACHE_DIRECTORY_URI,
    exists: (fileUri) => files.has(fileUri),
    ensureDirectory: (directoryUri) => {
      directories.add(directoryUri);
    },
    copy: async (sourceUri, destinationUri) => {
      if (!files.has(sourceUri)) {
        throw new Error(`Playground demo files: source "${sourceUri}" does not exist in the demo`);
      }
      if (files.has(destinationUri)) {
        throw new Error(`Playground demo files: destination "${destinationUri}" already exists`);
      }
      files.add(destinationUri);
    },
    delete: (fileUri) => {
      files.delete(fileUri);
    },
    deleteDirectory: (directoryUri) => {
      for (const uri of [...files]) {
        if (isInsideDirectory(uri, directoryUri)) files.delete(uri);
      }
      directories.delete(directoryUri);
    },
  };
}
