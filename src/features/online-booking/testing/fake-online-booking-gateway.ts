// BeautIzzy — in-memory OnlineBookingGateway (tests only)
//
// The server contract of the owner RPCs and the public bucket, deterministic
// and offline: one profile per Business (an empty draft on first read, like
// the server), the slug and publication refusals, the weekly working hours
// (seven closed days until a day is saved, the same validation as the
// server), and scriptable failures.

import {
  closedWorkingDay,
  ISO_WEEKDAYS,
  isValidBookingSlug,
  normalizeWorkingDay,
  validateWorkingDay,
  type WorkingDay,
} from '@/domain/online-booking';

import {
  OnlineBookingGatewayError,
  type BookingProfile,
  type BookingProfileDraft,
  type OnlineBookingFailureCode,
  type OnlineBookingGateway,
  type WorkingHours,
} from '../gateway';

export const FAKE_MEDIA_ID = '99999999-9999-4999-8999-999999999999';

export interface FakeOnlineBookingGateway extends OnlineBookingGateway {
  readonly calls: {
    read: number;
    update: number;
    setState: number;
    upload: number;
    remove: number;
    readHours: number;
    saveDay: number;
  };
  /** Every day the server accepted, in its saved form, in order. */
  readonly savedDays: WorkingDay[];
  /** Replaces the stored week of a Business (days not given stay as they are). */
  seedWorkingHours(businessId: string, days: readonly WorkingDay[]): void;
  /** Draft of every accepted update, in order. */
  readonly updates: BookingProfileDraft[];
  /** Object paths currently stored in the bucket. */
  readonly objects: Set<string>;
  /** Makes the NEXT call fail with the given code. */
  failNext(code: OnlineBookingFailureCode): void;
  /** Slugs owned by other professionals. */
  readonly takenSlugs: Set<string>;
  /** Plays the operator switch and the verified Plus access of the owner. */
  setPublicationRule(rule: { readonly publicationOpen: boolean; readonly plusAccess: boolean }): void;
  seedProfile(businessId: string, profile: Partial<BookingProfile>): void;
}

export function createFakeOnlineBookingGateway(businessName = 'Salon Amélie'): FakeOnlineBookingGateway {
  const profiles = new Map<string, BookingProfile>();
  const calls = { read: 0, update: 0, setState: 0, upload: 0, remove: 0, readHours: 0, saveDay: 0 };
  const updates: BookingProfileDraft[] = [];
  const weeks = new Map<string, readonly WorkingDay[]>();
  const savedDays: WorkingDay[] = [];

  const weekOf = (businessId: string): WorkingHours => ({
    timeZone: 'Europe/Paris',
    days: weeks.get(businessId) ?? ISO_WEEKDAYS.map(closedWorkingDay),
  });
  const storeDays = (businessId: string, days: readonly WorkingDay[]) => {
    const current = weekOf(businessId).days;
    weeks.set(
      businessId,
      current.map((stored) => {
        const replacement = days.find((day) => day.weekday === stored.weekday);
        return replacement !== undefined ? normalizeWorkingDay(replacement) : stored;
      }),
    );
  };
  const objects = new Set<string>();
  const takenSlugs = new Set<string>();
  let rule = { publicationOpen: false, plusAccess: false };
  let pendingFailure: OnlineBookingFailureCode | undefined;
  let uploadCount = 0;

  const failIfScripted = () => {
    if (pendingFailure === undefined) return;
    const code = pendingFailure;
    pendingFailure = undefined;
    throw new OnlineBookingGatewayError(code);
  };

  const current = (businessId: string): BookingProfile => {
    const stored = profiles.get(businessId) ?? {
      businessName,
      mediaId: FAKE_MEDIA_ID,
      timeZone: 'Europe/Paris',
      published: false,
      bookingEnabled: false,
      publicationOpen: false,
      plusAccess: false,
    };
    const profile = { ...stored, ...rule };
    profiles.set(businessId, profile);
    return profile;
  };

  return {
    calls,
    updates,
    savedDays,
    objects,
    takenSlugs,
    failNext(code) {
      pendingFailure = code;
    },
    seedWorkingHours(businessId, days) {
      storeDays(businessId, days);
    },
    setPublicationRule(next) {
      rule = next;
    },
    seedProfile(businessId, profile) {
      profiles.set(businessId, { ...current(businessId), ...profile });
    },

    async readProfile(businessId) {
      calls.read += 1;
      failIfScripted();
      return current(businessId);
    },

    async updateProfile(businessId, draft) {
      calls.update += 1;
      failIfScripted();
      const profile = current(businessId);
      if (draft.slug === undefined) {
        if (profile.published) return { status: 'INVALID_SLUG' };
      } else if (!isValidBookingSlug(draft.slug)) {
        return { status: 'INVALID_SLUG' };
      } else if (takenSlugs.has(draft.slug)) {
        return { status: 'SLUG_UNAVAILABLE' };
      }
      updates.push(draft);
      const { businessName: name, mediaId, timeZone, published, bookingEnabled, publicationOpen, plusAccess } = profile;
      const defined = Object.fromEntries(
        Object.entries(draft).filter(([, value]) => value !== undefined),
      ) as BookingProfileDraft;
      const next: BookingProfile = {
        businessName: name,
        mediaId,
        timeZone,
        published,
        bookingEnabled,
        publicationOpen,
        plusAccess,
        ...defined,
      };
      profiles.set(businessId, next);
      return { status: 'UPDATED', profile: next };
    },

    async setState(businessId, state) {
      calls.setState += 1;
      failIfScripted();
      const profile = current(businessId);
      const bookingEnabled = state.published && state.bookingEnabled;
      const turningOn =
        (state.published && !profile.published) || (bookingEnabled && !profile.bookingEnabled);
      if (turningOn) {
        if (profile.slug === undefined) return { status: 'INCOMPLETE_PROFILE' };
        if (!rule.publicationOpen) return { status: 'PUBLICATION_UNAVAILABLE' };
        if (!rule.plusAccess) return { status: 'ENTITLEMENT_REQUIRED' };
      }
      const next = { ...profile, published: state.published, bookingEnabled };
      profiles.set(businessId, next);
      return { status: 'UPDATED', profile: next };
    },

    async uploadImage(mediaId, kind) {
      calls.upload += 1;
      failIfScripted();
      uploadCount += 1;
      const path = `${mediaId}/${kind}/00000000-0000-4000-8000-${String(uploadCount).padStart(12, '0')}.jpg`;
      objects.add(path);
      return path;
    },

    async removeImage(objectPath) {
      calls.remove += 1;
      failIfScripted();
      objects.delete(objectPath);
    },

    imageUrl(objectPath) {
      return `https://media.example.test/${objectPath}`;
    },

    async readWorkingHours(businessId) {
      calls.readHours += 1;
      failIfScripted();
      return weekOf(businessId);
    },

    async saveWorkingDay(businessId, day) {
      calls.saveDay += 1;
      failIfScripted();
      const validation = validateWorkingDay(day);
      if (!validation.valid) {
        return {
          status: 'INVALID_DAY',
          reason:
            validation.dayIssue ??
            (validation.intervalIssues.includes('OVERLAP') ? 'OVERLAP' : 'INVALID_INTERVAL'),
        };
      }
      const saved = normalizeWorkingDay(day);
      savedDays.push(saved);
      storeDays(businessId, [saved]);
      return { status: 'UPDATED', workingHours: weekOf(businessId) };
    },
  };
}
