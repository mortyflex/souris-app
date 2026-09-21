export type { Client } from './types';
export { getClientDisplayName, getClientInitial } from './presentation';
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
