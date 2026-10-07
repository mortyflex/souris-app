// BeautIzzy — client import CSV adapter
//
// Turns the bytes of a picked CSV file into ClientImportCandidates. Pure
// TypeScript: no file picker, no file system, no UI, no persistence, no
// network. Everything CSV-specific stops here:
//
//   bytes → text      UTF-8 (BOM or not), UTF-16 (BOM), else Windows-1252 —
//                     the encoding of a French Excel « CSV » export
//   text  → records   delimiter detection (« ; », « , », tab, or an Excel
//                     « sep=; » first line), quoted fields, doubled quotes,
//                     line breaks inside quotes, CRLF / CR / LF
//   records → rows    completely empty records are dropped; a cell holding a
//                     year-first date (1990-04-12) is rewritten day first so
//                     the French birthday reader cannot swap day and month
//
// The rows then enter the SAME table reader as a tabular paste
// (`parseClientImportTable`): header mapping, name split, phone / email /
// birthday extraction and every review issue are the shared rules, not CSV
// ones. No software-specific (Planity, Fresha…) column mapping exists.

import {
  parseClientImportTable,
  type ClientImportParseResult,
  type ClientImportTableRow,
} from './text-parser';

export type ClientImportCsvFailure =
  /** Not text at all: a spreadsheet workbook, a PDF, an image… */
  | 'NOT_TEXT'
  /** Nothing but blank lines. */
  | 'EMPTY';

export type ClientImportCsvResult =
  | ({ readonly status: 'PARSED' } & ClientImportParseResult)
  | { readonly status: 'UNUSABLE'; readonly reason: ClientImportCsvFailure };

// ─── Bytes → text ──────────────────────────────────────────────────────────

/** Windows-1252 0x80–0x9F; the five unassigned bytes keep their code. */
const WINDOWS_1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122,
  0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

const CHUNK = 8192;

function fromCodePoints(codePoints: readonly number[]): string {
  let text = '';
  for (let index = 0; index < codePoints.length; index += CHUNK) {
    text += String.fromCodePoint(...codePoints.slice(index, index + CHUNK));
  }
  return text;
}

/** Strict UTF-8: undefined on the first malformed sequence. */
function decodeUtf8(bytes: Uint8Array, start: number): string | undefined {
  const codePoints: number[] = [];
  for (let index = start; index < bytes.length; ) {
    const lead = bytes[index]!;
    const length = lead < 0x80 ? 1 : lead >= 0xc2 && lead < 0xe0 ? 2 : lead >= 0xe0 && lead < 0xf0 ? 3 : lead >= 0xf0 && lead < 0xf5 ? 4 : 0;
    if (length === 0 || index + length > bytes.length) return undefined;
    let codePoint = length === 1 ? lead : lead & (0xff >> (length + 1));
    for (let offset = 1; offset < length; offset += 1) {
      const next = bytes[index + offset]!;
      if ((next & 0xc0) !== 0x80) return undefined;
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    const minimum = [0, 0, 0x80, 0x800, 0x10000][length]!;
    if (codePoint < minimum || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return undefined;
    }
    codePoints.push(codePoint);
    index += length;
  }
  return fromCodePoints(codePoints);
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const units: number[] = [];
  for (let index = 2; index + 1 < bytes.length; index += 2) {
    const first = bytes[index]!;
    const second = bytes[index + 1]!;
    units.push(littleEndian ? first | (second << 8) : (first << 8) | second);
  }
  let text = '';
  for (let index = 0; index < units.length; index += CHUNK) {
    text += String.fromCharCode(...units.slice(index, index + CHUNK));
  }
  return text;
}

function decodeWindows1252(bytes: Uint8Array): string {
  const codePoints: number[] = [];
  for (const byte of bytes) {
    codePoints.push(byte >= 0x80 && byte <= 0x9f ? WINDOWS_1252_HIGH[byte - 0x80]! : byte);
  }
  return fromCodePoints(codePoints);
}

/** Control characters no text file holds: the mark of a binary file. */
function hasBinaryControls(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d && code !== 0x0c) return true;
  }
  return false;
}

/** The text of a CSV file, or undefined when the bytes are not text. */
export function decodeClientImportCsv(bytes: Uint8Array): string | undefined {
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = decodeUtf16(bytes, true);
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = decodeUtf16(bytes, false);
  else {
    const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    text = decodeUtf8(bytes, hasBom ? 3 : 0) ?? decodeWindows1252(bytes);
  }
  return hasBinaryControls(text) ? undefined : text;
}

// ─── Text → records ────────────────────────────────────────────────────────

interface CsvRecord {
  /** 1-based line of the file where the record starts. */
  readonly lineNumber: number;
  readonly cells: readonly string[];
}

/**
 * Cuts the text into records. Without a delimiter each line is one cell.
 * Lenient on purpose: an unclosed quote runs to the end of the file, text
 * after a closing quote stays in its cell — nothing is thrown away.
 */
function readRecords(text: string, delimiter: string | undefined): CsvRecord[] {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    cells.push(cell);
    records.push({ lineNumber: recordLine, cells });
    cells = [];
    cell = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    const lineBreak = char === '\n' || char === '\r';
    if (char === '\r' && text.charAt(index + 1) === '\n') index += 1;
    if (lineBreak) line += 1;

    if (quoted) {
      if (char !== '"') cell += lineBreak ? '\n' : char;
      else if (text.charAt(index + 1) === '"') {
        cell += '"';
        index += 1;
      } else quoted = false;
    } else if (char === '"' && cell.trim().length === 0) {
      cell = '';
      quoted = true;
    } else if (lineBreak) {
      endRecord();
      recordLine = line;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = '';
    } else cell += char;
  }
  if (cell.length > 0 || cells.length > 0) endRecord();
  return records;
}

function isBlank(record: CsvRecord): boolean {
  return record.cells.every((cell) => cell.trim().length === 0);
}

/** « ; » first: on a tie it is the French export. */
const DELIMITERS = [';', ',', '\t'] as const;
const SAMPLE_SIZE = 30;
const EXCEL_SEPARATOR_LINE = /^sep=(.)[ \t]*(?:\r\n|\r|\n|$)/i;

/**
 * The delimiter that cuts the first rows into the same number (2+) of cells
 * most often; undefined when none does — a single-column file.
 */
function readDelimitedRecords(text: string): CsvRecord[] {
  let best: { readonly records: CsvRecord[]; readonly consistent: number; readonly width: number } | undefined;
  for (const delimiter of DELIMITERS) {
    const records = readRecords(text, delimiter).filter((record) => !isBlank(record));
    const sample = records.slice(0, SAMPLE_SIZE);
    const width = sample[0]?.cells.length ?? 0;
    if (width < 2) continue;
    const consistent = sample.filter((record) => record.cells.length === width).length;
    if (!best || consistent > best.consistent || (consistent === best.consistent && width > best.width)) {
      best = { records, consistent, width };
    }
  }
  return best?.records ?? readRecords(text, undefined).filter((record) => !isBlank(record));
}

// ─── Records → rows ────────────────────────────────────────────────────────

const YEAR_FIRST_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;

/** `1990-04-12` (and `1990-04-12T00:00:00`) → `12/04/1990`; anything else unchanged. */
function dayFirst(cell: string): string {
  const match = YEAR_FIRST_DATE.exec(cell.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : cell;
}

function toRow(record: CsvRecord): ClientImportTableRow {
  return {
    lineNumber: record.lineNumber,
    cells: record.cells.map(dayFirst),
    // The file's own values, before any rewriting, for the correction drawer.
    raw: record.cells
      .map((cell) => cell.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' · '),
  };
}

// ─── Entry points ──────────────────────────────────────────────────────────

/** Parses CSV text into review candidates (source `CSV`). Never throws. */
export function parseClientImportCsvText(text: string): ClientImportParseResult {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const separatorLine = EXCEL_SEPARATOR_LINE.exec(content);
  const records = separatorLine
    ? // The announced delimiter is used as is; line numbers keep counting the « sep= » line.
      readRecords(content, separatorLine[1])
        .slice(1)
        .filter((record) => !isBlank(record))
    : readDelimitedRecords(content);
  return parseClientImportTable(records.map(toRow), 'CSV', { cellsAreFields: true });
}

/** Parses the bytes of a picked file. Never throws. */
export function parseClientImportCsv(bytes: Uint8Array): ClientImportCsvResult {
  const text = decodeClientImportCsv(bytes);
  if (text === undefined) return { status: 'UNUSABLE', reason: 'NOT_TEXT' };
  if (text.replace(/^﻿/, '').trim().length === 0) return { status: 'UNUSABLE', reason: 'EMPTY' };
  return { status: 'PARSED', ...parseClientImportCsvText(text) };
}
