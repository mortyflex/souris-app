// BeautIzzy — OnlineBookingGateway bound to the owner RPCs and the public bucket
//
// Three SECURITY DEFINER owner RPCs and one PUBLIC Storage bucket
// (supabase/migrations/20261015120000_create_online_booking_profiles.sql).
// Uses the ONE publishable-key client with the signed-in owner's session.
// The public read of the website (`online_booking_public_profile`) is
// service_role only and is never called from the app.
//
// Images: JPEG only, checked for size BEFORE anything is sent; an object is
// never overwritten (`upsert: false`) — a replaced image is a new path.
// Remote errors are reduced to stable codes; their text never reaches the UI.

import type { PostgrestError } from '@supabase/supabase-js';

import {
  BOOKING_IMAGE_MAX_BYTES,
  OnlineBookingGatewayError,
  type BookingImageKind,
  type BookingProfile,
  type BookingProfileServerField,
  type OnlineBookingGateway,
  type SetBookingStateResult,
  type UpdateBookingProfileResult,
} from '@/features/online-booking/gateway';

import type { PhotoFileIO } from './business-media-gateway';
import type { SourisSupabaseClient } from './client';

export const BUSINESS_PUBLIC_MEDIA_BUCKET = 'business-public-media';

export type SupabaseOnlineBookingApi = Pick<SourisSupabaseClient, 'rpc' | 'storage'>;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const MEDIA_ID_PATTERN = new RegExp(`^${UUID}$`);
const OBJECT_PATH_PATTERN = new RegExp(`^${UUID}/(logo|cover)/${UUID}\\.jpg$`);

const SERVER_FIELDS: readonly BookingProfileServerField[] = [
  'public_name',
  'description',
  'public_phone',
  'public_email',
  'address',
  'logo_path',
  'cover_path',
];

/** Exported for tests: PostgREST / Postgres error → stable failure code. */
export function mapOnlineBookingPostgrestError(
  error: Pick<PostgrestError, 'code' | 'message'>,
): OnlineBookingGatewayError {
  const code = error.code ?? '';
  if (code === '' || /network request failed|failed to fetch|fetch failed/i.test(error.message)) {
    return new OnlineBookingGatewayError('NETWORK');
  }
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') {
    return new OnlineBookingGatewayError('FORBIDDEN', code);
  }
  return new OnlineBookingGatewayError('UNKNOWN', /^[0-9A-Z]{5,8}$/.test(code) ? code : undefined);
}

function asObject(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new OnlineBookingGatewayError('UNKNOWN', 'BADRESULT');
  }
  return data as Record<string, unknown>;
}

/** Exported for tests: jsonb owner view → validated profile. */
export function toBookingProfile(data: unknown): BookingProfile {
  const row = asObject(data);
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined;
  const flag = (value: unknown): boolean => {
    if (typeof value !== 'boolean') throw new OnlineBookingGatewayError('UNKNOWN', 'BADRESULT');
    return value;
  };
  const businessName = text(row.business_name);
  const mediaId = text(row.media_id);
  if (businessName === undefined || mediaId === undefined || !MEDIA_ID_PATTERN.test(mediaId)) {
    throw new OnlineBookingGatewayError('UNKNOWN', 'BADRESULT');
  }
  const optional = <K extends string>(key: K, value: unknown) => {
    const parsed = text(value);
    return parsed !== undefined ? ({ [key]: parsed } as Record<K, string>) : {};
  };
  return {
    businessName,
    mediaId,
    timeZone: text(row.time_zone) ?? 'Europe/Paris',
    published: flag(row.published),
    bookingEnabled: flag(row.booking_enabled),
    // Fail closed: an answer without these facts never reads as "may publish".
    publicationOpen: row.publication_open === true,
    plusAccess: row.plus_access === true,
    ...optional('slug', row.slug),
    ...optional('publicName', row.public_name),
    ...optional('description', row.description),
    ...optional('publicPhone', row.public_phone),
    ...optional('publicEmail', row.public_email),
    ...optional('address', row.address),
    ...optional('logoPath', row.logo_path),
    ...optional('coverPath', row.cover_path),
  };
}

/** A JPEG file starts with the SOI marker FF D8 FF. */
export function isJpeg(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes.slice(0, 3));
  return head.length === 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

export function createSupabaseOnlineBookingGateway(
  client: SupabaseOnlineBookingApi,
  io: Pick<PhotoFileIO, 'read'>,
  createId: () => string,
): OnlineBookingGateway {
  const bucket = () => client.storage.from(BUSINESS_PUBLIC_MEDIA_BUCKET);
  return {
    async readProfile(businessId) {
      const { data, error } = await client.rpc('online_booking_read_profile', {
        p_business_id: businessId,
      });
      if (error) throw mapOnlineBookingPostgrestError(error);
      return toBookingProfile(data);
    },

    async updateProfile(businessId, draft): Promise<UpdateBookingProfileResult> {
      const { data, error } = await client.rpc('online_booking_update_profile', {
        p_business_id: businessId,
        p_slug: draft.slug ?? null,
        p_public_name: draft.publicName ?? null,
        p_description: draft.description ?? null,
        p_public_phone: draft.publicPhone ?? null,
        p_public_email: draft.publicEmail ?? null,
        p_address: draft.address ?? null,
        p_logo_path: draft.logoPath ?? null,
        p_cover_path: draft.coverPath ?? null,
      });
      if (error) throw mapOnlineBookingPostgrestError(error);
      const row = asObject(data);
      if (row.status === 'INVALID_SLUG') return { status: 'INVALID_SLUG' };
      if (row.status === 'SLUG_UNAVAILABLE') return { status: 'SLUG_UNAVAILABLE' };
      if (row.status === 'INVALID_VALUE') {
        const field = SERVER_FIELDS.find((candidate) => candidate === row.field);
        return { status: 'INVALID_VALUE', ...(field !== undefined ? { field } : {}) };
      }
      if (row.status !== 'UPDATED') throw new OnlineBookingGatewayError('UNKNOWN', 'BADRESULT');
      return { status: 'UPDATED', profile: toBookingProfile(data) };
    },

    async setState(businessId, state): Promise<SetBookingStateResult> {
      const { data, error } = await client.rpc('online_booking_set_state', {
        p_business_id: businessId,
        p_published: state.published,
        p_booking_enabled: state.bookingEnabled,
      });
      if (error) throw mapOnlineBookingPostgrestError(error);
      const row = asObject(data);
      if (
        row.status === 'INCOMPLETE_PROFILE' ||
        row.status === 'PUBLICATION_UNAVAILABLE' ||
        row.status === 'ENTITLEMENT_REQUIRED'
      ) {
        return { status: row.status };
      }
      if (row.status !== 'UPDATED') throw new OnlineBookingGatewayError('UNKNOWN', 'BADRESULT');
      return { status: 'UPDATED', profile: toBookingProfile(data) };
    },

    async uploadImage(mediaId, kind: BookingImageKind, localFileUri) {
      if (!MEDIA_ID_PATTERN.test(mediaId)) throw new OnlineBookingGatewayError('UNKNOWN', 'BADPATH');
      const bytes = await io.read(localFileUri);
      if (!isJpeg(bytes)) throw new OnlineBookingGatewayError('IMAGE_INVALID');
      if (bytes.byteLength > BOOKING_IMAGE_MAX_BYTES) {
        throw new OnlineBookingGatewayError('IMAGE_TOO_LARGE');
      }
      const objectPath = `${mediaId}/${kind}/${createId()}.jpg`;
      if (!OBJECT_PATH_PATTERN.test(objectPath)) {
        throw new OnlineBookingGatewayError('UNKNOWN', 'BADPATH');
      }
      const { error } = await bucket().upload(objectPath, bytes, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (error) throw new OnlineBookingGatewayError('UNKNOWN', 'UPLOAD');
      return objectPath;
    },

    async removeImage(objectPath) {
      if (!OBJECT_PATH_PATTERN.test(objectPath)) {
        throw new OnlineBookingGatewayError('UNKNOWN', 'BADPATH');
      }
      const { error } = await bucket().remove([objectPath]);
      if (error) throw new OnlineBookingGatewayError('UNKNOWN', 'REMOVE');
    },

    imageUrl(objectPath) {
      return bucket().getPublicUrl(objectPath).data.publicUrl;
    },
  };
}
