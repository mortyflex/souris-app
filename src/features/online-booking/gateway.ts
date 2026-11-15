// BeautIzzy — online booking gateway boundary
//
// The narrow app surface of the public booking profile and of the weekly
// working hours. The server is authoritative for everything here: the app
// reads and edits ONE owner-scoped profile, asks for its publication, and
// reads and saves the working hours one day at a time. Nothing goes through
// the offline sync — every call needs connectivity, and a failed call
// changes nothing.

import type { WorkingDay } from '@/domain/online-booking';

export interface BookingProfile {
  /** The address of the page (/r/<slug>); absent while the draft has none. */
  readonly slug?: string;
  /** The Business name, shown publicly when no public name is set. */
  readonly businessName: string;
  readonly publicName?: string;
  readonly description?: string;
  readonly publicPhone?: string;
  readonly publicEmail?: string;
  readonly address?: string;
  /** Object paths in the public branding bucket; never URLs. */
  readonly logoPath?: string;
  readonly coverPath?: string;
  /** First folder of this profile's public images. Not the Business id. */
  readonly mediaId: string;
  readonly timeZone: string;
  readonly published: boolean;
  readonly bookingEnabled: boolean;
  /** Whether the server currently lets anyone publish (operator switch). */
  readonly publicationOpen: boolean;
  /** Whether the server holds a verified BeautIzzy Plus access for the owner. */
  readonly plusAccess: boolean;
}

/** The editable fields, as sent: an absent value clears the stored one. */
export interface BookingProfileDraft {
  readonly slug?: string;
  readonly publicName?: string;
  readonly description?: string;
  readonly publicPhone?: string;
  readonly publicEmail?: string;
  readonly address?: string;
  readonly logoPath?: string;
  readonly coverPath?: string;
}

export type BookingProfileServerField =
  | 'public_name'
  | 'description'
  | 'public_phone'
  | 'public_email'
  | 'address'
  | 'logo_path'
  | 'cover_path';

export type UpdateBookingProfileResult =
  | { readonly status: 'UPDATED'; readonly profile: BookingProfile }
  /** Malformed address, or an address cleared while the page is published. */
  | { readonly status: 'INVALID_SLUG' }
  /** The address belongs to another professional, or is reserved. */
  | { readonly status: 'SLUG_UNAVAILABLE' }
  | { readonly status: 'INVALID_VALUE'; readonly field?: BookingProfileServerField };

export type SetBookingStateResult =
  | { readonly status: 'UPDATED'; readonly profile: BookingProfile }
  /** Publishing needs an address first. */
  | { readonly status: 'INCOMPLETE_PROFILE' }
  /** Publication is not open on the server yet. */
  | { readonly status: 'PUBLICATION_UNAVAILABLE' }
  /** The server holds no verified BeautIzzy Plus access for the owner. */
  | { readonly status: 'ENTITLEMENT_REQUIRED' };

export interface WorkingHours {
  /** The IANA time zone of the Business: every minute of the week is wall-clock time there. */
  readonly timeZone: string;
  /** Seven days, Monday first; a day never configured reads as closed. */
  readonly days: readonly WorkingDay[];
}

/** The rule the server says a refused day breaks (online_booking_working_day_issue). */
export type WorkingDayServerIssue =
  | 'INVALID_DAY'
  | 'INTERVAL_REQUIRED'
  | 'CLOSED_DAY_INTERVALS'
  | 'TOO_MANY_INTERVALS'
  | 'INVALID_INTERVAL'
  | 'OVERLAP';

export type SaveWorkingDayResult =
  | { readonly status: 'UPDATED'; readonly workingHours: WorkingHours }
  /** Nothing was written. */
  | { readonly status: 'INVALID_DAY'; readonly reason?: WorkingDayServerIssue };

export type BookingImageKind = 'logo' | 'cover';

/** The server limit of one public image (bucket `business-public-media`). */
export const BOOKING_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export type OnlineBookingFailureCode =
  | 'NETWORK'
  | 'FORBIDDEN'
  /** The prepared image exceeds BOOKING_IMAGE_MAX_BYTES; nothing was sent. */
  | 'IMAGE_TOO_LARGE'
  /** The file is not a JPEG; nothing was sent. */
  | 'IMAGE_INVALID'
  | 'UNKNOWN';

export class OnlineBookingGatewayError extends Error {
  readonly code: OnlineBookingFailureCode;

  constructor(code: OnlineBookingFailureCode, detail?: string) {
    super(`Online booking gateway failure: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'OnlineBookingGatewayError';
    this.code = code;
  }
}

export interface OnlineBookingGateway {
  /** The owner's profile; the server creates the empty draft on first read. */
  readProfile(businessId: string): Promise<BookingProfile>;
  /** Replaces the draft fields. Never changes the publication state. */
  updateProfile(businessId: string, draft: BookingProfileDraft): Promise<UpdateBookingProfileResult>;
  /** Publishes / unpublishes the page and opens / pauses bookings. */
  setState(
    businessId: string,
    state: { readonly published: boolean; readonly bookingEnabled: boolean },
  ): Promise<SetBookingStateResult>;
  /** Uploads a prepared JPEG as a NEW object and returns its path. */
  uploadImage(mediaId: string, kind: BookingImageKind, localFileUri: string): Promise<string>;
  /** Deletes an object the profile no longer references. */
  removeImage(objectPath: string): Promise<void>;
  /** The public URL of a stored image. */
  imageUrl(objectPath: string): string;
  /** The owner's weekly working hours. */
  readWorkingHours(businessId: string): Promise<WorkingHours>;
  /** Replaces the open state and the intervals of ONE weekday; answers the whole week. */
  saveWorkingDay(businessId: string, day: WorkingDay): Promise<SaveWorkingDayResult>;
}
