export type { Client } from './types';
export { getClientDisplayName, getClientInitial, getClientInitials } from './presentation';
export {
  archiveClient,
  canDeleteClientPermanently,
  isClientActive,
  isClientArchived,
  restoreClient,
  type ClientReferences,
} from './lifecycle';
export {
  BIRTHDAY_MONTH_NAMES,
  birthdayFromCivilDate,
  formatBirthdayKey,
  formatClientBirthday,
  formatClientBirthdayCompact,
  getBirthdayMonthLength,
  isClientBirthdayOnDate,
  isClientBirthdayToday,
  isValidClientBirthday,
  parseBirthdayKey,
  type ClientBirthday,
} from './birthday';
export { CLIENT_NOTES_MAX_LENGTH, normalizeClientNotes } from './notes';
export { clientEmailComparisonKey, isValidClientEmail } from './email';
export {
  CLIENT_SMS_CONSENT_SOURCES,
  CLIENT_SMS_CONSENT_STATUSES,
  isClientSmsMarketingConsentSource,
  isClientSmsMarketingConsentStatus,
  resolveClientSmsMarketingConsent,
  type ClientSmsMarketingConsent,
  type ClientSmsMarketingConsentSource,
  type ClientSmsMarketingConsentStatus,
} from './sms-consent';
