// BeautIzzy — client import CSV adapter (fictional data only)

import type { Client } from '../../types';
import { classifyClientImportCandidates } from '../classification';
import { decodeClientImportCsv, parseClientImportCsv, parseClientImportCsvText } from '../csv-parser';
import { parseClientImportText } from '../text-parser';
import type { ClientImportCandidate } from '../types';

function codes(candidate: ClientImportCandidate | undefined): readonly string[] {
  return candidate?.issues.map((issue) => issue.code) ?? [];
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
