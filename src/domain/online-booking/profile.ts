// BeautIzzy — the editable fields of a public booking profile
//
// The same limits as the server (online_booking_update_profile). Every field
// is optional in a draft; a blank text is no value.

import { isUsableCommunicationEmail } from '../communications';

import { isValidBookingSlug } from './slug';

export const BOOKING_PUBLIC_NAME_MAX_LENGTH = 120;
export const BOOKING_DESCRIPTION_MAX_LENGTH = 1000;
export const BOOKING_PHONE_MAX_LENGTH = 40;
export const BOOKING_ADDRESS_MAX_LENGTH = 200;

export interface BookingProfileFields {
  readonly slug: string;
  readonly publicName: string;
  readonly description: string;
  readonly publicPhone: string;
  readonly publicEmail: string;
  readonly address: string;
}

export type BookingProfileField = keyof BookingProfileFields;

/** The first field the server would refuse, or undefined when the draft can be sent. */
export function findBookingProfileIssue(fields: BookingProfileFields): BookingProfileField | undefined {
  const slug = fields.slug.trim();
  if (slug.length > 0 && !isValidBookingSlug(slug)) return 'slug';
  if (fields.publicName.trim().length > BOOKING_PUBLIC_NAME_MAX_LENGTH) return 'publicName';
  if (fields.description.trim().length > BOOKING_DESCRIPTION_MAX_LENGTH) return 'description';
  if (fields.publicPhone.trim().length > BOOKING_PHONE_MAX_LENGTH) return 'publicPhone';
  const email = fields.publicEmail.trim();
  if (email.length > 0 && !isUsableCommunicationEmail(email)) return 'publicEmail';
  if (fields.address.trim().length > BOOKING_ADDRESS_MAX_LENGTH) return 'address';
  return undefined;
}
