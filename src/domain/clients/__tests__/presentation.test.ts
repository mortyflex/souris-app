import { getClientDisplayName, getClientInitial, getClientInitials } from '../presentation';
import type { Client } from '../types';

describe('Client display name', () => {
  it('combines firstName and lastName', () => {
    const client: Client = { id: 'c1', firstName: 'Léa', lastName: 'Martin' };

    expect(getClientDisplayName(client)).toBe('Léa Martin');
  });

  it('uses only firstName when lastName is absent', () => {
    const client: Client = { id: 'c1', firstName: 'Léa' };

    expect(getClientDisplayName(client)).toBe('Léa');
  });

  it('uses only firstName when lastName is empty', () => {
    const client: Client = { id: 'c1', firstName: 'Léa', lastName: '' };

    expect(getClientDisplayName(client)).toBe('Léa');
  });

  it('trims surrounding whitespace', () => {
    const client: Client = { id: 'c1', firstName: '  Léa ', lastName: ' Martin ' };

    expect(getClientDisplayName(client)).toBe('Léa Martin');
  });

  it('never adds honorifics or titles', () => {
    const client: Client = { id: 'c1', firstName: 'Mme', lastName: 'Lefèvre' };

    expect(getClientDisplayName(client)).toBe('Mme Lefèvre');
  });
});

describe('Client initial', () => {
  it('returns the uppercase first character', () => {
    expect(getClientInitial({ firstName: 'léa' })).toBe('L');
  });

  it('returns an empty string for a blank firstName', () => {
    expect(getClientInitial({ firstName: '   ' })).toBe('');
  });
});

describe('Client initials', () => {
  it('returns the uppercase first and last name initials', () => {
    expect(getClientInitials({ firstName: 'audrey', lastName: 'tarmis' })).toBe('AT');
  });

  it('falls back to the first name initial without a last name', () => {
    expect(getClientInitials({ firstName: 'Nour' })).toBe('N');
    expect(getClientInitials({ firstName: 'Nour', lastName: '   ' })).toBe('N');
  });

  it('trims both names before reading their initials', () => {
    expect(getClientInitials({ firstName: '  élodie ', lastName: ' durand' })).toBe('ÉD');
  });
});
