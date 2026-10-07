// BeautIzzy — Client photo storage
//
// A Client photo is user data that must survive a reinstall and reach every
// device of the Business: its bytes live in the Business media storage and
// the Client row carries only the STABLE object path
// (persistence/media/business-media.ts owns the upload → commit → cleanup
// lifecycle and the local cache, shared with Product photos):
//
//   <business_id>/clients/<client_id>/<photo_id>.jpg
//
// Each device keeps a local cached copy under <documents>/client-photos/,
// derived from the path, so a photo shows offline once it has been seen (or
// taken) on that device.

import type { LocalFiles } from '@/persistence/files/local-files';
import {
  BusinessMediaUnavailableError,
  discardTemporaryMedia,
  getMediaCacheDirectoryUri,
  getMediaCacheUri,
  readCachedMediaUri,
  removeBusinessMedia,
  resolveBusinessMediaUri,
  saveBusinessMedia,
  type BusinessMediaRemote,
  type BusinessMediaStorage,
} from '@/persistence/media/business-media';

/** The remote Business media storage, bound to Supabase Storage at the application root. */
export type ClientPhotoRemote = BusinessMediaRemote;
export type ClientPhotoStorage = BusinessMediaStorage;

export const CLIENT_PHOTO_CACHE_DIRECTORY = 'client-photos/';

export function createClientPhotoPath(businessId: string, clientId: string, photoId: string): string {
  return `${businessId}/clients/${clientId}/${photoId}.jpg`;
}

export function getClientPhotoCacheDirectoryUri(files: LocalFiles): string {
  return getMediaCacheDirectoryUri(files, CLIENT_PHOTO_CACHE_DIRECTORY);
}

/** The local cached copy of a stored photo: one flat, deterministic file name per object path. */
export function getClientPhotoCacheUri(files: LocalFiles, photoPath: string): string {
  return getMediaCacheUri(files, CLIENT_PHOTO_CACHE_DIRECTORY, photoPath);
}

/** The displayable local file of a stored photo, when this device already holds it. */
export function readCachedClientPhotoUri(files: LocalFiles, photoPath: string): string | undefined {
  return readCachedMediaUri(files, CLIENT_PHOTO_CACHE_DIRECTORY, photoPath);
}

/** Deletes a temporary camera / picker / processing artifact. Never touches anything else. */
export const discardTemporaryPhoto = discardTemporaryMedia;

export { BusinessMediaUnavailableError as ClientPhotoUnavailableError };

export interface SaveClientPhotoInput {
  readonly businessId: string;
  readonly clientId: string;
  readonly photoId: string;
  /** The prepared (normalized) local JPEG. Consumed when temporary. */
  readonly sourceUri: string;
  /** The Client's current photo, removed once the new one is committed. */
  readonly previousPhotoPath?: string;
  /** Persists the new path on the Client (local database + sync). */
  readonly commit: (photoPath: string) => void;
}

/**
 * Stores a new Client photo and returns its path. Throws — with the Client
 * and its previous photo untouched — when the upload or the commit fails.
 */
export function saveClientPhoto(
  storage: ClientPhotoStorage,
  input: SaveClientPhotoInput,
): Promise<string> {
  return saveBusinessMedia(storage, {
    objectPath: createClientPhotoPath(input.businessId, input.clientId, input.photoId),
    cacheDirectory: CLIENT_PHOTO_CACHE_DIRECTORY,
    sourceUri: input.sourceUri,
    previousObjectPath: input.previousPhotoPath,
    commit: input.commit,
  });
}

/**
 * Clears the Client photo reference at once (throws, changing nothing, when
 * the commit fails), then removes the stored object and its cache.
 */
export function removeClientPhoto(
  storage: ClientPhotoStorage,
  input: { readonly photoPath: string; readonly commit: (photoPath: undefined) => void },
): void {
  removeBusinessMedia(storage, {
    objectPath: input.photoPath,
    cacheDirectory: CLIENT_PHOTO_CACHE_DIRECTORY,
    commit: () => input.commit(undefined),
  });
}

/**
 * The displayable local file of a stored photo: the cached copy, or a fresh
 * download of the object. Undefined when it cannot be had — the caller then
 * shows the initials.
 */
export function resolveClientPhotoUri(
  storage: ClientPhotoStorage,
  photoPath: string,
): Promise<string | undefined> {
  return resolveBusinessMediaUri(storage, CLIENT_PHOTO_CACHE_DIRECTORY, photoPath);
}
