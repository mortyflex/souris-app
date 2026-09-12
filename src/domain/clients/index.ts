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
  formatCivilDate,
  formatClientBirthDate,
  isValidCivilDate,
  parseCivilDate,
} from './birthDate';
