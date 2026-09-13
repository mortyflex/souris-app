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
  getBirthdayMonthLength,
  isValidClientBirthday,
  parseBirthdayKey,
  type ClientBirthday,
} from './birthday';
