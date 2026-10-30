// BeautIzzy — client import CSV adapter (fictional data only)

import type { Client } from '../../types';
import { classifyClientImportCandidates } from '../classification';
import { decodeClientImportCsv, parseClientImportCsv, parseClientImportCsvText as readCsvText } from '../csv-parser';
import {
  findCriticalClientImportColumns,
  parseClientImportText,
  type ClientImportParseResult,
} from '../text-parser';
import type { ClientImportCandidate } from '../types';

function codes(candidate: ClientImportCandidate | undefined): readonly string[] {
  return candidate?.issues.map((issue) => issue.code) ?? [];
}

/** The candidates of a file that must be read, failing the test when it is refused. */
function parseClientImportCsvText(text: string): ClientImportParseResult {
  const result = readCsvText(text);
  if (result.status !== 'PARSED') throw new Error(`refused: ${result.reason}`);
  return result;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** One byte per character: Latin-1, which Windows-1252 extends. */
function latin1(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function utf16(text: string, littleEndian: boolean): Uint8Array {
  const bytes = littleEndian ? [0xff, 0xfe] : [0xfe, 0xff];
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    bytes.push(...(littleEndian ? [unit & 0xff, unit >> 8] : [unit >> 8, unit & 0xff]));
  }
  return new Uint8Array(bytes);
}

describe('parseClientImportCsvText — delimiters', () => {
  it('reads a comma-separated file with headers', () => {
    const result = parseClientImportCsvText(
      [
        'First name,Last name,Phone,Email,Birthday',
        'Sophie,Martin,06 12 34 56 78,sophie@example.com,12/04/1990',
        'Nadia,Benali,07 45 67 89 12,,',
      ].join('\n'),
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toEqual({
      key: 'csv-1',
      source: 'CSV',
      sourceRef: '2',
      firstName: 'Sophie',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'sophie@example.com',
      birthday: { month: 4, day: 12 },
      raw: 'Sophie · Martin · 06 12 34 56 78 · sophie@example.com · 12/04/1990',
      issues: [],
    });
    expect(result.candidates[1]).toMatchObject({ key: 'csv-2', sourceRef: '3', firstName: 'Nadia', lastName: 'Benali' });
    expect(result.ignoredColumns).toEqual([]);
    expect(result.unreadLines).toEqual([]);
  });

  it('reads a semicolon-separated file with headers, commas staying inside their cell', () => {
    const result = parseClientImportCsvText(
      ['Prénom;Nom;Téléphone;Adresse', 'Sophie;Martin;06 12 34 56 78;12, rue des Lilas', 'Nadia;Benali;07 45 67 89 12;'].join(
        '\r\n',
      ),
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({ firstName: 'Sophie', lastName: 'Martin', phone: '06 12 34 56 78' });
    expect(codes(result.candidates[0])).toEqual([]);
    expect(result.ignoredColumns).toEqual(['Adresse']);
  });

  it('reads a tab-separated file and an Excel « sep= » first line', () => {
    const tabbed = parseClientImportCsvText('Prénom\tTéléphone\nSophie\t06 12 34 56 78');
    const announced = parseClientImportCsvText('sep=;\nPrénom;Téléphone\nSophie;06 12 34 56 78');

    expect(tabbed.candidates[0]).toMatchObject({ source: 'CSV', firstName: 'Sophie', phone: '06 12 34 56 78' });
    expect(announced.candidates[0]).toMatchObject({ firstName: 'Sophie', phone: '06 12 34 56 78', sourceRef: '3' });
  });

  it('reads quoted cells: delimiters, doubled quotes and line breaks inside quotes', () => {
    const result = parseClientImportCsvText(
      ['Client,Téléphone,Commentaire', '"Martin, Sophie",0612345678,"dit ""Soso""\nsur deux lignes"', 'Nadia Benali,0745678912,'].join(
        '\n',
      ),
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({ phone: '0612345678', sourceRef: '2' });
    // The row after a quoted line break keeps the line number of the FILE.
    expect(result.candidates[1]).toMatchObject({ firstName: 'Nadia', lastName: 'Benali', sourceRef: '4' });
    expect(result.ignoredColumns).toEqual(['Commentaire']);
  });

  it('reads a single-column file line by line', () => {
    const result = parseClientImportCsvText('Sophie Martin 06 12 34 56 78\nNadia 07 45 67 89 12');

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({ firstName: 'Sophie', lastName: 'Martin', phone: '06 12 34 56 78' });
    expect(codes(result.candidates[0])).toEqual([]);
  });
});

describe('parseClientImportCsvText — headers', () => {
  it.each([
    ['Prénom;Nom;Téléphone;E-mail;Anniversaire', 'French'],
    ['prenom;NOM;Mobile;Email;Date de naissance', 'unaccented, mixed case'],
    ['first_name;last_name;phone;e-mail;ddn', 'underscored'],
    ['FirstName;LastName;Portable;Courriel;Birthday', 'camel case'],
  ])('maps « %s » (%s)', (header) => {
    const result = parseClientImportCsvText(`${header}\nSophie;Martin;06 12 34 56 78;sophie@example.com;12/04`);

    expect(result.candidates[0]).toMatchObject({
      firstName: 'Sophie',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'sophie@example.com',
      birthday: { month: 4, day: 12 },
      issues: [],
    });
    expect(result.ignoredColumns).toEqual([]);
  });

  it.each(['Full name', 'Name', 'Client', 'Nom complet', 'Nom'])('splits a whole-name « %s » column', (header) => {
    const result = parseClientImportCsvText(`${header},Phone\nSophie Martin,0612345678`);

    expect(result.candidates[0]).toMatchObject({ firstName: 'Sophie', lastName: 'Martin', phone: '0612345678' });
  });

  it('ignores unknown columns as a whole and never imports them', () => {
    const result = parseClientImportCsvText(
      'Prénom;Téléphone;Total dépensé;Dernière visite;Notes\nSophie;0612345678;320 €;2026-01-05;Allergie',
    );

    expect(result.ignoredColumns).toEqual(['Total dépensé', 'Dernière visite', 'Notes']);
    expect(result.candidates[0]).toEqual({
      key: 'csv-1',
      source: 'CSV',
      sourceRef: '2',
      firstName: 'Sophie',
      phone: '0612345678',
      raw: 'Sophie · 0612345678 · 320 € · 2026-01-05 · Allergie',
      issues: [],
    });
  });

  it('reads a year-first date day first, never swapping day and month', () => {
    const result = parseClientImportCsvText(
      'Prénom;Date de naissance\nSophie;1990-04-12\nLina;1992-02-29T00:00:00\nSara;1991-02-29',
    );

    expect(result.candidates[0]).toMatchObject({ birthday: { month: 4, day: 12 }, issues: [] });
    expect(result.candidates[0]?.raw).toBe('Sophie · 1990-04-12');
    expect(result.candidates[1]).toMatchObject({ birthday: { month: 2, day: 29 }, issues: [] });
    expect(result.candidates[2]?.birthday).toBeUndefined();
    expect(codes(result.candidates[2])).toEqual(['BIRTHDAY_DROPPED']);
  });
});

describe('parseClientImportCsvText — without headers', () => {
  it('reads each row cell by cell and flags a name whose column order is unknown', () => {
    const result = parseClientImportCsvText(
      'Sophie;Martin;06 12 34 56 78;sophie@example.com\nNadia;Benali;07 45 67 89 12;',
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      sourceRef: '1',
      firstName: 'Sophie',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'sophie@example.com',
    });
    // Prénom;Nom or Nom;Prénom? Nothing says: the review asks.
    expect(codes(result.candidates[0])).toEqual(['AMBIGUOUS_NAME_SPLIT']);
  });

  it('does not flag a whole name held by one cell', () => {
    const [sophie] = parseClientImportCsvText('Sophie Martin,0612345678\nNadia Benali,0745678912').candidates;

    expect(sophie).toMatchObject({ firstName: 'Sophie', lastName: 'Martin', phone: '0612345678' });
    expect(codes(sophie)).toEqual([]);
  });

  it('never merges two cells into one number', () => {
    const [sophie] = parseClientImportCsvText('Sophie;75011;0612345678\nNadia;69003;0745678912').candidates;

    expect(sophie).toMatchObject({ firstName: 'Sophie', phone: '0612345678' });
    expect(sophie?.issues).toEqual([{ code: 'IGNORED_TEXT', detail: '75011' }]);
  });

  it('keeps an unlabelled date as a birthday to verify', () => {
    const [sophie] = parseClientImportCsvText('Sophie,0612345678,12/04\nNadia,0745678912,').candidates;

    expect(sophie).toMatchObject({ birthday: { month: 4, day: 12 } });
    expect(sophie?.issues).toEqual([{ code: 'AMBIGUOUS_BIRTHDAY', detail: '12/04' }]);
  });
});

describe('parseClientImportCsvText — rows', () => {
  it('ignores completely empty rows and keeps the file line numbers', () => {
    const result = parseClientImportCsvText(
      ['Prénom;Téléphone', '', 'Sophie;0612345678', ';', '   ;  ', 'Nadia;0745678912', '', ''].join('\n'),
    );

    expect(result.candidates.map((candidate) => [candidate.firstName, candidate.sourceRef])).toEqual([
      ['Sophie', '3'],
      ['Nadia', '6'],
    ]);
    expect(result.unreadLines).toEqual([]);
  });

  it('reports a row with nothing in a known column instead of an empty candidate', () => {
    const result = parseClientImportCsvText('Prénom;Téléphone;Notes\nSophie;0612345678;\n;;à rappeler');

    expect(result.candidates).toHaveLength(1);
    expect(result.unreadLines).toEqual(['3']);
  });

  it('sends invalid and ambiguous values to the existing review issues, inventing nothing', () => {
    const result = parseClientImportCsvText(
      [
        'Prénom;Nom;Téléphone;Email;Anniversaire',
        ';Martin;0612345678;;',
        'Nadia;;12 34;nadia@;31/04/1990',
        'Lina;;0655443322 / 0145678912;;le printemps',
      ].join('\n'),
    );
    const classified = classifyClientImportCandidates(result.candidates, []);

    expect(classified[0]).toMatchObject({ status: 'INVALID' });
    expect(classified[0]?.issues.map((issue) => issue.code)).toEqual(['MISSING_FIRST_NAME']);
    expect(classified[0]?.candidate.firstName).toBeUndefined();

    expect(classified[1]).toMatchObject({ status: 'INVALID' });
    expect(classified[1]?.issues).toEqual([
      { code: 'INVALID_EMAIL' },
      { code: 'UNRECOGNIZED_PHONE' },
      { code: 'BIRTHDAY_DROPPED', detail: '31/04/1990' },
    ]);
    expect(classified[1]?.candidate).toMatchObject({ phone: '12 34', email: 'nadia@' });

    expect(classified[2]).toMatchObject({ status: 'NEW' });
    expect(classified[2]?.candidate).toMatchObject({ firstName: 'Lina', phone: '0655443322' });
    expect(classified[2]?.issues).toEqual([
      { code: 'BIRTHDAY_DROPPED', detail: 'le printemps' },
      { code: 'EXTRA_PHONES', detail: '0145678912' },
    ]);
  });

  it('flags a whole name of three words', () => {
    const [marie] = parseClientImportCsvText('Client;Mobile\nMarie Claire Dupont;0612345678').candidates;

    expect(marie).toMatchObject({ firstName: 'Marie', lastName: 'Claire Dupont' });
    expect(codes(marie)).toEqual(['AMBIGUOUS_NAME_SPLIT']);
  });

  it('feeds the existing duplicate detection: stored clients and earlier rows', () => {
    const sophie: Client = { id: 'client-sophie', firstName: 'Sophie', lastName: 'Martin', phone: '06 12 34 56 78' };
    const { candidates } = parseClientImportCsvText(
      [
        'Prénom;Nom;Téléphone;Email',
        'Sophie;Martin;+33 6 12 34 56 78;',
        'Nadia;Benali;0745678912;nadia@example.com',
        'Nadia;B.;;NADIA@example.com',
        'Sophie;MARTIN;0600000001;',
        'Lina;;0655443322;',
      ].join('\n'),
    );

    const classified = classifyClientImportCandidates(candidates, [sophie]);

    expect(classified.map((entry) => entry.status)).toEqual([
      'EXACT_DUPLICATE',
      'NEW',
      'EXACT_DUPLICATE',
      'POSSIBLE_DUPLICATE',
      'NEW',
    ]);
    expect(classified[0]?.match).toEqual({
      reason: 'PHONE',
      target: { kind: 'CLIENT', clientId: 'client-sophie', archived: false },
    });
    expect(classified[2]?.match).toEqual({ reason: 'EMAIL', target: { kind: 'CANDIDATE', candidateKey: 'csv-2' } });
    expect(classified[3]?.match?.reason).toBe('NAME');
  });

  it('reads a table exactly like the same table pasted with tabs', () => {
    const rows = [
      ['Prénom', 'Nom', 'Téléphone', 'Email', 'Anniversaire', 'Total dépensé'],
      ['Sophie', 'Martin', '06 12 34 56 78', 'sophie@example.com', '12/04/1990', '320 €'],
      ['Nadia', '', '07 45 67 89 12', '', '', ''],
    ];
    const pasted = parseClientImportText(rows.map((row) => row.join('\t')).join('\n'));
    const csv = parseClientImportCsvText(rows.map((row) => row.join(';')).join('\n'));

    const fields = ({ key: _key, source: _source, ...rest }: ClientImportCandidate) => rest;
    expect(csv.candidates.map(fields)).toEqual(pasted.candidates.map(fields));
    expect(csv.ignoredColumns).toEqual(pasted.ignoredColumns);
  });
});

describe('parseClientImportCsv — bytes', () => {
  it('reads UTF-8, with or without a byte order mark', () => {
    const text = 'Prénom;Téléphone\nAnaïs;0612345678';
    const plain = parseClientImportCsv(utf8(text));
    const marked = parseClientImportCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(text)]));

    expect(plain).toMatchObject({ status: 'PARSED', candidates: [{ firstName: 'Anaïs', phone: '0612345678' }] });
    expect(marked).toMatchObject({ status: 'PARSED', candidates: [{ firstName: 'Anaïs', phone: '0612345678' }] });
  });

  it('reads the Windows-1252 file of a French Excel export', () => {
    const bytes = latin1('Prénom;Nom;Téléphone\nAnaïs;Lefèvre;0612345678');

    expect(parseClientImportCsv(bytes)).toMatchObject({
      status: 'PARSED',
      candidates: [{ firstName: 'Anaïs', lastName: 'Lefèvre', phone: '0612345678' }],
      ignoredColumns: [],
    });
  });

  it('reads UTF-16 with a byte order mark', () => {
    const text = 'Prénom\tTéléphone\nAnaïs\t0612345678';

    expect(decodeClientImportCsv(utf16(text, true))).toBe(text);
    expect(parseClientImportCsv(utf16(text, false))).toMatchObject({ status: 'PARSED', candidates: [{ firstName: 'Anaïs' }] });
  });

  it('decodes the Windows-1252 punctuation and characters beyond the basic plane', () => {
    expect(decodeClientImportCsv(new Uint8Array([0x4c, 0x92, 0x9c, 0x75, 0x66, 0x20, 0x80]))).toBe('L’œuf €');
    expect(decodeClientImportCsv(utf8('Zoé 🎂'))).toBe('Zoé 🎂');
  });

  it('refuses a file that is not text', () => {
    const workbook = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00]);

    expect(parseClientImportCsv(workbook)).toEqual({ status: 'UNUSABLE', reason: 'NOT_TEXT' });
  });

  it('refuses an empty or blank file', () => {
    expect(parseClientImportCsv(new Uint8Array())).toEqual({ status: 'UNUSABLE', reason: 'EMPTY' });
    expect(parseClientImportCsv(utf8('﻿ \r\n\n'))).toEqual({ status: 'UNUSABLE', reason: 'EMPTY' });
  });

  it('parses a text file holding nobody into no candidate, without failing', () => {
    expect(parseClientImportCsv(utf8('12;34\n--;--'))).toMatchObject({ status: 'PARSED', candidates: [] });
  });
});

describe('parseClientImportCsvText — malformed quotes', () => {
  it('refuses a quoted cell never closed instead of swallowing every following client', () => {
    const text = ['Prénom;Nom;Téléphone', 'Sophie;"Martin;0612345678', 'Nadia;Benali;0745678912', 'Lina;Haddad;0698765432'].join(
      '\n',
    );

    expect(readCsvText(text)).toEqual({ status: 'UNUSABLE', reason: 'MALFORMED_QUOTES', lineNumber: 2 });
    expect(parseClientImportCsv(utf8(text))).toEqual({ status: 'UNUSABLE', reason: 'MALFORMED_QUOTES', lineNumber: 2 });
  });

  it('refuses an unclosed quote opening a line, in a comma, single-column or « sep= » file', () => {
    expect(readCsvText('Prénom,Téléphone\n"Sophie,0612345678\nNadia,0745678912')).toMatchObject({
      reason: 'MALFORMED_QUOTES',
      lineNumber: 2,
    });
    expect(readCsvText('Sophie Martin 0612345678\n"Nadia Benali 0745678912\nLina 0698765432')).toMatchObject({
      reason: 'MALFORMED_QUOTES',
      lineNumber: 2,
    });
    expect(readCsvText('sep=;\r\nPrénom;Téléphone\r\nSophie;"0612345678\r\nNadia;0745678912')).toMatchObject({
      reason: 'MALFORMED_QUOTES',
      lineNumber: 3,
    });
  });

  it('refuses a quote closed in the middle of a later row, which merged the rows in between', () => {
    const text = [
      'Prénom;Nom;Téléphone',
      'Sophie;"Martin;0612345678',
      'Nadia;Benali;0745678912',
      'Lina;"Haddad";0698765432',
    ].join('\r\n');

    expect(readCsvText(text)).toEqual({ status: 'UNUSABLE', reason: 'MALFORMED_QUOTES', lineNumber: 2 });
  });

  it('still reads multiline cells, doubled quotes, both delimiters inside quotes and CRLF', () => {
    const text = [
      'Client;Téléphone;Commentaire',
      '"Martin; Sophie";0612345678;"dit ""Soso"", vient le mardi',
      'sur deux lignes"',
      '"Benali, Nadia" ;"0745678912";""',
      '"Haddad Lina";0698765432;"""cuivré"""',
    ].join('\r\n');
    const result = parseClientImportCsvText(text);

    expect(result.candidates.map((candidate) => candidate.sourceRef)).toEqual(['2', '4', '5']);
    expect(result.candidates[0]).toMatchObject({ phone: '0612345678' });
    expect(result.candidates[1]).toMatchObject({ phone: '0745678912' });
    expect(result.candidates[2]).toMatchObject({ firstName: 'Haddad', lastName: 'Lina', phone: '0698765432' });
    expect(result.ignoredColumns).toEqual(['Commentaire']);
  });

  it('keeps reading text after the closing quote of a one-line cell', () => {
    const result = parseClientImportCsvText('Client;Téléphone\n"Sophie" Martin;0612345678');

    expect(result.candidates[0]).toMatchObject({ firstName: 'Sophie', lastName: 'Martin', phone: '0612345678' });
  });
});

describe('parseClientImportCsvText — unsupported headers', () => {
  it.each([
    ['Nom client;Tél. mobile;Courriel perso\nSophie Martin;0612345678;sophie@example.com', 'header words'],
    ['Fiche;Portable perso\nSophie Martin;0612345678\nNadia Benali;0745678912', 'a partly matching word'],
    ['Identité,Coordonnées,Remarque\nSophie Martin,0612345678,\nNadia Benali,0745678912,', 'a title above phones'],
    ['Qui;Quand\nSophie;12/04/1990\nNadia;03/05', 'a title above dates'],
    ['Nom et prénom de la cliente', 'a single title line'],
  ])('refuses a header row mapping no column, never making it a client (%#: %s)', (text) => {
    expect(readCsvText(text)).toEqual({ status: 'UNUSABLE', reason: 'UNSUPPORTED_COLUMNS' });
    expect(parseClientImportCsv(utf8(text))).toEqual({ status: 'UNUSABLE', reason: 'UNSUPPORTED_COLUMNS' });
  });

  it('still maps a recognized header, its unknown columns ignored', () => {
    const result = parseClientImportCsvText('Prénom;Nom;Tél. mobile;Notes\nSophie;Martin;0612345678;Allergie');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ firstName: 'Sophie', lastName: 'Martin', sourceRef: '2' });
    expect(result.ignoredColumns).toEqual(['Tél. mobile', 'Notes']);
  });

  it.each([
    ['Sophie;Martin;0612345678\nNadia;Benali;0745678912', 'first row holding a phone'],
    ['Sophie;Martin;\nNadia;Benali;0745678912\nLina;Haddad;0698765432', 'first client without a phone'],
    ['Sophie Martin\nNadia Benali\nLina Haddad', 'names only, one column'],
    ['Sophie;Martin\nNadia;Benali', 'names only, two columns'],
  ])('still reads a header-less list from its first row (%s)', (text) => {
    const result = parseClientImportCsvText(text);

    expect(result.candidates[0]).toMatchObject({ firstName: 'Sophie', lastName: 'Martin', sourceRef: '1' });
    expect(result.ignoredColumns).toEqual([]);
  });
});

describe('findCriticalClientImportColumns — ignored columns holding client data', () => {
  it('flags the unknown columns of a mixed header, never mapping them', () => {
    const result = parseClientImportCsvText(
      'Prénom;Nom;Téléphone;Portable 2;Notes\nSophie;Martin;0612345678;0745678912;VIP',
    );

    expect(result.candidates[0]).toMatchObject({ firstName: 'Sophie', phone: '0612345678', issues: [] });
    expect(result.ignoredColumns).toEqual(['Portable 2', 'Notes']);
    expect(findCriticalClientImportColumns(result.ignoredColumns)).toEqual([{ column: 'Portable 2', field: 'phone' }]);
  });

  it.each([
    ['Téléphone 2', 'phone'],
    ['Tel2', 'phone'],
    ['telephone_mobile_1', 'phone'],
    ['Mobile perso', 'phone'],
    ['N° GSM', 'phone'],
    ['PhoneNumber2', 'phone'],
    ['Telefone', 'phone'],
    ['E-mails', 'email'],
    ['eMail 2', 'email'],
    ['Adresse mél', 'email'],
    ['Courriel pro', 'email'],
    ['Prénom 2', 'name'],
    ['Prénoms', 'name'],
    ['Nom de jeune fille', 'name'],
    ['FirstName2', 'name'],
    ['Date naiss.', 'birthday'],
    ['Né le / naissance', 'birthday'],
    ['Anniv.', 'birthday'],
    ['BirthDate (jj/mm)', 'birthday'],
  ])('flags « %s » as %s data (accents, punctuation, spaces, numeric suffixes)', (column, field) => {
    expect(findCriticalClientImportColumns([column])).toEqual([{ column, field }]);
  });

  it('leaves unrelated ignored columns as plain ignored ones', () => {
    expect(
      findCriticalClientImportColumns([
        'Notes',
        'Total dépensé',
        'Dernière visite',
        'Numéro client',
        'Date de création',
        'Adresse',
        'Ville',
        'Code postal',
        'Client depuis',
        'Remarques',
        'Fidélité',
      ]),
    ).toEqual([]);
  });

  it('flags every critical column of a file, in column order, by their original names', () => {
    const result = parseClientImportCsvText(
      'Prénom;Nom;Téléphone 2;Notes;Email 2;Anniversaire client;Prénom 2\nSophie;Martin;0612345678;;sophie@example.com;12/04;Lina',
    );

    expect(findCriticalClientImportColumns(result.ignoredColumns)).toEqual([
      { column: 'Téléphone 2', field: 'phone' },
      { column: 'Email 2', field: 'email' },
      { column: 'Anniversaire client', field: 'birthday' },
      { column: 'Prénom 2', field: 'name' },
    ]);
  });

  it('finds nothing in a header-less file, which has no ignored column', () => {
    const result = parseClientImportCsvText('Sophie;Martin;0612345678\nNadia;Benali;0745678912');

    expect(result.ignoredColumns).toEqual([]);
    expect(findCriticalClientImportColumns(result.ignoredColumns)).toEqual([]);
  });
});
