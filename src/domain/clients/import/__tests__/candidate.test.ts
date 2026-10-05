// Souris — client import candidate edits and confirmation (fictional data)

import {
  editClientImportCandidate,
  toClientImportCandidateValues,
  toImportedClient,
} from '../candidate';
import type { ClientImportCandidate } from '../types';

const parsed: ClientImportCandidate = {
  key: 'paste-3',
  source: 'PASTE',
  sourceRef: '3',
  firstName: 'MARTIN',
  lastName: 'Sophie',
  phone: ' 06 12 34 56 78 ',
  email: ' Sophie@Example.com ',
  birthday: { month: 4, day: 12 },
  raw: 'MARTIN Sophie 06 12 34 56 78',
  issues: [{ code: 'AMBIGUOUS_NAME_SPLIT' }, { code: 'IGNORED_TEXT', detail: '#42' }],
};

describe('client import candidate', () => {
  it('edits values in staging only: same key, source and raw text, extraction issues cleared', () => {
    const edited = editClientImportCandidate(parsed, {
      ...toClientImportCandidateValues(parsed),
      firstName: ' Sophie ',
      lastName: 'Martin',
      email: '',
      birthday: undefined,
    });

    expect(edited).toEqual({
      key: 'paste-3',
      source: 'PASTE',
      sourceRef: '3',
      firstName: 'Sophie',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      raw: 'MARTIN Sophie 06 12 34 56 78',
      issues: [],
    });
  });

  it('confirms a candidate into identity / contact fields only, values kept as written', () => {
    const client = toImportedClient(parsed, 'client-new');

    expect(client).toEqual({
      id: 'client-new',
      firstName: 'MARTIN',
      lastName: 'Sophie',
      phone: '06 12 34 56 78',
      email: 'Sophie@Example.com',
      birthday: { month: 4, day: 12 },
    });
    // No notes, photo, lifecycle or SMS consent: consent stays UNKNOWN.
    expect(client).not.toHaveProperty('notes');
    expect(client).not.toHaveProperty('photoPath');
    expect(client).not.toHaveProperty('archivedAt');
    expect(client).not.toHaveProperty('smsMarketingConsent');
  });

  it('refuses to confirm an invalid candidate', () => {
    expect(() => toImportedClient({ key: 'k', source: 'PASTE', issues: [], phone: '0612345678' }, 'id')).toThrow(
      RangeError,
    );
    expect(() =>
      toImportedClient({ key: 'k', source: 'PASTE', issues: [], firstName: 'Lina', email: 'lina@' }, 'id'),
    ).toThrow(RangeError);
  });
});
