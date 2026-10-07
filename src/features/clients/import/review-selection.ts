// BeautIzzy — client import review: segments and selection
//
// Selection is derived from the CURRENT classification plus the
// professional's explicit choices, so an edit that reclassifies a candidate
// changes what is selectable at once:
//
//   NEW                 selected by default (can be unticked)
//   POSSIBLE_DUPLICATE  skipped by default — « Importer quand même » opts in
//   EXACT_DUPLICATE     never imported (inspect only; never merged)
//   INVALID             never imported until corrected
//
// A choice is dropped when its candidate is edited (the review restarts from
// the default of its new status). Nothing here is persisted.

import type { ClassifiedClientImportCandidate, ClientImportStatus } from '@/domain/clients/import';

export type ClientImportSegment = 'NEW' | 'DUPLICATES' | 'TO_FIX';

/** Explicit choices by candidate key; absent = the status default. */
export type ClientImportChoices = ReadonlyMap<string, boolean>;

export function segmentOfStatus(status: ClientImportStatus): ClientImportSegment {
  switch (status) {
    case 'NEW':
      return 'NEW';
    case 'EXACT_DUPLICATE':
    case 'POSSIBLE_DUPLICATE':
      return 'DUPLICATES';
    case 'INVALID':
      return 'TO_FIX';
  }
}

export function isSelectableStatus(status: ClientImportStatus): boolean {
  return status === 'NEW' || status === 'POSSIBLE_DUPLICATE';
}

export function isCandidateSelected(
  classified: ClassifiedClientImportCandidate,
  choices: ClientImportChoices,
): boolean {
  if (!isSelectableStatus(classified.status)) return false;
  return choices.get(classified.candidate.key) ?? classified.status === 'NEW';
}

export function selectedCandidates(
  classified: readonly ClassifiedClientImportCandidate[],
  choices: ClientImportChoices,
): readonly ClassifiedClientImportCandidate[] {
  return classified.filter((entry) => isCandidateSelected(entry, choices));
}

export function countBySegment(
  classified: readonly ClassifiedClientImportCandidate[],
): Readonly<Record<ClientImportSegment, number>> {
  const counts = { NEW: 0, DUPLICATES: 0, TO_FIX: 0 };
  for (const entry of classified) counts[segmentOfStatus(entry.status)] += 1;
  return counts;
}

/** A new choices map with one explicit choice set. */
export function withChoice(
  choices: ClientImportChoices,
  key: string,
  selected: boolean,
): ClientImportChoices {
  const next = new Map(choices);
  next.set(key, selected);
  return next;
}

/** A new choices map without the candidate's choice (after an edit). */
export function withoutChoice(choices: ClientImportChoices, key: string): ClientImportChoices {
  if (!choices.has(key)) return choices;
  const next = new Map(choices);
  next.delete(key);
  return next;
}

/** True when both classifications select exactly the same candidates. */
export function hasSameSelection(
  a: readonly ClassifiedClientImportCandidate[],
  b: readonly ClassifiedClientImportCandidate[],
  choices: ClientImportChoices,
): boolean {
  const keys = (list: readonly ClassifiedClientImportCandidate[]) =>
    selectedCandidates(list, choices)
      .map((entry) => entry.candidate.key)
      .join('\n');
  return keys(a) === keys(b);
}
