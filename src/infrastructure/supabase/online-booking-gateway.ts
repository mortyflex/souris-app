// BeautIzzy — OnlineBookingGateway bound to the owner RPCs and the public bucket
//
// Seven SECURITY DEFINER owner RPCs and one PUBLIC Storage bucket
// (supabase/migrations/20261015120000_create_online_booking_profiles.sql,
// 20261016120000_create_online_booking_working_hours.sql,
// 20261021120000_add_online_booking_service_publication.sql). Uses the ONE
// publishable-key client with the signed-in owner's session. The public read
// of the website (`online_booking_public_profile`) is service_role only and
// is never called from the app.
//
// Images: JPEG only, checked for size BEFORE anything is sent; an object is
// never overwritten (`upsert: false`) — a replaced image is a new path.
// Working hours: one day per write, sent in its saved form; the answer is
// the whole week, parsed strictly (seven days, Monday first, whole minutes).
// Services offered online: the owner view is parsed strictly and fails closed
// (`bookable` must be `selected AND eligible`, the counts must add up); a
// project without 20261021120000 answers UNAVAILABLE, never a fake state.
// Remote errors are reduced to stable codes; their text never reaches the UI.

import type { PostgrestError } from '@supabase/supabase-js';

import {
  ISO_WEEKDAYS,
  isMinuteOfDay,
  normalizeWorkingDay,
  type WorkingDay,
  type WorkingInterval,
} from '@/domain/online-booking';
import {
  BOOKING_IMAGE_MAX_BYTES,
  OnlineBookingGatewayError,
  SERVICE_PUBLICATION_MAX_IDS,
  type BookingImageKind,
  type BookingProfile,
  type BookingProfileServerField,
  type OnlineBookingGateway,
  type PublishableService,
  type PublishableServiceCategory,
  type SaveWorkingDayResult,
  type ServicePublication,
  type ServicePublicationIssue,
  type SetBookingStateResult,
  type SetServicePublicationResult,
  type UpdateBookingProfileResult,
  type WorkingDayServerIssue,
  type WorkingHours,
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

const WORKING_DAY_SERVER_ISSUES: readonly WorkingDayServerIssue[] = [
  'INVALID_DAY',
  'INTERVAL_REQUIRED',
  'CLOSED_DAY_INTERVALS',
  'TOO_MANY_INTERVALS',
  'INVALID_INTERVAL',
  'OVERLAP',
];

function toWorkingInterval(value: unknown): WorkingInterval {
  const row = asObject(value);
  const startMinute = row.start_minute;
  const endMinute = row.end_minute;
  if (!isMinuteOfDay(startMinute) || !isMinuteOfDay(endMinute) || endMinute <= startMinute) {
    throw new OnlineBookingGatewayError('UNKNOWN', 'BADRESULT');
  }
  return { startMinute, endMinute };
}

/** Exported for tests: jsonb week → validated working hours. */
export function toWorkingHours(data: unknown): WorkingHours {
  const row = asObject(data);
  const timeZone = row.time_zone;
  const days = row.days;
  if (typeof timeZone !== 'string' || timeZone.length === 0 || !Array.isArray(days) || days.length !== 7) {
    throw new OnlineBookingGatewayError('UNKNOWN', 'BADRESULT');
  }
  return {
    timeZone,
    days: ISO_WEEKDAYS.map((weekday, index): WorkingDay => {
      const day = asObject(days[index]);
      if (day.weekday !== weekday || typeof day.is_open !== 'boolean' || !Array.isArray(day.intervals)) {
        throw new OnlineBookingGatewayError('UNKNOWN', 'BADRESULT');
      }
      return { weekday, isOpen: day.is_open, intervals: day.intervals.map(toWorkingInterval) };
    }),
  };
}

const SERVICE_PUBLICATION_ISSUES: readonly ServicePublicationIssue[] = [
  'DELETED',
  'INACTIVE',
  'NO_DURATION',
  'TOO_LONG',
];

const isWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

function badResult(): never {
  throw new OnlineBookingGatewayError('UNKNOWN', 'BADRESULT');
}

function toPublishableServiceCategory(value: unknown): PublishableServiceCategory | undefined {
  if (value === null || value === undefined) return undefined;
  const row = asObject(value);
  if (typeof row.id !== 'string' || row.id.length === 0 || typeof row.name !== 'string' || !isWholeNumber(row.position)) {
    badResult();
  }
  return { id: row.id, name: row.name, position: row.position };
}

function toPublishableService(value: unknown): PublishableService {
  const row = asObject(value);
  const { id, name, type, active, price_cents: priceCents, duration_minutes: durationMinutes } = row;
  const { description, selected, eligible, bookable } = row;
  if (typeof id !== 'string' || id.length === 0 || typeof name !== 'string') badResult();
  if (type !== 'SERVICE' && type !== 'TECHNIQUE') badResult();
  if (typeof active !== 'boolean' || !isWholeNumber(priceCents) || !isWholeNumber(durationMinutes)) badResult();
  if (description !== null && description !== undefined && typeof description !== 'string') badResult();
  if (typeof selected !== 'boolean' || typeof eligible !== 'boolean' || typeof bookable !== 'boolean') badResult();
  // Fail closed: an answer that contradicts THE rule is not an answer.
  if (bookable !== (selected && eligible)) badResult();
  const category = toPublishableServiceCategory(row.category);
  const reason = eligible
    ? undefined
    : SERVICE_PUBLICATION_ISSUES.find((candidate) => candidate === row.ineligible_reason);
  return {
    id,
    name,
    type,
    active,
    priceCents,
    durationMinutes,
    selected,
    eligible,
    bookable,
    ...(typeof description === 'string' && description.length > 0 ? { description } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(reason !== undefined ? { ineligibleReason: reason } : {}),
  };
}

/** Exported for tests: jsonb owner view of the catalogue → validated publication. */
export function toServicePublication(data: unknown): ServicePublication {
  const row = asObject(data);
  const { max_service_minutes: maxServiceMinutes, selected_count: selectedCount, bookable_count: bookableCount } = row;
  if (!isWholeNumber(maxServiceMinutes) || !isWholeNumber(selectedCount) || !isWholeNumber(bookableCount)) badResult();
  if (!Array.isArray(row.services)) badResult();
  const services = row.services.map(toPublishableService);
  if (new Set(services.map((service) => service.id)).size !== services.length) badResult();
  if (
    selectedCount !== services.filter((service) => service.selected).length ||
    bookableCount !== services.filter((service) => service.bookable).length
  ) {
    badResult();
  }
  return { maxServiceMinutes, selectedCount, bookableCount, services };
}

/**
 * A project where 20261021120000 is not applied has no such function:
 * PostgREST answers PGRST202 (not in its schema cache), Postgres 42883.
 * Only the service-publication calls read it as UNAVAILABLE.
 */
function mapServicePublicationError(error: Pick<PostgrestError, 'code' | 'message'>): OnlineBookingGatewayError {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return new OnlineBookingGatewayError('UNAVAILABLE', error.code);
  }
  return mapOnlineBookingPostgrestError(error);
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

    async readWorkingHours(businessId) {
      const { data, error } = await client.rpc('online_booking_read_working_hours', {
        p_business_id: businessId,
      });
      if (error) throw mapOnlineBookingPostgrestError(error);
      return toWorkingHours(data);
    },

    async saveWorkingDay(businessId, day): Promise<SaveWorkingDayResult> {
      const saved = normalizeWorkingDay(day);
      const { data, error } = await client.rpc('online_booking_save_working_day', {
        p_business_id: businessId,
        p_weekday: saved.weekday,
        p_is_open: saved.isOpen,
        p_intervals: saved.intervals.map((interval) => ({
          start_minute: interval.startMinute,
          end_minute: interval.endMinute,
        })),
      });
      if (error) throw mapOnlineBookingPostgrestError(error);
      const row = asObject(data);
      if (row.status === 'INVALID_DAY') {
        const reason = WORKING_DAY_SERVER_ISSUES.find((candidate) => candidate === row.reason);
        return { status: 'INVALID_DAY', ...(reason !== undefined ? { reason } : {}) };
      }
      if (row.status !== 'UPDATED') throw new OnlineBookingGatewayError('UNKNOWN', 'BADRESULT');
      return { status: 'UPDATED', workingHours: toWorkingHours(data) };
    },

    async readServicePublication(businessId) {
      const { data, error } = await client.rpc('online_booking_read_service_publication', {
        p_business_id: businessId,
      });
      if (error) throw mapServicePublicationError(error);
      return toServicePublication(data);
    },

    async setServicePublication(businessId, serviceIds, selected): Promise<SetServicePublicationResult> {
      const ids = [...new Set(serviceIds)];
      // The server refuses these too (22023); nothing malformed is ever sent.
      if (
        ids.length === 0 ||
        ids.length > SERVICE_PUBLICATION_MAX_IDS ||
        ids.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 200)
      ) {
        throw new OnlineBookingGatewayError('UNKNOWN', 'BADREQUEST');
      }
      const { data, error } = await client.rpc('online_booking_set_service_publication', {
        p_business_id: businessId,
        p_service_ids: ids,
        p_selected: selected,
      });
      if (error) throw mapServicePublicationError(error);
      const row = asObject(data);
      if (row.status === 'UNKNOWN_SERVICE' || row.status === 'NOT_ELIGIBLE') {
        if (typeof row.service_id !== 'string' || row.service_id.length === 0) badResult();
        if (row.status === 'UNKNOWN_SERVICE') return { status: 'UNKNOWN_SERVICE', serviceId: row.service_id };
        const reason = SERVICE_PUBLICATION_ISSUES.find((candidate) => candidate === row.reason);
        return { status: 'NOT_ELIGIBLE', serviceId: row.service_id, ...(reason !== undefined ? { reason } : {}) };
      }
      if (row.status !== 'UPDATED') badResult();
      return { status: 'UPDATED', publication: toServicePublication(data) };
    },
  };
}
