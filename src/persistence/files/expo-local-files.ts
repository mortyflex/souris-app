// Souris — expo-file-system binding of the LocalFiles boundary
//
// Only the application root creates it. Tests never import this module.

import { Directory, File, Paths } from 'expo-file-system';

import type { LocalFiles } from './local-files';

function withTrailingSlash(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`;
}

export function createExpoLocalFiles(): LocalFiles {
  return {
    documentDirectoryUri: withTrailingSlash(Paths.document.uri),
    cacheDirectoryUri: withTrailingSlash(Paths.cache.uri),
    exists: (fileUri) => new File(fileUri).exists,
    ensureDirectory: (directoryUri) => {
      new Directory(directoryUri).create({ intermediates: true, idempotent: true });
    },
    copy: async (sourceUri, destinationUri) => {
      await new File(sourceUri).copy(new File(destinationUri));
    },
    delete: (fileUri) => {
      const file = new File(fileUri);
      if (file.exists) file.delete();
    },
    deleteDirectory: (directoryUri) => {
      const directory = new Directory(directoryUri);
      if (directory.exists) directory.delete();
    },
  };
}
