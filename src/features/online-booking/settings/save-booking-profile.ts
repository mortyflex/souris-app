// BeautIzzy — saving a booking profile draft, images included
//
//   upload the newly picked images (new object paths)
//   → replace the draft fields in ONE server call
//   → delete the objects the profile no longer references
//
// Nothing is queued: a failure leaves the stored profile exactly as it was,
// and the images uploaded for the failed attempt are deleted again. Cleanup
// is best effort — an unreferenced object is never shown anywhere.

import type { BookingProfileFields } from '@/domain/online-booking';

import type {
  BookingImageKind,
  BookingProfile,
  OnlineBookingGateway,
  UpdateBookingProfileResult,
} from '../gateway';

export type BookingImageDraft =
  /** Keep whatever the profile stores. */
  | { readonly kind: 'stored' }
  /** A prepared local JPEG to upload on save. */
  | { readonly kind: 'picked'; readonly uri: string }
  | { readonly kind: 'removed' };

export type BookingImageDrafts = Readonly<Record<BookingImageKind, BookingImageDraft>>;

export const UNCHANGED_BOOKING_IMAGES: BookingImageDrafts = {
  logo: { kind: 'stored' },
  cover: { kind: 'stored' },
};

const optional = (text: string): string | undefined => {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export async function saveBookingProfile(
  gateway: OnlineBookingGateway,
  businessId: string,
  profile: BookingProfile,
  fields: BookingProfileFields,
  images: BookingImageDrafts,
): Promise<UpdateBookingProfileResult> {
  const uploaded: string[] = [];
  const discard = (paths: readonly string[]) =>
    Promise.all(paths.map((path) => gateway.removeImage(path).catch(() => undefined)));

  const resolve = async (kind: BookingImageKind, stored: string | undefined) => {
    const draft = images[kind];
    if (draft.kind === 'removed') return undefined;
    if (draft.kind === 'stored') return stored;
    const path = await gateway.uploadImage(profile.mediaId, kind, draft.uri);
    uploaded.push(path);
    return path;
  };

  let result: UpdateBookingProfileResult;
  let logoPath: string | undefined;
  let coverPath: string | undefined;
  try {
    logoPath = await resolve('logo', profile.logoPath);
    coverPath = await resolve('cover', profile.coverPath);
    result = await gateway.updateProfile(businessId, {
      slug: optional(fields.slug),
      publicName: optional(fields.publicName),
      description: optional(fields.description),
      publicPhone: optional(fields.publicPhone),
      publicEmail: optional(fields.publicEmail),
      address: optional(fields.address),
      logoPath,
      coverPath,
    });
  } catch (error) {
    await discard(uploaded);
    throw error;
  }

  if (result.status !== 'UPDATED') {
    await discard(uploaded);
    return result;
  }

  const replaced = [
    profile.logoPath !== logoPath ? profile.logoPath : undefined,
    profile.coverPath !== coverPath ? profile.coverPath : undefined,
  ].filter((path): path is string => path !== undefined);
  await discard(replaced);
  return result;
}
