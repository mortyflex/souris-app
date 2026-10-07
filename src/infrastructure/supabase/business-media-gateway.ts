// BeautIzzy — Business media (Client and Product photos) in Supabase Storage
//
// Binds the BusinessMediaRemote boundary to the private `business-media`
// bucket (supabase/migrations/20260925120000_add_client_photos.sql, PNG
// admitted by 20260926120000_add_product_photos.sql): owner-only RLS on the
// first path folder, the Business id, so one Business can never read or
// write another's photos. Uses the ONE publishable-key client
// with the signed-in owner's session.
//
// Objects are never overwritten (`upsert: false`): a new photo is a new
// path. Reads go through a short-lived signed URL that is used once, for the
// download, and never stored. Remote errors are reduced to a plain failure —
// their text never reaches the UI.

import type { BusinessMediaRemote } from '@/persistence/media/business-media';

import type { SourisSupabaseClient } from './client';

export const BUSINESS_MEDIA_BUCKET = 'business-media';
const SIGNED_URL_SECONDS = 60;

export type SupabaseStorageApi = Pick<SourisSupabaseClient, 'storage'>;

/** Local file access the gateway needs; bound to expo-file-system in photo-file-io.ts. */
export interface PhotoFileIO {
  read(fileUri: string): Promise<ArrayBuffer>;
  download(url: string, destinationUri: string): Promise<void>;
}

export class BusinessMediaRemoteError extends Error {
  constructor(readonly operation: 'upload' | 'download' | 'remove') {
    super(`Business media ${operation} failed`);
    this.name = 'BusinessMediaRemoteError';
  }
}

/** A cut-out Product photo is a transparent PNG; every other photo is a JPEG. */
export function mediaContentType(objectPath: string): 'image/png' | 'image/jpeg' {
  return /\.png$/i.test(objectPath) ? 'image/png' : 'image/jpeg';
}

export function createSupabaseBusinessMediaGateway(
  client: SupabaseStorageApi,
  io: PhotoFileIO,
): BusinessMediaRemote {
  const bucket = () => client.storage.from(BUSINESS_MEDIA_BUCKET);
  return {
    async upload(objectPath, localFileUri) {
      const bytes = await io.read(localFileUri);
      const { error } = await bucket().upload(objectPath, bytes, {
        contentType: mediaContentType(objectPath),
        upsert: false,
      });
      if (error) throw new BusinessMediaRemoteError('upload');
    },
    async download(objectPath, destinationUri) {
      const { data, error } = await bucket().createSignedUrl(objectPath, SIGNED_URL_SECONDS);
      if (error || !data?.signedUrl) throw new BusinessMediaRemoteError('download');
      await io.download(data.signedUrl, destinationUri);
    },
    async remove(objectPath) {
      const { error } = await bucket().remove([objectPath]);
      if (error) throw new BusinessMediaRemoteError('remove');
    },
  };
}
