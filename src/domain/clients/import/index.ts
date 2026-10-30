// BeautIzzy — client import pipeline (docs/domain/CLIENTS.md §3b)
//
// Source adapters produce ClientImportCandidates (PASTE — text-parser.ts;
// CSV — csv-parser.ts; CONTACTS and OCR are future adapters feeding the same
// model); classification, edits and confirmation are source-independent.

export type {
  ClientImportCandidate,
  ClientImportIssue,
  ClientImportIssueCode,
  ClientImportSource,
} from './types';
export { BLOCKING_CLIENT_IMPORT_ISSUES, isBlockingClientImportIssue } from './types';
export { clientImportPhoneKey, isRecognizedClientImportPhone, type ClientImportPhoneKey } from './phone-key';
export { findClientImportBirthday, type ClientImportBirthdayMatch } from './birthday-text';
export {
  findCriticalClientImportColumns,
  hasUnsupportedClientImportHeader,
  parseClientImportTable,
  parseClientImportText,
  splitClientImportName,
  type ClientImportCriticalColumn,
  type ClientImportCriticalField,
  type ClientImportParseResult,
  type ClientImportTableOptions,
  type ClientImportTableRow,
} from './text-parser';
export {
  decodeClientImportCsv,
  parseClientImportCsv,
  parseClientImportCsvText,
  type ClientImportCsvFailure,
  type ClientImportCsvResult,
} from './csv-parser';
export {
  classifyClientImportCandidates,
  validateClientImportCandidate,
  type ClassifiedClientImportCandidate,
  type ClientImportMatch,
  type ClientImportMatchReason,
  type ClientImportMatchTarget,
  type ClientImportStatus,
} from './classification';
export {
  editClientImportCandidate,
  toClientImportCandidateValues,
  toImportedClient,
  type ClientImportCandidateValues,
} from './candidate';
