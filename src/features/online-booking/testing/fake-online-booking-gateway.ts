// BeautIzzy — in-memory OnlineBookingGateway (tests only)
//
// The server contract of the owner RPCs and the public bucket, deterministic
// and offline: one profile per Business (an empty draft on first read, like
// the server), the slug and publication refusals, the weekly working hours
// (seven closed days until a day is saved, the same validation as the
// server), the services offered online (the server's catalogue view, THE
// eligibility rule, all-or-nothing changes per Business), scriptable failures
// and held (in-flight) calls.

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
  SERVICE_PUBLICATION_MAX_IDS,
  type BookingProfile,
  type BookingProfileDraft,
  type OnlineBookingFailureCode,
  type OnlineBookingGateway,
  type PublishableService,
  type PublishableServiceCategory,
  type ServicePublication,
  type ServicePublicationIssue,
  type WorkingHours,
} from '../gateway';

export const FAKE_MEDIA_ID = '99999999-9999-4999-8999-999999999999';

/** THE server's length limit of a bookable service (online_booking_rules, 12 hours). */
export const FAKE_MAX_SERVICE_MINUTES = 720;

/** A catalogue service as the server stores it (the synced row), for the fake. */
export interface FakeCatalogueService {
  readonly id: string;
  readonly name: string;
  readonly type?: 'SERVICE' | 'TECHNIQUE';
  readonly active?: boolean;
  readonly deleted?: boolean;
  readonly priceCents?: number;
  readonly durationMinutes: number;
  readonly description?: string;
  readonly categoryId?: string;
}

export interface FakeServicePublicationSeed {
  readonly services: readonly FakeCatalogueService[];
  readonly categories?: readonly PublishableServiceCategory[];
  /** The opt-ins already stored (the SQL Editor's, before any screen existed). */
  readonly selected?: readonly string[];
}

/** One selection change the fake server accepted. */
export interface FakeServicePublicationWrite {
  readonly businessId: string;
  readonly serviceIds: readonly string[];
  readonly selected: boolean;
}

/** THE eligibility rule of the server (online_booking_service_issue). */
function serviceIssue(service: FakeCatalogueService): ServicePublicationIssue | undefined {
  if (service.deleted === true) return 'DELETED';
  if (service.active === false) return 'INACTIVE';
  if (service.durationMinutes < 1) return 'NO_DURATION';
  if (service.durationMinutes > FAKE_MAX_SERVICE_MINUTES) return 'TOO_LONG';
  return undefined;
}

/** Codepoint order, like the server's `order by name, id`. */
const byNameThenId = (left: { name: string; id: string }, right: { name: string; id: string }) =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

export interface FakeOnlineBookingGateway extends OnlineBookingGateway {
  readonly calls: {
    read: number;
    update: number;
    setState: number;
    upload: number;
    remove: number;
    readHours: number;
    saveDay: number;
    readServices: number;
    setServices: number;
  };
  /** Replaces a Business's server-side catalogue, categories and opt-ins. */
  seedServicePublication(businessId: string, seed: FakeServicePublicationSeed): void;
  /** Another device changed a catalogue service (synced): active, deleted, price, description… */
  updateCatalogueService(businessId: string, serviceId: string, patch: Partial<FakeCatalogueService>): void;
  /** The ids a Business has selected, as the server stores them (sorted). */
  selectedServiceIds(businessId: string): readonly string[];
  /** Every selection change the server accepted, in order. */
  readonly serviceWrites: FakeServicePublicationWrite[];
  /**
   * Holds the NEXT call until the returned function is called (its scripted
   * failure, if any, applies when released) — a request « in flight ».
   */
  holdNext(): () => void;
  /**
   * Every service-publication call fails with this code until cleared —
   * UNAVAILABLE plays a project where 20261021120000 is not applied.
   */
  setServicePublicationFailure(code: OnlineBookingFailureCode | undefined): void;
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
  const calls = {
    read: 0,
    update: 0,
    setState: 0,
    upload: 0,
    remove: 0,
    readHours: 0,
    saveDay: 0,
    readServices: 0,
    setServices: 0,
  };
  const catalogues = new Map<string, FakeCatalogueService[]>();
  const categoriesByBusiness = new Map<string, readonly PublishableServiceCategory[]>();
  const selections = new Map<string, Set<string>>();
  const serviceWrites: FakeServicePublicationWrite[] = [];
  let held: Promise<void> | undefined;
  let servicePublicationFailure: OnlineBookingFailureCode | undefined;

  const selectionOf = (businessId: string): Set<string> => {
    const existing = selections.get(businessId);
    if (existing !== undefined) return existing;
    const created = new Set<string>();
    selections.set(businessId, created);
    return created;
  };
  const liveServices = (businessId: string) =>
    (catalogues.get(businessId) ?? []).filter((service) => service.deleted !== true);

  /** THE owner view (online_booking_service_publication_json). */
  const publicationOf = (businessId: string): ServicePublication => {
    const selection = selectionOf(businessId);
    const categories = categoriesByBusiness.get(businessId) ?? [];
    const services = [...liveServices(businessId)].sort(byNameThenId).map((service): PublishableService => {
      const issue = serviceIssue(service);
      const selected = selection.has(service.id);
      const description = service.description?.trim();
      const category = categories.find((candidate) => candidate.id === service.categoryId);
      return {
        id: service.id,
        name: service.name,
        type: service.type ?? 'SERVICE',
        active: service.active !== false,
        priceCents: service.priceCents ?? 0,
        durationMinutes: service.durationMinutes,
        selected,
        eligible: issue === undefined,
        bookable: selected && issue === undefined,
        ...(description !== undefined && description.length > 0 ? { description } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(issue !== undefined ? { ineligibleReason: issue } : {}),
      };
    });
    return {
      maxServiceMinutes: FAKE_MAX_SERVICE_MINUTES,
      selectedCount: services.filter((service) => service.selected).length,
      bookableCount: services.filter((service) => service.bookable).length,
      services,
    };
  };

  /** A held call waits for its release, then fails if a failure is scripted. */
  const settle = async () => {
    if (held !== undefined) {
      const wait = held;
      held = undefined;
      await wait;
    }
    failIfScripted();
  };
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
    serviceWrites,
    failNext(code) {
      pendingFailure = code;
    },
    holdNext() {
      let release: () => void = () => {};
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => release();
    },
    setServicePublicationFailure(code) {
      servicePublicationFailure = code;
    },
    seedServicePublication(businessId, seed) {
      catalogues.set(businessId, [...seed.services]);
      categoriesByBusiness.set(businessId, seed.categories ?? []);
      selections.set(businessId, new Set(seed.selected ?? []));
    },
    updateCatalogueService(businessId, serviceId, patch) {
      catalogues.set(
        businessId,
        (catalogues.get(businessId) ?? []).map((service) =>
          service.id === serviceId ? { ...service, ...patch } : service,
        ),
      );
    },
    selectedServiceIds(businessId) {
      return [...selectionOf(businessId)].sort();
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

    async readServicePublication(businessId) {
      calls.readServices += 1;
      await settle();
      if (servicePublicationFailure !== undefined) throw new OnlineBookingGatewayError(servicePublicationFailure);
      return publicationOf(businessId);
    },

    // online_booking_set_service_publication: all or nothing, ids looked up
    // inside THIS Business only, selecting needs eligibility unless already
    // selected, withdrawing never does; a deleted service's choice is cleaned.
    async setServicePublication(businessId, serviceIds, selected) {
      calls.setServices += 1;
      await settle();
      if (servicePublicationFailure !== undefined) throw new OnlineBookingGatewayError(servicePublicationFailure);
      const ids = [...new Set(serviceIds)].sort();
      if (ids.length === 0 || ids.length > SERVICE_PUBLICATION_MAX_IDS) {
        throw new OnlineBookingGatewayError('UNKNOWN', '22023');
      }
      const live = liveServices(businessId);
      const unknown = ids.find((id) => !live.some((service) => service.id === id));
      if (unknown !== undefined) return { status: 'UNKNOWN_SERVICE', serviceId: unknown };
      const selection = selectionOf(businessId);
      if (selected) {
        const refused = ids
          .map((id) => live.find((service) => service.id === id)!)
          .find((service) => serviceIssue(service) !== undefined && !selection.has(service.id));
        if (refused !== undefined) {
          return { status: 'NOT_ELIGIBLE', serviceId: refused.id, reason: serviceIssue(refused)! };
        }
        ids.forEach((id) => selection.add(id));
      } else {
        ids.forEach((id) => selection.delete(id));
      }
      for (const id of [...selection]) {
        if (!live.some((service) => service.id === id)) selection.delete(id);
      }
      serviceWrites.push({ businessId, serviceIds: ids, selected });
      return { status: 'UPDATED', publication: publicationOf(businessId) };
    },
  };
}
