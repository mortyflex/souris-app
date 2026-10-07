// BeautIzzy — client import text parser (fictional data only)

import { parseClientImportText } from '../text-parser';
import type { ClientImportCandidate } from '../types';

function parse(text: string): readonly ClientImportCandidate[] {
  return parseClientImportText(text).candidates;
}

function codes(candidate: ClientImportCandidate | undefined): readonly string[] {
  return candidate?.issues.map((issue) => issue.code) ?? [];
}

describe('parseClientImportText — one person per line', () => {
  it('reads a first name and a French phone per line', () => {
    const candidates = parse('Sophie 06 12 34 56 78\nNadia 07 45 67 89 12');

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      key: 'paste-1',
      source: 'PASTE',
      sourceRef: '1',
      firstName: 'Sophie',
      phone: '06 12 34 56 78',
      issues: [],
    });
    expect(candidates[0]?.lastName).toBeUndefined();
    expect(candidates[1]).toMatchObject({ firstName: 'Nadia', phone: '07 45 67 89 12', sourceRef: '2' });
  });

  it('reads a full name, with or without a dash before the number', () => {
    const [sophie, nadia] = parse('Sophie Martin 06 12 34 56 78\nNadia Benali - 07 45 67 89 12');

    expect(sophie).toMatchObject({ firstName: 'Sophie', lastName: 'Martin', phone: '06 12 34 56 78' });
    expect(codes(sophie)).toEqual([]);
    expect(nadia).toMatchObject({ firstName: 'Nadia', lastName: 'Benali', phone: '07 45 67 89 12' });
    expect(codes(nadia)).toEqual([]);
  });

  it('reads an email on the same line', () => {
    const [sophie] = parse('Sophie Martin 06 12 34 56 78 sophie@example.com');

    expect(sophie).toMatchObject({
      firstName: 'Sophie',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'sophie@example.com',
    });
  });

  it('reads a marked birthday and discards its year', () => {
    const [sarah, lina] = parse(
      'Sarah 06 98 76 54 32 anniversaire 12/04\nLina 06 11 22 33 44 née le 03/11/1990',
    );

    expect(sarah).toMatchObject({ firstName: 'Sarah', birthday: { month: 4, day: 12 } });
    expect(codes(sarah)).toEqual([]);
    expect(lina).toMatchObject({ firstName: 'Lina', birthday: { month: 11, day: 3 } });
    expect(codes(lina)).toEqual([]);
  });

  it('keeps each line raw text in memory for the review', () => {
    const [sophie] = parse('  Sophie 06 12 34 56 78  ');

    expect(sophie?.raw).toBe('Sophie 06 12 34 56 78');
  });

  it('skips list markers and value labels', () => {
    const [first, second] = parse('- Sophie tel: 06 12 34 56 78\n2) Nadia email : nadia@example.com');

    expect(first).toMatchObject({ firstName: 'Sophie', phone: '06 12 34 56 78' });
    expect(codes(first)).toEqual([]);
    expect(second).toMatchObject({ firstName: 'Nadia', email: 'nadia@example.com' });
    expect(codes(second)).toEqual([]);
  });

  it('skips a heading line ending with a colon', () => {
    const candidates = parse('Mes clients :\nSophie 06 12 34 56 78');

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ firstName: 'Sophie', sourceRef: '2' });
  });
});

describe('parseClientImportText — phones', () => {
  it.each([
    ['06 12 34 56 78'],
    ['06.12.34.56.78'],
    ['06-12-34-56-78'],
    ['0612345678'],
    ['+33 6 12 34 56 78'],
    ['+33 (0)6 12 34 56 78'],
    ['+33612345678'],
    ['33612345678'],
    ['0033 6 12 34 56 78'],
  ])('extracts %s as the phone, exactly as written', (phone) => {
    const [candidate] = parse(`Sophie ${phone}`);

    expect(candidate?.phone).toBe(phone);
    expect(candidate?.firstName).toBe('Sophie');
    expect(codes(candidate)).toEqual([]);
  });

  it('extracts an international number', () => {
    const [candidate] = parse('Emma +44 20 7946 0958');

    expect(candidate).toMatchObject({ firstName: 'Emma', phone: '+44 20 7946 0958' });
  });

  it('keeps the first number and reports the others', () => {
    const [candidate] = parse('Sophie 06 12 34 56 78 / 01 23 45 67 89');

    expect(candidate?.phone).toBe('06 12 34 56 78');
    expect(candidate?.issues).toContainEqual({ code: 'EXTRA_PHONES', detail: '01 23 45 67 89' });
  });

  it('keeps an unusual digit run as the phone (the review flags it)', () => {
    const [candidate] = parse('Sophie 12 34 56 78 9');

    expect(candidate?.phone).toBe('12 34 56 78 9');
  });

  it('never takes a birthday for part of the phone', () => {
    const [candidate] = parse('Sophie 06 12 34 56 78 12/04');

    expect(candidate?.phone).toBe('06 12 34 56 78');
    expect(candidate?.birthday).toEqual({ month: 4, day: 12 });
  });
});

describe('parseClientImportText — birthdays', () => {
  it.each([
    ['anniv 12/04', { month: 4, day: 12 }],
    ['anniversaire 12 avril', { month: 4, day: 12 }],
    ['née le 12/04/1990', { month: 4, day: 12 }],
    ['né le 12/04/1990', { month: 4, day: 12 }],
    ['anniversaire 1er mai', { month: 5, day: 1 }],
    ['anniv 12.04.90', { month: 4, day: 12 }],
    ['anniversaire 3 févr.', { month: 2, day: 3 }],
    ['anniversaire 25 décembre 1985', { month: 12, day: 25 }],
    ['anniv 29/02/1992', { month: 2, day: 29 }],
  ])('reads « %s » without any year and without an issue', (text, birthday) => {
    const [candidate] = parse(`Sophie 06 12 34 56 78 ${text}`);

    expect(candidate?.birthday).toEqual(birthday);
    expect(codes(candidate)).toEqual([]);
  });

  it('keeps a standalone date as a birthday to verify', () => {
    const [numeric] = parse('Sophie 06 12 34 56 78 12/04');
    const [textual] = parse('Nadia 12 avril');

    expect(numeric?.birthday).toEqual({ month: 4, day: 12 });
    expect(numeric?.issues).toEqual([{ code: 'AMBIGUOUS_BIRTHDAY', detail: '12/04' }]);
    expect(textual?.birthday).toEqual({ month: 4, day: 12 });
    expect(codes(textual)).toEqual(['AMBIGUOUS_BIRTHDAY']);
  });

  it('accepts a complete DD/MM/YYYY date as certain: day + month kept, year ignored, no issue', () => {
    const [claire] = parse('Claire Robert - 07 56 89 41 23 - claire.robert@gmail.com - 14/05/1992');
    const [lina] = parse('Lina 06 11 22 33 44 03/07/1990');

    expect(claire).toMatchObject({
      firstName: 'Claire',
      lastName: 'Robert',
      phone: '07 56 89 41 23',
      email: 'claire.robert@gmail.com',
      birthday: { month: 5, day: 14 },
      issues: [],
    });
    expect(lina?.birthday).toEqual({ month: 7, day: 3 });
    expect(lina?.issues).toEqual([]);
  });

  it('still drops an impossible complete date (31/02/1991) with an issue', () => {
    const [candidate] = parse('Sophie 06 12 34 56 78 31/02/1991');

    expect(candidate?.birthday).toBeUndefined();
    expect(candidate?.issues).toEqual([{ code: 'BIRTHDAY_DROPPED', detail: '31/02/1991' }]);
  });

  it('drops an impossible complete date (29/02/1991, not a leap year), keeping it visible in the issue', () => {
    const [candidate] = parse('Sara Benali - 29/02/1991');

    expect(candidate).toMatchObject({ firstName: 'Sara', lastName: 'Benali', raw: 'Sara Benali - 29/02/1991' });
    expect(candidate?.birthday).toBeUndefined();
    expect(candidate?.issues).toEqual([{ code: 'BIRTHDAY_DROPPED', detail: '29/02/1991' }]);
  });

  it('drops an impossible complete date even after a birthday marker', () => {
    const [candidate] = parse('Sara 06 12 34 56 78 née le 29/02/1991');

    expect(candidate?.birthday).toBeUndefined();
    expect(candidate?.issues).toEqual([{ code: 'BIRTHDAY_DROPPED', detail: '29/02/1991' }]);
  });

  it('accepts 29/02 of a leap year as 29 février, without any issue', () => {
    const [candidate] = parse('Sara Benali - 29/02/1992');

    expect(candidate?.birthday).toEqual({ month: 2, day: 29 });
    expect(candidate?.issues).toEqual([]);
  });

  it('keeps 29/02 without a year as a day + month to verify, as before', () => {
    const [candidate] = parse('Sara 06 12 34 56 78 29/02');

    expect(candidate?.birthday).toEqual({ month: 2, day: 29 });
    expect(candidate?.issues).toEqual([{ code: 'AMBIGUOUS_BIRTHDAY', detail: '29/02' }]);
  });

  it('drops an impossible date and says so', () => {
    const [candidate] = parse('Sophie anniv 31/04');

    expect(candidate?.birthday).toBeUndefined();
    expect(candidate?.issues).toEqual([{ code: 'BIRTHDAY_DROPPED', detail: '31/04' }]);
  });

  it('never reads a marker inside a name', () => {
    const [candidate] = parse('Renée 06 12 34 56 78');

    expect(candidate).toMatchObject({ firstName: 'Renée', phone: '06 12 34 56 78' });
    expect(candidate?.birthday).toBeUndefined();
  });
});

describe('parseClientImportText — names', () => {
  it('takes an ALL-CAPS first word for the last name and asks to verify', () => {
    const [candidate] = parse('MARTIN Sophie 06 12 34 56 78');

    expect(candidate).toMatchObject({ firstName: 'Sophie', lastName: 'MARTIN' });
    expect(codes(candidate)).toEqual(['AMBIGUOUS_NAME_SPLIT']);
  });

  it('keeps an ALL-CAPS last word as the last name without an issue', () => {
    const [candidate] = parse('Sophie MARTIN 06 12 34 56 78');

    expect(candidate).toMatchObject({ firstName: 'Sophie', lastName: 'MARTIN' });
    expect(codes(candidate)).toEqual([]);
  });

  it('flags a three-word name whose split is a guess', () => {
    const [candidate] = parse('Marie Claire Dupont 06 12 34 56 78');

    expect(candidate).toMatchObject({ firstName: 'Marie', lastName: 'Claire Dupont' });
    expect(codes(candidate)).toEqual(['AMBIGUOUS_NAME_SPLIT']);
  });

  it('reads a particle as part of the last name', () => {
    const [candidate] = parse('Anne Le Gall 06 12 34 56 78');

    expect(candidate).toMatchObject({ firstName: 'Anne', lastName: 'Le Gall' });
    expect(codes(candidate)).toEqual([]);
  });

  it('drops a leading honorific', () => {
    const [candidate] = parse('Mme Sophie Martin 06 12 34 56 78');

    expect(candidate).toMatchObject({ firstName: 'Sophie', lastName: 'Martin' });
  });

  it('reports leftover text instead of turning it into notes', () => {
    const [candidate] = parse('Sophie 06 12 34 56 78 (fille de Nadia) 💇 #42');

    expect(candidate).toMatchObject({ firstName: 'Sophie', phone: '06 12 34 56 78' });
    expect(candidate).not.toHaveProperty('notes');
    expect(candidate?.issues).toEqual([{ code: 'IGNORED_TEXT', detail: '(fille de Nadia) 💇 #42' }]);
  });

  it('never appends a word after a field delimiter to the name', () => {
    const [camille] = parse('Camille Robert - abcdef');

    expect(camille).toMatchObject({ firstName: 'Camille', lastName: 'Robert', raw: 'Camille Robert - abcdef' });
    // Reported as leftover text — not a phone, an email or a birthday, and no name-split warning.
    expect(camille?.issues).toEqual([{ code: 'IGNORED_TEXT', detail: 'abcdef' }]);
    expect(camille?.phone).toBeUndefined();
    expect(camille?.email).toBeUndefined();
    expect(camille?.birthday).toBeUndefined();
  });

  it.each([
    ['Camille Robert / abcdef'],
    ['Camille Robert | abcdef'],
    ['Camille Robert ; abcdef'],
    ['Camille Robert, abcdef'],
    ['Camille Robert – abcdef'],
  ])('keeps « %s » as Camille Robert with the trailing word ignored', (line) => {
    const [candidate] = parse(line);

    expect(candidate).toMatchObject({ firstName: 'Camille', lastName: 'Robert' });
    expect(candidate?.issues).toEqual([{ code: 'IGNORED_TEXT', detail: 'abcdef' }]);
  });

  it('keeps a delimited contact line exactly as before', () => {
    const [julie] = parse('Julie Martin - 06 12 34 56 78');

    expect(julie).toMatchObject({ firstName: 'Julie', lastName: 'Martin', phone: '06 12 34 56 78', issues: [] });
  });

  it('keeps hyphenated and labelled names whole', () => {
    const [hyphenated] = parse('Jean-Pierre Martin-Durand - 06 12 34 56 78');
    const [labelled] = parse('Prénom : Sophie, Nom : Martin, Tél : 06 12 34 56 78');

    expect(hyphenated).toMatchObject({ firstName: 'Jean-Pierre', lastName: 'Martin-Durand', issues: [] });
    expect(labelled).toMatchObject({ firstName: 'Sophie', lastName: 'Martin', phone: '06 12 34 56 78', issues: [] });
  });

  it('leaves the first name empty when only contact data is present', () => {
    const [candidate] = parse('06 12 34 56 78');

    expect(candidate?.firstName).toBeUndefined();
    expect(candidate?.phone).toBe('06 12 34 56 78');
  });
});

describe('parseClientImportText — blocks', () => {
  it('reads name + phone blocks separated by blank lines', () => {
    const candidates = parse('Sophie Martin\n06 12 34 56 78\n\nNadia Benali\n07 45 67 89 12\nnadia@example.com');

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      firstName: 'Sophie',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      sourceRef: '1-2',
      raw: 'Sophie Martin\n06 12 34 56 78',
    });
    expect(candidates[1]).toMatchObject({
      firstName: 'Nadia',
      lastName: 'Benali',
      phone: '07 45 67 89 12',
      email: 'nadia@example.com',
      sourceRef: '4-6',
    });
  });

  it('reads blocks even without blank lines: a new name starts the next person', () => {
    const candidates = parse('Sophie Martin\n06 12 34 56 78\nNadia Benali\n07 45 67 89 12');

    expect(candidates.map((candidate) => [candidate.firstName, candidate.phone])).toEqual([
      ['Sophie', '06 12 34 56 78'],
      ['Nadia', '07 45 67 89 12'],
    ]);
  });

  it('closes a block at a blank line, so a lone number becomes a candidate to correct', () => {
    const candidates = parse('Sophie\n\n06 12 34 56 78');

    expect(candidates).toHaveLength(2);
    expect(candidates[1]?.firstName).toBeUndefined();
  });

  it('starts the next person on a lone number that would overwrite the current one', () => {
    const candidates = parse('Sophie 06 12 34 56 78\n07 45 67 89 12\nNadia\nnadia@example.com');

    expect(candidates.map((candidate) => [candidate.firstName, candidate.phone, candidate.email])).toEqual([
      ['Sophie', '06 12 34 56 78', undefined],
      [undefined, '07 45 67 89 12', undefined],
      ['Nadia', undefined, 'nadia@example.com'],
    ]);
  });

  it('keeps every number of a blank-line block on its person, reporting the extra ones', () => {
    const [sophie] = parse('Sophie Martin\n06 12 34 56 78\n01 23 45 67 89\n\nNadia 07 45 67 89 12');

    expect(sophie?.phone).toBe('06 12 34 56 78');
    expect(sophie?.issues).toEqual([{ code: 'EXTRA_PHONES', detail: '01 23 45 67 89' }]);
  });

  it('reports lines with nothing to import instead of making empty candidates', () => {
    const result = parseClientImportText('💕💕\nSophie 06 12 34 56 78\n\n12 34\n');

    expect(result.candidates).toHaveLength(1);
    expect(result.unreadLines).toEqual(['1', '4']);
  });

  it('handles Windows line endings and returns nothing for blank text', () => {
    expect(parse('Sophie 06 12 34 56 78\r\nNadia 07 45 67 89 12')).toHaveLength(2);
    expect(parse('  \n\n ')).toEqual([]);
  });
});

describe('parseClientImportText — tab-separated rows', () => {
  it('maps the columns of a header row and ignores unknown columns as a whole', () => {
    const result = parseClientImportText(
      [
        'Prénom\tNom\tTéléphone\tEmail\tAnniversaire\tTotal dépensé',
        'Sophie\tMartin\t06 12 34 56 78\tsophie@example.com\t12/04/1990\t320 €',
        'Nadia\t\t07 45 67 89 12\t\t\t',
      ].join('\n'),
    );

    expect(result.ignoredColumns).toEqual(['Total dépensé']);
    expect(result.unreadLines).toEqual([]);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      firstName: 'Sophie',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'sophie@example.com',
      birthday: { month: 4, day: 12 },
      sourceRef: '2',
      issues: [],
    });
    expect(result.candidates[1]).toMatchObject({ firstName: 'Nadia', phone: '07 45 67 89 12', issues: [] });
    expect(result.candidates[1]?.lastName).toBeUndefined();
  });

  it('validates a complete date in a birthday column with its year', () => {
    const result = parseClientImportText('Prénom\tAnniversaire\nSara\t29/02/1991\nLina\t29/02/1992\nNadia\t14/05/1992');

    expect(result.candidates[0]?.birthday).toBeUndefined();
    expect(result.candidates[0]?.issues).toEqual([{ code: 'BIRTHDAY_DROPPED', detail: '29/02/1991' }]);
    expect(result.candidates[1]).toMatchObject({ birthday: { month: 2, day: 29 }, issues: [] });
    expect(result.candidates[2]).toMatchObject({ birthday: { month: 5, day: 14 }, issues: [] });
  });

  it('reads a « Nom » column without « Prénom » as the whole name', () => {
    const result = parseClientImportText('Nom\tPortable\nSophie Martin\t0612345678');

    expect(result.candidates[0]).toMatchObject({ firstName: 'Sophie', lastName: 'Martin', phone: '0612345678' });
  });

  it('keeps an unreadable phone cell and drops an impossible birthday cell with an issue', () => {
    const result = parseClientImportText('Prénom\tTél\tDate de naissance\nSophie\t12 34\t31/04/1990');

    expect(result.candidates[0]?.phone).toBe('12 34');
    expect(result.candidates[0]?.birthday).toBeUndefined();
    expect(codes(result.candidates[0])).toEqual(['BIRTHDAY_DROPPED']);
  });

  it('reads header-less rows one per candidate', () => {
    const result = parseClientImportText('Sophie\tMartin\t06 12 34 56 78\nNadia\tBenali\t07 45 67 89 12');

    expect(result.ignoredColumns).toEqual([]);
    expect(result.candidates.map((candidate) => [candidate.firstName, candidate.lastName, candidate.phone])).toEqual([
      ['Sophie', 'Martin', '06 12 34 56 78'],
      ['Nadia', 'Benali', '07 45 67 89 12'],
    ]);
  });

  it('reuses the same parser for another text source (future OCR adapter)', () => {
    const result = parseClientImportText('Sophie 06 12 34 56 78', 'OCR');

    expect(result.candidates[0]).toMatchObject({ key: 'ocr-1', source: 'OCR', firstName: 'Sophie' });
  });
});
