// Souris — local file boundary
//
// The minimal file surface needed to keep Product images durable. Production
// binds it to expo-file-system (expo-local-files.ts); tests use an in-memory
// implementation (testing/memory-local-files.ts). Every URI is a `file://`
// string; directory URIs end with `/`.

export interface LocalFiles {
  /** App-owned documents directory: survives restarts and system cache cleanup. */
  readonly documentDirectoryUri: string;
  /** Temporary directory used by the camera, the image picker, and Vision output. */
  readonly cacheDirectoryUri: string;
  exists(fileUri: string): boolean;
  /** Creates the directory (and parents) when missing; no-op otherwise. */
  ensureDirectory(directoryUri: string): void;
  /** Copies a file; the destination must not exist. */
  copy(sourceUri: string, destinationUri: string): Promise<void>;
  /** Deletes one file; missing files are a no-op. */
  delete(fileUri: string): void;
  /** Deletes a directory and everything under it; missing directories are a no-op. */
  deleteDirectory(directoryUri: string): void;
}

export function isInsideDirectory(uri: string, directoryUri: string): boolean {
  return uri.startsWith(directoryUri) && uri.length > directoryUri.length;
}
