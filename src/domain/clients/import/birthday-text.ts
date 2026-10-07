// BeautIzzy — client import birthday text
//
// Reads a French birthday out of free text:
//
//   12/04 · 12.04 · 12-04 · 12/04/1990 · 12/04/90
//   12 avril · 1er avril · 12 avril 1990 · 12 avr.
//   anniv 12/04 · anniversaire 12 avril · née le 12/04/1990 · né le 12/04/1990 · ddn 12/04
//
// Day first, always (French). The Client keeps a day + month only: a year is
// never stored. An impossible pair (31/04) is dropped with a BIRTHDAY_DROPPED
// issue. A complete numeric DD/MM/YYYY date is validated WITH its year before
// its year is dropped: one that does not exist (29/02/1991 — 1991 is not a
// leap year) is dropped the same way, marker or not; 29/02/1992 is kept.
// Without a year, 29/02 stays a valid day + month (birthday.ts). A date
// WITHOUT a birthday marker is only probably a birthday: it is kept with an
// AMBIGUOUS_BIRTHDAY issue — except a complete DD/MM/YYYY date that exists,
// which reads as certain (14/05/1992).

import { getBirthdayMonthLength, isValidClientBirthday, type ClientBirthday } from '../birthday';

import type { ClientImportIssue } from './types';

const MONTHS: readonly (readonly [RegExp, number])[] = [
  [/^janv/, 1],
  [/^f[eé]v/, 2],
  [/^mars/, 3],
  [/^avr/, 4],
  [/^mai/, 5],
  [/^juin/, 6],
  [/^juil/, 7],
  [/^ao[uû]t/, 8],
  [/^sep/, 9],
  [/^oct/, 10],
  [/^nov/, 11],
  [/^d[eé]c/, 12],
];

const MONTH_PATTERN =
  'janvier|janv\\.?|f[ée]vrier|f[ée]vr?\\.?|mars|avril|avr\\.?|mai|juin|juillet|juil\\.?|ao[uû]t|septembre|sept?\\.?|octobre|oct\\.?|novembre|nov\\.?|d[ée]cembre|d[ée]c\\.?';
const MARKER_PATTERN =
  "(?:anniversaire|anniv\\.?|date\\s+de\\s+naissance|ddn|n[ée]e?\\s+le|n[ée]e?)\\s*[:\\-]?\\s*(?:le\\s+)?";
const NUMERIC_PATTERN = '(\\d{1,2})[/.\\-](\\d{1,2})(?:[/.\\-](\\d{4}|\\d{2}))?';
const TEXT_PATTERN = `(1er|\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`;

const DATE_IN_TEXT = new RegExp(
  `(${MARKER_PATTERN})?(?:${NUMERIC_PATTERN}|${TEXT_PATTERN})`,
  'gi',
);
const WORD_CHARACTER = /[0-9A-Za-zÀ-ÖØ-öø-ÿ]/;

export interface ClientImportBirthdayMatch {
  readonly birthday?: ClientBirthday;
  readonly issue?: ClientImportIssue;
  /** Consumed span in the text (marker included). */
  readonly start: number;
  readonly end: number;
}

function monthFromName(name: string): number | undefined {
  const lower = name.toLowerCase();
  return MONTHS.find(([pattern]) => pattern.test(lower))?.[1];
}

/** A real calendar date, year included (plain arithmetic, never a Date). */
function isCompleteCalendarDate(day: number, month: number, year: number): boolean {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const length = month === 2 ? (leap ? 29 : 28) : getBirthdayMonthLength(month);
  return Number.isInteger(year) && day >= 1 && day <= length;
}

function toBirthday(day: number, month: number | undefined): ClientBirthday | undefined {
  if (month === undefined) return undefined;
  const birthday = { month, day };
  return isValidClientBirthday(birthday) ? birthday : undefined;
}

/**
 * The first date found in `text`, or undefined. `labelled` says the text is
 * already known to be a birthday (a « Anniversaire » column): no marker is
 * needed then, and no ambiguity is reported.
 */
export function findClientImportBirthday(
  text: string,
  options: { readonly labelled?: boolean } = {},
): ClientImportBirthdayMatch | undefined {
  DATE_IN_TEXT.lastIndex = 0;
  for (let match = DATE_IN_TEXT.exec(text); match; match = DATE_IN_TEXT.exec(text)) {
    const start = match.index;
    const end = start + match[0].length;
    const before = start > 0 ? text.charAt(start - 1) : '';
    const after = text.charAt(end);
    const marker = match[1];
    // Never part of a larger number or word (« a12/04 », « 12/045 », the
    // « née » of « Renée »): retry one character further.
    if ((before && WORD_CHARACTER.test(before)) || /\d/.test(after)) {
      DATE_IN_TEXT.lastIndex = start + 1;
      continue;
    }

    const numeric = match[2] !== undefined;
    const day = numeric ? Number(match[2]) : match[5]?.toLowerCase() === '1er' ? 1 : Number(match[5]);
    const month = numeric ? Number(match[3]) : monthFromName(match[6] ?? '');
    const birthday = toBirthday(day, month);
    const dateText = match[0].slice(marker?.length ?? 0).trim();

    if (birthday === undefined) {
      return { issue: { code: 'BIRTHDAY_DROPPED', detail: dateText }, start, end };
    }
    const fullYear = numeric && match[4]?.length === 4 ? Number(match[4]) : undefined;
    if (fullYear !== undefined && !isCompleteCalendarDate(day, birthday.month, fullYear)) {
      return { issue: { code: 'BIRTHDAY_DROPPED', detail: dateText }, start, end };
    }
    const certain = options.labelled === true || marker !== undefined || fullYear !== undefined;
    return {
      birthday,
      ...(certain ? {} : { issue: { code: 'AMBIGUOUS_BIRTHDAY', detail: dateText } }),
      start,
      end,
    };
  }
  return undefined;
}
