// BeautIzzy — client import review selection (fictional data)

import type { Client } from '@/domain/clients';
import {
  classifyClientImportCandidates,
  editClientImportCandidate,
  toClientImportCandidateValues,
  type ClientImportCandidate,
} from '@/domain/clients/import';

import { exactDuplicatesSummary, importButtonTitle } from '../presentation';
import {
  countBySegment,
  hasSameSelection,
  isCandidateSelected,
  selectedCandidates,
  withChoice,
  withoutChoice,
  type ClientImportChoices,
} from '../review-selection';

const existing: Client[] = [{ id: 'client-sophie', firstName: 'Sophie', lastName: 'Martin', phone: '06 12 34 56 78' }];

const batch: ClientImportCandidate[] = [
  { key: 'new', source: 'PASTE', issues: [], firstName: 'Nadia', phone: '07 45 67 89 12' },
  { key: 'exact', source: 'PASTE', issues: [], firstName: 'Sophie', phone: '0612345678' },
  { key: 'possible', source: 'PASTE', issues: [], firstName: 'Sophie', lastName: 'Martin' },
  { key: 'invalid', source: 'PASTE', issues: [], phone: '06 99 88 77 66' },
];

const none: ClientImportChoices = new Map();

describe('client import review selection', () => {
  it('selects NEW by default, skips duplicates and never selects invalid rows', () => {
    const classified = classifyClientImportCandidates(batch, existing);

    expect(classified.map((entry) => [entry.candidate.key, isCandidateSelected(entry, none)])).toEqual([
      ['new', true],
      ['exact', false],
      ['possible', false],
      ['invalid', false],
    ]);
    expect(countBySegment(classified)).toEqual({ NEW: 1, DUPLICATES: 2, TO_FIX: 1 });
  });

  it('lets « Importer quand même » opt a possible duplicate in, but never an exact one or an invalid one', () => {
    const classified = classifyClientImportCandidates(batch, existing);
    const choices = withChoice(withChoice(withChoice(none, 'possible', true), 'exact', true), 'invalid', true);

    expect(selectedCandidates(classified, choices).map((entry) => entry.candidate.key)).toEqual(['new', 'possible']);
  });

  it('lets a NEW row be unticked', () => {
    const classified = classifyClientImportCandidates(batch, existing);

    expect(selectedCandidates(classified, withChoice(none, 'new', false))).toEqual([]);
  });

  it('recomputes eligibility after an edit and forgets the previous choice', () => {
    const invalid = batch[3]!;
    const fixed = editClientImportCandidate(invalid, { ...toClientImportCandidateValues(invalid), firstName: 'Lina' });
    const choices = withoutChoice(withChoice(none, 'invalid', false), 'invalid');
    const classified = classifyClientImportCandidates([...batch.slice(0, 3), fixed], existing);

    expect(classified[3]?.status).toBe('NEW');
    expect(isCandidateSelected(classified[3]!, choices)).toBe(true);
  });

  it('notices when the stored clients change the selection', () => {
    const before = classifyClientImportCandidates(batch, existing);
    const nadiaStored: Client = { id: 'client-nadia', firstName: 'Nadia', phone: '+33 7 45 67 89 12' };
    const after = classifyClientImportCandidates(batch, [...existing, nadiaStored]);

    expect(hasSameSelection(before, before, none)).toBe(true);
    expect(hasSameSelection(before, after, none)).toBe(false);
  });

  it('folds exact duplicates under a neutral « doublons détectés » summary, singular and plural', () => {
    expect(exactDuplicatesSummary(1)).toBe('1 doublon détecté — ignoré');
    expect(exactDuplicatesSummary(3)).toBe('3 doublons détectés — ignorés');
    expect(exactDuplicatesSummary(3)).not.toMatch(/déjà/);
  });

  it('names the exact number of clients the button imports', () => {
    expect(importButtonTitle(42)).toBe('Importer 42 clients');
    expect(importButtonTitle(1)).toBe('Importer 1 client');
    expect(importButtonTitle(0)).toBe('Aucun client sélectionné');
  });
});
