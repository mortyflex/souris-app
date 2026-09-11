// Souris — in-memory LocalFiles for tests
//
// Records every file as a URI → content entry so tests can assert exactly
// which files exist after a Product image commit. Never imported by
// application code.

import { isInsideDirectory, type LocalFiles } from '../files/local-files';

export interface MemoryLocalFiles extends LocalFiles {
  /** Registers a pre-existing file (a camera capture, a library copy, …). */
  addFile(fileUri: string, content?: string): void;
  listFiles(): readonly string[];
  readFile(fileUri: string): string | undefined;
}

export function createMemoryLocalFiles(
  options: { documentDirectoryUri?: string; cacheDirectoryUri?: string } = {},
): MemoryLocalFiles {
  const documentDirectoryUri = options.documentDirectoryUri ?? 'file:///app/Documents/';
  const cacheDirectoryUri = options.cacheDirectoryUri ?? 'file:///app/Caches/';
  const files = new Map<string, string>();
  const directories = new Set<string>([documentDirectoryUri, cacheDirectoryUri]);

  return {
    documentDirectoryUri,
    cacheDirectoryUri,
    addFile: (fileUri, content = fileUri) => {
      files.set(fileUri, content);
    },
    listFiles: () => [...files.keys()].sort(),
    readFile: (fileUri) => files.get(fileUri),
    exists: (fileUri) => files.has(fileUri),
    ensureDirectory: (directoryUri) => {
      directories.add(directoryUri);
    },
    copy: async (sourceUri, destinationUri) => {
      const content = files.get(sourceUri);
      if (content === undefined) {
        throw new Error(`copy: source "${sourceUri}" does not exist`);
      }
      if (files.has(destinationUri)) {
        throw new Error(`copy: destination "${destinationUri}" already exists`);
      }
      const parent = destinationUri.slice(0, destinationUri.lastIndexOf('/') + 1);
      if (!directories.has(parent)) {
        throw new Error(`copy: directory "${parent}" does not exist`);
      }
      files.set(destinationUri, content);
    },
    delete: (fileUri) => {
      files.delete(fileUri);
    },
    deleteDirectory: (directoryUri) => {
      for (const uri of [...files.keys()]) {
        if (isInsideDirectory(uri, directoryUri)) files.delete(uri);
      }
      directories.delete(directoryUri);
    },
  };
}
