// Souris — client import text parser (PASTE today, OCR text later)
//
// Turns pasted text — a Notes list, a WhatsApp message, spreadsheet rows
// copied from Excel / Numbers / Google Sheets — into ClientImportCandidates.
// Pure TypeScript: no clipboard, no UI, no persistence, no network, no AI.
// A future OCR adapter feeds its recognized text to the same function.
//
// DETERMINISTIC extraction (no issue raised):
//   emails       any token holding an « @ » (kept even when invalid, so the
//                review asks for a correction instead of dropping it)
//   phones       French national / international forms, 0033, bare 33…,
//                other international numbers; any other 8-15 digit run is
//                kept as a phone the review flags UNRECOGNIZED_PHONE
//   birthdays    a date after a marker (anniv, anniversaire, né·e le, ddn)
//   tabs         tab-separated rows: one row = one candidate; a header row
//                maps its columns (Prénom, Nom, Téléphone, Email, Anniversaire)
//
// HEURISTICS (always surfaced as review issues):
//   first / last name split      AMBIGUOUS_NAME_SPLIT (3+ words, reordered ALL-CAPS)
//   standalone date              AMBIGUOUS_BIRTHDAY
//   impossible date              BIRTHDAY_DROPPED
//   more numbers / emails        EXTRA_PHONES / EXTRA_EMAILS (only the first is kept)
//   leftover text                IGNORED_TEXT — never turned into notes; words
//                                after a field delimiter (« - », « / », « | »,
//                                « ; », « , ») never join the name
//
// Records: one line with a name starts a candidate, and a blank line always
// closes it. A following line without a name (a phone line, an email line, a
// birthday line) completes it:
//   - inside blank-line-separated blocks, always (a second number is then an
//     EXTRA_PHONES warning);
//   - in a list without blank lines, only when it fills a field the candidate
//     does not have yet — otherwise it is the next person (without a name, to
//     correct), and a name after such a number line is the next person too.
//     So « one person per line » and « name line + phone line » lists both
//     read naturally.
// A line with no name, phone, email or date at all is not a candidate: it is
// reported in `unreadLines`.

import { findClientImportBirthday } from './birthday-text';
import type { ClientBirthday } from '../birthday';
import type {
  ClientImportCandidate,
  ClientImportIssue,
  ClientImportSource,
} from './types';

export interface ClientImportParseResult {
  readonly candidates: readonly ClientImportCandidate[];
  /** Header columns of a tabular paste that match no allowed field; ignored as a whole. */
  readonly ignoredColumns: readonly string[];
  /**
   * Line / row references holding no name, phone, email or date at all (stray
   * symbols, numbers too short for a phone): nothing to import, reported to
   * the review instead of becoming empty candidates.
   */
  readonly unreadLines: readonly string[];
}

// ─── Tokens ────────────────────────────────────────────────────────────────

const LETTERS = 'A-Za-zÀ-ÖØ-öø-ÿ\\u0100-\\u024F';
const NAME_TOKEN = new RegExp(`^[${LETTERS}](?:[${LETTERS}'’.\\-]*[${LETTERS}.])?$`);
const EMAIL_TOKEN = /[^\s,;<>()"[\]]*@[^\s,;<>()"[\]]*/g;
const PARENTHESIZED = /\(([^)]*)\)/g;
const LIST_MARKER = /^\s*(?:[-*•·]|\d{1,3}[.)])\s+/;
const TOKEN_SEPARATORS = /[\s,;|•·:–—/*_]+/;
/**
 * Field delimiters of a line: a spaced hyphen (never the one inside
 * « Jean-Pierre »), a slash, a pipe, a semicolon, a comma, a dash, a bullet.
 * Tabs are not delimiters here: a header-less spreadsheet row keeps first
 * and last name in two cells.
 */
const FIELD_DELIMITERS = /\s+-\s+|[,;|/•·–—]/;
/** Labels that announce a name, so a later segment opening with one still holds name words. */
const NAME_LABEL_WORDS = new Set(['nom', 'prenom']);
const DATE_SHAPED = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;

// Specific forms first: at one position the first alternative that fits wins.
const PHONE_ALTERNATIVES = [
  '\\+33\\s?(?:\\(\\s?0\\s?\\)\\s?)?0?[1-9](?:[\\s.\\-]?\\d{2}){4}',
  '0033\\s?[1-9](?:[\\s.\\-]?\\d{2}){4}',
  '0[1-9](?:[\\s.\\-]?\\d{2}){4}',
  '33[1-9]\\d{8}',
  '\\+[1-9](?:[\\s.\\-()]?\\d){6,14}',
  '\\d(?:[\\s.\\-]?\\d){7,14}',
];
const PHONE_IN_TEXT = new RegExp(
  `(^|[^0-9A-Za-z+])(${PHONE_ALTERNATIVES.join('|')})(?![0-9]|[/.\\-][0-9])`,
  'g',
);

/** Labels that introduce a value; dropped, never taken for a name. */
const LABEL_WORDS = new Set([
  'tel',
  'telephone',
  'portable',
  'port',
  'mobile',
  'mob',
  'gsm',
  'fixe',
  'numero',
  'num',
  'email',
  'e-mail',
  'mail',
  'courriel',
  'nom',
  'prenom',
]);
/** Honorifics dropped when they open a name. */
const HONORIFICS = new Set(['m', 'mr', 'mme', 'mlle', 'madame', 'monsieur', 'mademoiselle']);
/** Particles that make a 3-word name unambiguous (« Sophie de Montfort », « Anne Le Gall »). */
const NAME_PARTICLES = new Set([
  'de',
  'du',
  'des',
  'le',
  'la',
  'van',
  'von',
  'da',
  'di',
  'del',
  'della',
  'ben',
  'el',
  'al',
]);
/** Words that are not names even when they survive extraction (a marker without a date). */
const NON_NAME_WORDS = new Set(['anniv', 'anniversaire', 'ddn']);

function wordKey(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.:]+$/, '');
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// ─── Line analysis ─────────────────────────────────────────────────────────

interface LineFields {
  readonly names: readonly string[];
  readonly phones: readonly string[];
  readonly emails: readonly string[];
  readonly birthday?: ClientBirthday;
  readonly birthdayIssue?: ClientImportIssue;
  /** A date was found (kept, dropped or ambiguous). */
  readonly hasDate: boolean;
  readonly ignored: readonly string[];
}

function blank(text: string, start: number, end: number): string {
  return `${text.slice(0, start)}${' '.repeat(end - start)}${text.slice(end)}`;
}

function extractEmails(text: string): { readonly rest: string; readonly emails: string[] } {
  const emails: string[] = [];
  const rest = text.replace(EMAIL_TOKEN, (token) => {
    const email = token.replace(/^[.:'’]+/, '').replace(/[.:!?'’]+$/, '');
    if (email.length > 0) emails.push(email);
    return ' ';
  });
  return { rest, emails };
}

function extractPhones(text: string): { readonly rest: string; readonly phones: string[] } {
  const phones: string[] = [];
  let rest = text;
  PHONE_IN_TEXT.lastIndex = 0;
  for (let match = PHONE_IN_TEXT.exec(text); match; match = PHONE_IN_TEXT.exec(text)) {
    const phone = match[2] ?? '';
    // A full date (12.04.1990) is not a phone: the birthday step reads it.
    if (DATE_SHAPED.test(phone)) continue;
    const start = match.index + (match[1]?.length ?? 0);
    phones.push(collapse(phone));
    rest = blank(rest, start, start + phone.length);
  }
  return { rest, phones };
}

function analyzeLine(line: string): LineFields {
  const withoutMarker = line.replace(LIST_MARKER, '').replace(/\t/g, ' ');
  const { rest: afterEmails, emails } = extractEmails(withoutMarker);
  const { rest: afterPhones, phones } = extractPhones(afterEmails);

  let rest = afterPhones;
  const date = findClientImportBirthday(rest);
  if (date) rest = blank(rest, date.start, date.end);

  const ignored: string[] = [];
  rest = rest.replace(PARENTHESIZED, (_group, inner: string) => {
    if (inner.trim().length > 0) ignored.push(`(${collapse(inner)})`);
    return ' ';
  });

  // The name is the first delimited segment holding name words: words
  // further along (« Camille Robert - abcdef ») are leftover text, never
  // appended to the name — unless their segment opens with a name label
  // (« Prénom : Sophie, Nom : Martin »).
  const names: string[] = [];
  for (const segment of rest.split(FIELD_DELIMITERS)) {
    const segmentNames: string[] = [];
    let opensWithNameLabel = false;
    let first = true;
    for (const raw of segment.split(TOKEN_SEPARATORS)) {
      const token = raw.replace(/^[-'’]+|[-'’]+$/g, '');
      if (token.length === 0) continue;
      const key = wordKey(token);
      if (first) opensWithNameLabel = NAME_LABEL_WORDS.has(key);
      first = false;
      if (LABEL_WORDS.has(key)) continue;
      if (NAME_TOKEN.test(token) && !NON_NAME_WORDS.has(key)) {
        segmentNames.push(token);
      } else {
        ignored.push(token);
      }
    }
    if (names.length === 0 || opensWithNameLabel) names.push(...segmentNames);
    else ignored.push(...segmentNames);
  }

  return {
    names,
    phones,
    emails,
    ...(date?.birthday !== undefined ? { birthday: date.birthday } : {}),
    ...(date?.issue !== undefined ? { birthdayIssue: date.issue } : {}),
    hasDate: date !== undefined,
    ignored,
  };
}

// ─── Name split ────────────────────────────────────────────────────────────

interface NameSplit {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly ambiguous: boolean;
  readonly ignored: readonly string[];
}

function isAllCaps(token: string): boolean {
  return token.length > 1 && token === token.toUpperCase() && token !== token.toLowerCase();
}

/** How many name words a candidate keeps; the rest is ignored text. */
const MAX_NAME_WORDS = 4;

export function splitClientImportName(words: readonly string[]): NameSplit {
  const tokens = [...words];
  while (tokens.length > 1 && HONORIFICS.has(wordKey(tokens[0] ?? ''))) tokens.shift();
  const ignored = tokens.splice(MAX_NAME_WORDS);
  if (tokens.length === 0) return { ambiguous: false, ignored };
  if (tokens.length === 1) return { firstName: tokens[0], ambiguous: false, ignored };

  // ALL-CAPS words are taken for the last name (« MARTIN Sophie »).
  const caps = tokens.map(isAllCaps);
  const capsCount = caps.filter(Boolean).length;
  if (capsCount > 0 && capsCount < tokens.length) {
    const prefix = caps.slice(0, capsCount).every(Boolean);
    const suffix = caps.slice(tokens.length - capsCount).every(Boolean);
    if (prefix) {
      return {
        firstName: tokens.slice(capsCount).join(' '),
        lastName: tokens.slice(0, capsCount).join(' '),
        // The order was inverted on an assumption: the professional checks it.
        ambiguous: true,
        ignored,
      };
    }
    if (suffix) {
      return {
        firstName: tokens.slice(0, tokens.length - capsCount).join(' '),
        lastName: tokens.slice(tokens.length - capsCount).join(' '),
        ambiguous: false,
        ignored,
      };
    }
  }

  const [first, ...last] = tokens;
  const particle = tokens.length === 3 && NAME_PARTICLES.has(wordKey(tokens[1] ?? ''));
  return {
    firstName: first,
    lastName: last.join(' '),
    ambiguous: (tokens.length > 2 && !particle) || ignored.length > 0,
    ignored,
  };
}

// ─── Candidate assembly ────────────────────────────────────────────────────

interface Draft {
  readonly firstLine: number;
  lastLine: number;
  readonly rawLines: string[];
  names: readonly string[];
  readonly phones: string[];
  readonly emails: string[];
  birthday?: ClientBirthday;
  readonly issues: ClientImportIssue[];
  hasDate: boolean;
  readonly ignored: string[];
}

function newDraft(lineNumber: number): Draft {
  return {
    firstLine: lineNumber,
    lastLine: lineNumber,
    rawLines: [],
    names: [],
    phones: [],
    emails: [],
    issues: [],
    hasDate: false,
    ignored: [],
  };
}

function absorb(draft: Draft, lineNumber: number, raw: string, fields: LineFields): void {
  draft.lastLine = lineNumber;
  draft.rawLines.push(raw);
  if (fields.names.length > 0 && draft.names.length === 0) {
    draft.names = fields.names;
  } else {
    draft.ignored.push(...fields.names);
  }
  draft.phones.push(...fields.phones);
  draft.emails.push(...fields.emails);
  if (fields.hasDate && !draft.hasDate) {
    draft.hasDate = true;
    if (fields.birthday) draft.birthday = fields.birthday;
    if (fields.birthdayIssue) draft.issues.push(fields.birthdayIssue);
  }
  draft.ignored.push(...fields.ignored);
}

interface CandidateFields {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly phones: readonly string[];
  readonly emails: readonly string[];
  readonly birthday?: ClientBirthday;
  readonly issues: readonly ClientImportIssue[];
  readonly ignored: readonly string[];
  readonly nameAmbiguous: boolean;
}

function toCandidate(
  source: ClientImportSource,
  index: number,
  sourceRef: string,
  raw: string,
  fields: CandidateFields,
): ClientImportCandidate {
  const issues: ClientImportIssue[] = [];
  if (fields.nameAmbiguous) issues.push({ code: 'AMBIGUOUS_NAME_SPLIT' });
  issues.push(...fields.issues);
  const [phone, ...extraPhones] = fields.phones;
  const [email, ...extraEmails] = fields.emails;
  if (extraPhones.length > 0) issues.push({ code: 'EXTRA_PHONES', detail: extraPhones.join(', ') });
  if (extraEmails.length > 0) issues.push({ code: 'EXTRA_EMAILS', detail: extraEmails.join(', ') });
  if (fields.ignored.length > 0) issues.push({ code: 'IGNORED_TEXT', detail: fields.ignored.join(' ') });

  const firstName = fields.firstName ? collapse(fields.firstName) : '';
  const lastName = fields.lastName ? collapse(fields.lastName) : '';
  return {
    key: `${source.toLowerCase()}-${index + 1}`,
    source,
    sourceRef,
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(fields.birthday ? { birthday: fields.birthday } : {}),
    raw,
    issues,
  };
}

function lineRef(first: number, last: number): string {
  return first === last ? String(first) : `${first}-${last}`;
}

/** A « Mes clients : » style heading: no contact data, ends with a colon. */
function isHeading(line: string, fields: LineFields): boolean {
  return (
    line.trim().endsWith(':') &&
    fields.phones.length === 0 &&
    fields.emails.length === 0 &&
    !fields.hasDate
  );
}

function hasIdentity(fields: LineFields): boolean {
  return fields.names.length > 0 || fields.phones.length > 0 || fields.emails.length > 0 || fields.hasDate;
}

/** A nameless line completes the current candidate without overwriting anything it holds. */
function fillsMissingFields(draft: Draft, fields: LineFields): boolean {
  return (
    (fields.phones.length === 0 || draft.phones.length === 0) &&
    (fields.emails.length === 0 || draft.emails.length === 0) &&
    (!fields.hasDate || !draft.hasDate)
  );
}

/** Blank lines between content lines: the text is written as blocks. */
function isWrittenAsBlocks(lines: readonly string[]): boolean {
  const first = lines.findIndex((line) => line.trim().length > 0);
  const last = lines.length - 1 - [...lines].reverse().findIndex((line) => line.trim().length > 0);
  return first >= 0 && lines.slice(first, last + 1).some((line) => line.trim().length === 0);
}

function parseFreeText(
  lines: readonly string[],
  source: ClientImportSource,
): { readonly candidates: ClientImportCandidate[]; readonly unreadLines: string[] } {
  const blocks = isWrittenAsBlocks(lines);
  const drafts: Draft[] = [];
  const unreadLines: string[] = [];
  let current: Draft | undefined;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim().length === 0) {
      current = undefined;
      return;
    }
    const fields = analyzeLine(line);
    if (isHeading(line, fields)) return;
    if (!hasIdentity(fields)) {
      // Leftovers of a candidate stay visible on it; a stray line alone is reported.
      if (current) absorb(current, lineNumber, line.trim(), fields);
      else unreadLines.push(String(lineNumber));
      return;
    }
    const startsNext =
      !current ||
      // A new name while the current candidate already has one → next person.
      (fields.names.length > 0 && current.names.length > 0) ||
      // In a plain list the name comes first: after a number, a name is the next person.
      (!blocks && fields.names.length > 0 && (current.phones.length > 0 || current.emails.length > 0)) ||
      (!blocks && fields.names.length === 0 && !fillsMissingFields(current, fields));
    if (startsNext || !current) {
      current = newDraft(lineNumber);
      drafts.push(current);
    }
    absorb(current, lineNumber, line.trim(), fields);
  });

  const candidates = drafts.map((draft, index) => {
    const name = splitClientImportName(draft.names);
    return toCandidate(source, index, lineRef(draft.firstLine, draft.lastLine), draft.rawLines.join('\n'), {
      firstName: name.firstName,
      lastName: name.lastName,
      phones: draft.phones,
      emails: draft.emails,
      birthday: draft.birthday,
      issues: draft.issues,
      ignored: [...name.ignored, ...draft.ignored],
      nameAmbiguous: name.ambiguous,
    });
  });
  return { candidates, unreadLines };
}

// ─── Tabular rows ──────────────────────────────────────────────────────────

type ColumnRole = 'firstName' | 'lastName' | 'fullName' | 'phone' | 'email' | 'birthday';

const HEADER_ROLES: readonly (readonly [ColumnRole, readonly string[]])[] = [
  ['firstName', ['prenom', 'first name', 'firstname', 'given name']],
  ['lastName', ['nom', 'nom de famille', 'last name', 'lastname', 'surname', 'family name']],
  ['fullName', ['nom complet', 'nom prenom', 'prenom nom', 'nom et prenom', 'client', 'name', 'contact']],
  [
    'phone',
    [
      'telephone',
      'tel',
      'portable',
      'mobile',
      'phone',
      'numero',
      'gsm',
      'tel portable',
      'telephone portable',
      'numero de telephone',
      'fixe',
    ],
  ],
  ['email', ['email', 'e-mail', 'mail', 'courriel', 'adresse email', 'adresse mail', 'adresse e-mail']],
  [
    'birthday',
    ['anniversaire', 'date de naissance', 'naissance', 'ddn', 'birthday', 'date anniversaire', 'birth date'],
  ],
];

function headerRole(cell: string): ColumnRole | undefined {
  const key = wordKey(cell).replace(/[.:]/g, '').replace(/\s+/g, ' ').trim();
  return HEADER_ROLES.find(([, names]) => names.includes(key))?.[0];
}

function looksLikeData(cell: string): boolean {
  return cell.includes('@') || /\d{2}/.test(cell);
}

function splitCells(line: string): string[] {
  return line.split('\t').map((cell) => collapse(cell));
}

function parseTabular(lines: readonly string[], source: ClientImportSource): ClientImportParseResult {
  const rows = lines
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter((row) => row.line.trim().length > 0);
  const firstCells = rows[0] ? splitCells(rows[0].line) : [];
  const roles = firstCells.map(headerRole);
  const hasHeader =
    roles.some((role) => role !== undefined) && !firstCells.some((cell) => looksLikeData(cell));

  if (!hasHeader) {
    // No header to trust: each row reads like a line of text.
    const unreadLines: string[] = [];
    const readable = rows
      .map((row) => ({ ...row, fields: analyzeLine(row.line) }))
      .filter((row) => {
        if (hasIdentity(row.fields)) return true;
        unreadLines.push(String(row.lineNumber));
        return false;
      });
    const candidates = readable.map((row, index) => {
      const fields = row.fields;
      const name = splitClientImportName(fields.names);
      return toCandidate(source, index, String(row.lineNumber), collapse(row.line), {
        firstName: name.firstName,
        lastName: name.lastName,
        phones: fields.phones,
        emails: fields.emails,
        birthday: fields.birthday,
        issues: fields.birthdayIssue ? [fields.birthdayIssue] : [],
        ignored: [...name.ignored, ...fields.ignored],
        nameAmbiguous: name.ambiguous,
      });
    });
    return { candidates, ignoredColumns: [], unreadLines };
  }

  // « Nom » without a « Prénom » column holds the whole name.
  const columnRoles = roles.map((role) =>
    role === 'lastName' && !roles.includes('firstName') ? 'fullName' : role,
  );
  const ignoredColumns = firstCells.filter(
    (cell, index) => columnRoles[index] === undefined && cell.length > 0,
  );

  const unreadLines: string[] = [];
  const dataRows = rows.slice(1).filter((row) => {
    const mapped = splitCells(row.line).some((cell, column) => columnRoles[column] !== undefined && cell.length > 0);
    if (!mapped) unreadLines.push(String(row.lineNumber));
    return mapped;
  });
  const candidates = dataRows.map((row, index) => {
    const cells = splitCells(row.line);
    const valuesOf = (role: ColumnRole) =>
      cells.filter((cell, column) => columnRoles[column] === role && cell.length > 0);

    const issues: ClientImportIssue[] = [];
    const ignored: string[] = [];
    let firstName = valuesOf('firstName').join(' ');
    let lastName = valuesOf('lastName').join(' ');
    let nameAmbiguous = false;
    const fullName = valuesOf('fullName').join(' ');
    if (fullName && !firstName) {
      const split = splitClientImportName(fullName.split(/\s+/));
      firstName = split.firstName ?? '';
      lastName = lastName || (split.lastName ?? '');
      nameAmbiguous = split.ambiguous;
      ignored.push(...split.ignored);
    }

    const phones = valuesOf('phone').flatMap((cell) => {
      const found = extractPhones(cell).phones;
      return found.length > 0 ? found : [cell];
    });
    const emails = valuesOf('email');

    let birthday: ClientBirthday | undefined;
    const [birthdayCell] = valuesOf('birthday');
    if (birthdayCell) {
      const date = findClientImportBirthday(birthdayCell, { labelled: true });
      birthday = date?.birthday;
      if (date?.issue) issues.push(date.issue);
      if (!date) issues.push({ code: 'BIRTHDAY_DROPPED', detail: birthdayCell });
    }

    return toCandidate(source, index, String(row.lineNumber), cells.filter(Boolean).join(' · '), {
      firstName,
      lastName,
      phones,
      emails,
      birthday,
      issues,
      ignored,
      nameAmbiguous,
    });
  });
  return { candidates, ignoredColumns, unreadLines };
}

// ─── Entry point ───────────────────────────────────────────────────────────

/**
 * Parses pasted (or recognized) text into review candidates. Tab-separated
 * rows are read as a table; anything else as free text. Never throws.
 */
export function parseClientImportText(
  text: string,
  source: ClientImportSource = 'PASTE',
): ClientImportParseResult {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.some((line) => line.includes('\t'))) return parseTabular(lines, source);
  return { ...parseFreeText(lines, source), ignoredColumns: [] };
}
