// BeautIzzy — client import validation + duplicate classification (fictional data)

import type { Client } from '../../types';
import { editClientImportCandidate, toClientImportCandidateValues } from '../candidate';
import { classifyClientImportCandidates, validateClientImportCandidate } from '../classification';
import type { ClientImportCandidate } from '../types';

function candidate(key: string, fields: Partial<ClientImportCandidate> = {}): ClientImportCandidate {
  return { key, source: 'PASTE', issues: [], ...fields };
}

const sophie: Client = { id: 'client-sophie', firstName: 'Sophie', lastName: 'Martin', phone: '06 12 34 56 78' };
const nadia: Client = { id: 'client-nadia', firstName: 'Nadia', email: 'Nadia@Example.com' };
const archivedEmma: Client = {
  id: 'client-emma',
  firstName: 'Emma',
  phone: '07 45 67 89 12',
  archivedAt: new Date('2026-05-01T10:00:00.000Z'),
};

describe('validateClientImportCandidate', () => {
  it('requires a first name and a valid email, and only warns about an unrecognized phone', () => {
    expect(validateClientImportCandidate(candidate('a', { phone: '06 12 34 56 78' }))).toEqual([
      { code: 'MISSING_FIRST_NAME' },
    ]);
    expect(validateClientImportCandidate(candidate('b', { firstName: 'Lina', email: 'lina@' }))).toEqual([
      { code: 'INVALID_EMAIL' },
    ]);
    expect(validateClientImportCandidate(candidate('c', { firstName: 'Lina', phone: '12 34 56 78 9' }))).toEqual([
      { code: 'UNRECOGNIZED_PHONE' },
    ]);
    expect(validateClientImportCandidate(candidate('d', { firstName: '  ' }))).toEqual([
      { code: 'MISSING_FIRST_NAME' },
    ]);
  });
});

describe('classifyClientImportCandidates', () => {
  it('classifies a candidate matching nothing as NEW', () => {
    const [result] = classifyClientImportCandidates(
      [candidate('a', { firstName: 'Lina', phone: '06 99 88 77 66' })],
      [sophie, nadia],
    );

    expect(result?.status).toBe('NEW');
    expect(result?.match).toBeUndefined();
  });

  it('finds an exact duplicate by phone, whatever the formatting', () => {
    const [result] = classifyClientImportCandidates(
      [candidate('a', { firstName: 'Sophie', phone: '+33 (0)6 12 34 56 78' })],
      [sophie],
    );

    expect(result?.status).toBe('EXACT_DUPLICATE');
    expect(result?.match).toEqual({
      reason: 'PHONE',
      target: { kind: 'CLIENT', clientId: 'client-sophie', archived: false },
    });
  });

  it('finds an exact duplicate by email, case- and space-insensitive', () => {
    const [result] = classifyClientImportCandidates(
      [candidate('a', { firstName: 'Nadia', email: ' nadia@example.COM ' })],
      [nadia],
    );

    expect(result?.status).toBe('EXACT_DUPLICATE');
    expect(result?.match?.reason).toBe('EMAIL');
  });

  it('matches archived clients too and says so', () => {
    const [result] = classifyClientImportCandidates(
      [candidate('a', { firstName: 'Emma', phone: '0745678912' })],
      [archivedEmma],
    );

    expect(result?.status).toBe('EXACT_DUPLICATE');
    expect(result?.match?.target).toEqual({ kind: 'CLIENT', clientId: 'client-emma', archived: true });
  });

  it('finds an in-batch duplicate against an earlier candidate only', () => {
    const results = classifyClientImportCandidates(
      [
        candidate('a', { firstName: 'Lina', phone: '06 99 88 77 66' }),
        candidate('b', { firstName: 'lina', phone: '0699887766' }),
      ],
      [],
    );

    expect(results.map((result) => result.status)).toEqual(['NEW', 'EXACT_DUPLICATE']);
    expect(results[1]?.match).toEqual({ reason: 'PHONE', target: { kind: 'CANDIDATE', candidateKey: 'a' } });
  });

  // Product rule (October 2026): a phone is a contact detail, not an identity.
  // « Lina » then « Lina B » on one number used to be an EXACT duplicate.
  it('only proposes a shared number under a different first name, even a longer one', () => {
    const results = classifyClientImportCandidates(
      [
        candidate('a', { firstName: 'Lina', phone: '06 99 88 77 66' }),
        candidate('b', { firstName: 'Lina B', phone: '0699887766' }),
      ],
      [],
    );

    expect(results.map((result) => result.status)).toEqual(['NEW', 'POSSIBLE_DUPLICATE']);
    expect(results[1]?.match).toEqual({ reason: 'SHARED_PHONE', target: { kind: 'CANDIDATE', candidateKey: 'a' } });
  });

  it('never matches against an invalid earlier candidate', () => {
    const results = classifyClientImportCandidates(
      [candidate('a', { phone: '06 99 88 77 66' }), candidate('b', { firstName: 'Lina', phone: '06 99 88 77 66' })],
      [],
    );

    expect(results.map((result) => result.status)).toEqual(['INVALID', 'NEW']);
  });

  it('flags the same first + last name as a possible duplicate', () => {
    const [result] = classifyClientImportCandidates(
      [candidate('a', { firstName: 'sophie', lastName: 'MARTIN', phone: '06 00 00 00 01' })],
      [sophie],
    );

    expect(result?.status).toBe('POSSIBLE_DUPLICATE');
    expect(result?.match?.reason).toBe('NAME');
  });

  it('never flags a duplicate on a first name alone', () => {
    const results = classifyClientImportCandidates(
      [candidate('a', { firstName: 'Sophie' }), candidate('b', { firstName: 'Sophie' })],
      [sophie],
    );

    expect(results.map((result) => result.status)).toEqual(['NEW', 'NEW']);
  });

  it('falls back to the last nine digits when a number is not recognized', () => {
    const [result] = classifyClientImportCandidates(
      [candidate('a', { firstName: 'Sophie', phone: '6 12 34 56 78' })],
      [sophie],
    );

    expect(result?.status).toBe('POSSIBLE_DUPLICATE');
    expect(result?.match?.reason).toBe('PHONE_LAST_DIGITS');
    expect(result?.issues.map((issue) => issue.code)).toEqual(['UNRECOGNIZED_PHONE']);
  });

  it('flags a phone matching one client while the email matches another', () => {
    const [result] = classifyClientImportCandidates(
      [candidate('a', { firstName: 'Sophie', phone: '06 12 34 56 78', email: 'nadia@example.com' })],
      [sophie, nadia],
    );

    expect(result?.status).toBe('POSSIBLE_DUPLICATE');
    expect(result?.match).toEqual({
      reason: 'PHONE_EMAIL_CONFLICT',
      target: { kind: 'CLIENT', clientId: 'client-sophie', archived: false },
    });
  });

  it('keeps an exact duplicate when phone and email name the same client', () => {
    const both: Client = { ...sophie, email: 'sophie@example.com' };
    const [result] = classifyClientImportCandidates(
      [candidate('a', { firstName: 'Sophie', phone: '0612345678', email: 'sophie@example.com' })],
      [both],
    );

    expect(result?.status).toBe('EXACT_DUPLICATE');
  });

  it('classifies a candidate without a first name, or with an invalid email, as INVALID first', () => {
    const results = classifyClientImportCandidates(
      [
        candidate('a', { phone: '06 12 34 56 78' }),
        candidate('b', { firstName: 'Sophie', phone: '06 12 34 56 78', email: 'sophie@' }),
      ],
      [sophie],
    );

    expect(results.map((result) => result.status)).toEqual(['INVALID', 'INVALID']);
    expect(results[0]?.issues[0]).toEqual({ code: 'MISSING_FIRST_NAME' });
  });

  it('lists blocking issues before extraction warnings', () => {
    const [result] = classifyClientImportCandidates(
      [candidate('a', { issues: [{ code: 'IGNORED_TEXT', detail: '#42' }] })],
      [],
    );

    expect(result?.issues.map((issue) => issue.code)).toEqual(['MISSING_FIRST_NAME', 'IGNORED_TEXT']);
  });

  it('reclassifies at once after an edit, and never merges anything', () => {
    const original = candidate('a', {
      firstName: 'Sophie',
      phone: '06 12 34 56 78',
      issues: [{ code: 'AMBIGUOUS_NAME_SPLIT' }],
    });
    expect(classifyClientImportCandidates([original], [sophie])[0]?.status).toBe('EXACT_DUPLICATE');

    const edited = editClientImportCandidate(original, {
      ...toClientImportCandidateValues(original),
      phone: '06 55 44 33 22',
    });
    const [result] = classifyClientImportCandidates([edited], [sophie]);

    expect(result?.status).toBe('NEW');
    expect(result?.issues).toEqual([]);
    // The existing client is never touched by a classification.
    expect(sophie).toEqual({ id: 'client-sophie', firstName: 'Sophie', lastName: 'Martin', phone: '06 12 34 56 78' });
  });

  it('turns an invalid candidate valid when its first name is added', () => {
    const invalid = candidate('a', { phone: '06 99 88 77 66' });
    expect(classifyClientImportCandidates([invalid], [])[0]?.status).toBe('INVALID');

    const fixed = editClientImportCandidate(invalid, { ...toClientImportCandidateValues(invalid), firstName: 'Lina' });

    expect(classifyClientImportCandidates([fixed], [])[0]?.status).toBe('NEW');
  });

  it('classifies 500 candidates against 600 clients', () => {
    const clients: Client[] = Array.from({ length: 600 }, (_, index) => ({
      id: `client-${index}`,
      firstName: `Client${index}`,
      phone: `06 10 ${String(index).padStart(6, '0').replace(/(\d{2})(?=\d)/g, '$1 ')}`,
    }));
    const candidates = Array.from({ length: 500 }, (_, index) =>
      candidate(`c-${index}`, { firstName: `Import${index}`, phone: `07${String(index).padStart(8, '0')}` }),
    );

    const results = classifyClientImportCandidates(candidates, clients);

    expect(results).toHaveLength(500);
    expect(results.every((result) => result.status === 'NEW')).toBe(true);
  });

  describe('shared phone numbers', () => {
    it('lets two family members share one number in the same file', () => {
      const results = classifyClientImportCandidates(
        [
          candidate('mother', { firstName: 'Sophie', lastName: 'Martin', phone: '06 12 34 56 78' }),
          candidate('daughter', { firstName: 'Chloé', lastName: 'Martin', phone: '+33 6 12 34 56 78' }),
        ],
        [],
      );

      expect(results.map((result) => result.status)).toEqual(['NEW', 'POSSIBLE_DUPLICATE']);
      expect(results[1]?.match).toEqual({
        reason: 'SHARED_PHONE',
        target: { kind: 'CANDIDATE', candidateKey: 'mother' },
      });
    });

    it('proposes, never blocks, a client sharing the number of an existing or archived client', () => {
      const results = classifyClientImportCandidates(
        [
          candidate('a', { firstName: 'Chloé', lastName: 'Martin', phone: '0612345678' }),
          candidate('b', { firstName: 'Léa', phone: '07 45 67 89 12' }),
        ],
        [sophie, archivedEmma],
      );

      expect(results.map((result) => result.status)).toEqual(['POSSIBLE_DUPLICATE', 'POSSIBLE_DUPLICATE']);
      expect(results[0]?.match).toEqual({
        reason: 'SHARED_PHONE',
        target: { kind: 'CLIENT', clientId: 'client-sophie', archived: false },
      });
      expect(results[1]?.match).toEqual({
        reason: 'SHARED_PHONE',
        target: { kind: 'CLIENT', clientId: 'client-emma', archived: true },
      });
    });

    it('keeps a genuine duplicate exact: accents, case, spaces, hyphens and a missing last name ignored', () => {
      const marieClaire: Client = { id: 'client-mc', firstName: 'Marie-Claire', lastName: 'Lefèvre', phone: '06 11 22 33 44' };
      const results = classifyClientImportCandidates(
        [
          candidate('a', { firstName: '  marie claire ', lastName: 'LEFEVRE', phone: '0611223344' }),
          candidate('b', { firstName: 'Marie-Claire', phone: '+33 6 11 22 33 44' }),
          candidate('c', { firstName: 'Sophie', phone: '06 12 34 56 78' }),
          candidate('d', { firstName: 'Emma', lastName: 'Durand', phone: '0745678912' }),
        ],
        [marieClaire, sophie, archivedEmma],
      );

      expect(results.map((result) => result.status)).toEqual([
        'EXACT_DUPLICATE',
        'EXACT_DUPLICATE',
        'EXACT_DUPLICATE',
        'EXACT_DUPLICATE',
      ]);
      expect(results[3]?.match?.target).toEqual({ kind: 'CLIENT', clientId: 'client-emma', archived: true });
    });

    it('recognizes first and last names read in the other order', () => {
      const [result] = classifyClientImportCandidates(
        [candidate('a', { firstName: 'Martin', lastName: 'Sophie', phone: '0612345678' })],
        [sophie],
      );

      expect(result?.status).toBe('EXACT_DUPLICATE');
    });

    it('keeps repeated rows of the same person exact duplicates of the first one', () => {
      const row = { firstName: 'Nadia', lastName: 'Benali', phone: '07 11 22 33 44' };
      const results = classifyClientImportCandidates(
        [candidate('a', row), candidate('b', row), candidate('c', { ...row, phone: '0711223344' })],
        [],
      );

      expect(results.map((result) => result.status)).toEqual(['NEW', 'EXACT_DUPLICATE', 'EXACT_DUPLICATE']);
      expect(results[2]?.match?.target).toEqual({ kind: 'CANDIDATE', candidateKey: 'a' });
    });

    it('treats an ambiguous identity as a shared number: same first name, two different last names', () => {
      const results = classifyClientImportCandidates(
        [
          candidate('a', { firstName: 'Sophie', lastName: 'Bernard', phone: '0612345678' }),
          candidate('b', { firstName: 'Marie', phone: '0612345678' }),
        ],
        [sophie],
      );

      expect(results.map((result) => result.match?.reason)).toEqual(['SHARED_PHONE', 'SHARED_PHONE']);
      expect(results.map((result) => result.status)).toEqual(['POSSIBLE_DUPLICATE', 'POSSIBLE_DUPLICATE']);
    });

    it('matches the record with a compatible name when several clients share the number', () => {
      const chloe: Client = { id: 'client-chloe', firstName: 'Chloé', lastName: 'Martin', phone: '06 12 34 56 78' };
      const [result] = classifyClientImportCandidates(
        [candidate('a', { firstName: 'Chloe', lastName: 'Martin', phone: '0612345678' })],
        [sophie, chloe],
      );

      expect(result?.status).toBe('EXACT_DUPLICATE');
      expect(result?.match?.target).toEqual({ kind: 'CLIENT', clientId: 'client-chloe', archived: false });
    });

    it('keeps the email a strong identifier, even under another first name (a shared family email)', () => {
      const family: Client = { ...sophie, email: 'famille.martin@example.com' };
      const results = classifyClientImportCandidates(
        [
          candidate('a', { firstName: 'Chloé', email: 'famille.martin@example.com' }),
          candidate('b', { firstName: 'Chloé', phone: '0612345678', email: 'famille.martin@example.com' }),
        ],
        [family],
      );

      expect(results.map((result) => result.status)).toEqual(['EXACT_DUPLICATE', 'EXACT_DUPLICATE']);
      expect(results.map((result) => result.match?.reason)).toEqual(['EMAIL', 'PHONE']);
    });

    it('never changes an existing client', () => {
      const before = structuredClone(sophie);
      classifyClientImportCandidates([candidate('a', { firstName: 'Chloé', phone: '0612345678' })], [sophie]);

      expect(sophie).toEqual(before);
    });
  });
});
