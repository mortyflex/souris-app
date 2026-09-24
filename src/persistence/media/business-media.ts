// Souris — Business media storage (Client photos, Product photos)
//
// A photo that must survive a reinstall and reach every device of the
// Business lives in the Business media storage (Supabase Storage, private
// `business-media` bucket, owner-only RLS — CLOUD_SYNC.md §22 / §23). The
// record (Client, Product) carries only the STABLE object path:
//
//   <business_id>/<kind>/<record_id>/<photo_id>.<jpg|png>
//
// Every new photo is a NEW object, so the path changes with the photo and no
// cache ever serves a stale image under a reused name. Signed URLs are never
// stored. Each device keeps a local cached copy under
// <documents>/<cache directory>/, derived from the path: the cache is never
// authoritative — the path is.
//
// Save — nothing is referenced before it exists remotely:
//
//   copy the prepared file into the local cache
//   → upload the object                      failure: cache copy removed, NOTHING changed
//   → commit the path on the record          failure: new object removed, NOTHING changed
//   → remove the replaced object + its cache (best effort: a leftover never
//     fails a committed save)
//
// Remove — local-first: the reference is cleared at once (and synced like any
// record change), then the object and its cache are removed best effort.

import { isInsideDirectory, type LocalFiles } from '@/persistence/files/local-files';

/** The remote Business media storage, bound to Supabase Storage at the application root. */
export interface BusinessMediaRemote {
  /** Uploads a local JPEG / PNG as a NEW object; never overwrites. */
  upload(objectPath: string, localFileUri: string): Promise<void>;
  /** Downloads an object into a local file that must not exist yet. */
  download(objectPath: string, destinationUri: string): Promise<void>;
  remove(objectPath: string): Promise<void>;
}

export interface BusinessMediaStorage {
  readonly files: LocalFiles;
  /** Undefined when cloud storage is not configured: nothing can be saved then. */
  readonly remote: BusinessMediaRemote | undefined;
}

/** `<documents>/<directory>` — `directory` ends with `/` (e.g. `client-photos/`). */
export function getMediaCacheDirectoryUri(files: LocalFiles, directory: string): string {
  return `${files.documentDirectoryUri}${directory}`;
}

/** The local cached copy of a stored object: one flat, deterministic file name per path. */
export function getMediaCacheUri(files: LocalFiles, directory: string, objectPath: string): string {
  return `${getMediaCacheDirectoryUri(files, directory)}${objectPath.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

/** The displayable local file of a stored object, when this device already holds it. */
export function readCachedMediaUri(
  files: LocalFiles,
  directory: string,
  objectPath: string,
): string | undefined {
  const uri = getMediaCacheUri(files, directory, objectPath);
  return files.exists(uri) ? uri : undefined;
}

export function safely(task: () => void): void {
  try {
    task();
  } catch {
    // Cleanup is best effort.
  }
}

/** Deletes a temporary camera / picker / processing artifact. Never touches anything else. */
export function discardTemporaryMedia(files: LocalFiles, uri: string): void {
  if (isInsideDirectory(uri, files.cacheDirectoryUri)) safely(() => files.delete(uri));
}

/** Removes a stored object and its local copy. Best effort, never throws. */
export function discardStoredMedia(
  storage: BusinessMediaStorage,
  directory: string,
  objectPath: string,
): void {
  const { files, remote } = storage;
  safely(() => files.delete(getMediaCacheUri(files, directory, objectPath)));
  void remote?.remove(objectPath).catch(() => {});
}

export class BusinessMediaUnavailableError extends Error {
  constructor() {
    super('Business media storage is not available');
    this.name = 'BusinessMediaUnavailableError';
  }
}

export interface SaveBusinessMediaInput {
  /** The NEW object path (a new photo id). */
  readonly objectPath: string;
  readonly cacheDirectory: string;
  /** The prepared (normalized) local file. Consumed when temporary. */
  readonly sourceUri: string;
  /** The record's current object, removed once the new one is committed. */
  readonly previousObjectPath?: string;
  /** Persists the new path on the record (local database + sync). */
  readonly commit: (objectPath: string) => void;
}

/**
 * Stores a new photo and returns its path. Throws — with the record and its
 * previous photo untouched — when the upload or the commit fails.
 */
export async function saveBusinessMedia(
  storage: BusinessMediaStorage,
  input: SaveBusinessMediaInput,
): Promise<string> {
  const { files, remote } = storage;
  const { objectPath, cacheDirectory, sourceUri, previousObjectPath, commit } = input;
  if (!remote) {
    discardTemporaryMedia(files, sourceUri);
    throw new BusinessMediaUnavailableError();
  }

  const cacheUri = getMediaCacheUri(files, cacheDirectory, objectPath);
  try {
    files.ensureDirectory(getMediaCacheDirectoryUri(files, cacheDirectory));
    await files.copy(sourceUri, cacheUri);
    await remote.upload(objectPath, cacheUri);
  } catch (error) {
    safely(() => files.delete(cacheUri));
    throw error;
  } finally {
    discardTemporaryMedia(files, sourceUri);
  }

  try {
    commit(objectPath);
  } catch (error) {
    discardStoredMedia(storage, cacheDirectory, objectPath);
    throw error;
  }

  if (previousObjectPath !== undefined && previousObjectPath !== objectPath) {
    discardStoredMedia(storage, cacheDirectory, previousObjectPath);
  }
  return objectPath;
}

/**
 * Clears the record's reference at once (throws, changing nothing, when the
 * commit fails), then removes the stored object and its cache.
 */
export function removeBusinessMedia(
  storage: BusinessMediaStorage,
  input: {
    readonly objectPath: string;
    readonly cacheDirectory: string;
    readonly commit: () => void;
  },
): void {
  input.commit();
  discardStoredMedia(storage, input.cacheDirectory, input.objectPath);
}

const downloads = new Map<string, Promise<string | undefined>>();
let downloadSequence = 0;

/**
 * The displayable local file of a stored object: the cached copy, or a fresh
 * download (into a temporary file first, so an interrupted download never
 * leaves a broken cache). Undefined when it cannot be had — the caller then
 * shows its fallback. Concurrent calls share one download.
 */
export function resolveBusinessMediaUri(
  storage: BusinessMediaStorage,
  cacheDirectory: string,
  objectPath: string,
): Promise<string | undefined> {
  const { files, remote } = storage;
  const cached = readCachedMediaUri(files, cacheDirectory, objectPath);
  if (cached) return Promise.resolve(cached);
  if (!remote) return Promise.resolve(undefined);

  const key = `${cacheDirectory}${objectPath}`;
  const inFlight = downloads.get(key);
  if (inFlight) return inFlight;

  const cacheUri = getMediaCacheUri(files, cacheDirectory, objectPath);
  downloadSequence += 1;
  const temporaryUri = `${files.cacheDirectoryUri}media-download-${Date.now()}-${downloadSequence}`;
  const download = (async () => {
    try {
      await remote.download(objectPath, temporaryUri);
      files.ensureDirectory(getMediaCacheDirectoryUri(files, cacheDirectory));
      if (!files.exists(cacheUri)) await files.copy(temporaryUri, cacheUri);
      return cacheUri;
    } catch {
      return undefined;
    } finally {
      safely(() => files.delete(temporaryUri));
      downloads.delete(key);
    }
  })();
  downloads.set(key, download);
  return download;
}
