// BeautIzzy — online booking domain public entry point

export {
  BOOKING_ADDRESS_MAX_LENGTH,
  BOOKING_DESCRIPTION_MAX_LENGTH,
  BOOKING_PHONE_MAX_LENGTH,
  BOOKING_PUBLIC_NAME_MAX_LENGTH,
  findBookingProfileIssue,
  type BookingProfileField,
  type BookingProfileFields,
} from './profile';
export {
  BOOKING_SLUG_MAX_LENGTH,
  BOOKING_SLUG_MIN_LENGTH,
  isValidBookingSlug,
  normalizeBookingSlugInput,
  suggestBookingSlug,
} from './slug';
