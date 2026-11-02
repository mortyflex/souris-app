// BeautIzzy — a masked password survives iOS emptying the secure field (pure rules)

import {
  ARMED_SECURE_ENTRY_WATCH,
  IDLE_SECURE_ENTRY_WATCH,
  readSecureEntryChange,
  type SecureEntryWatch,
} from '../secure-entry';

const cleared = (from: string): SecureEntryWatch => ({ kind: 'cleared', from });

describe('readSecureEntryChange', () => {
  it('takes every change as it arrives while nothing is watched', () => {
    expect(readSecureEntryChange(IDLE_SECURE_ENTRY_WATCH, 'motdepasse', 'z')).toEqual({
      value: 'z',
      watch: IDLE_SECURE_ENTRY_WATCH,
    });
    expect(readSecureEntryChange(IDLE_SECURE_ENTRY_WATCH, 'motdepasse', '')).toEqual({
      value: '',
      watch: IDLE_SECURE_ENTRY_WATCH,
    });
  });

  it('continues the value when iOS empties the field then reports the keystroke (two changes)', () => {
    const emptied = readSecureEntryChange(ARMED_SECURE_ENTRY_WATCH, 'motdepasse', '');
    // Until the keystroke arrives, the emptying reads as Delete.
    expect(emptied).toEqual({ value: 'motdepass', watch: cleared('motdepasse') });

    // The value prop has not re-rendered yet: the keystroke still sees the old value.
    expect(readSecureEntryChange(emptied.watch, 'motdepasse', 'z')).toEqual({
      value: 'motdepassez',
      watch: IDLE_SECURE_ENTRY_WATCH,
    });
  });

  it('reads an emptying with no keystroke after it as Delete: one character lost, not all', () => {
    const emptied = readSecureEntryChange(ARMED_SECURE_ENTRY_WATCH, 'motdepasse', '');
    expect(emptied.value).toBe('motdepass');
    // The next real edit happens on the kept value and is taken as it arrives.
    expect(readSecureEntryChange(emptied.watch, 'motdepass', 'motdepass1')).toEqual({
      value: 'motdepass1',
      watch: IDLE_SECURE_ENTRY_WATCH,
    });
  });

  it('never mistakes a later Delete on a short kept value for a keystroke', () => {
    const emptied = readSecureEntryChange(ARMED_SECURE_ENTRY_WATCH, 'abc', '');
    expect(emptied.value).toBe('ab');
    expect(readSecureEntryChange(emptied.watch, 'ab', 'a')).toEqual({ value: 'a', watch: IDLE_SECURE_ENTRY_WATCH });
  });

  it('continues the value when the emptying and the keystroke arrive as one change', () => {
    expect(readSecureEntryChange(ARMED_SECURE_ENTRY_WATCH, 'motdepasse', 'z')).toEqual({
      value: 'motdepassez',
      watch: IDLE_SECURE_ENTRY_WATCH,
    });
  });

  it('keeps real edits: autofill, paste, a single deletion, a one-character value', () => {
    // A password manager fills the whole password.
    expect(readSecureEntryChange(ARMED_SECURE_ENTRY_WATCH, 'ancien', 'Nouveau-Secret-42').value).toBe(
      'Nouveau-Secret-42',
    );
    // Deleting the last character of « ab » leaves « a ».
    expect(readSecureEntryChange(ARMED_SECURE_ENTRY_WATCH, 'ab', 'a').value).toBe('a');
    // One character deleted with one keystroke is a normal deletion.
    expect(readSecureEntryChange(ARMED_SECURE_ENTRY_WATCH, 'a', '').value).toBe('');
    // An empty field that receives its first character.
    expect(readSecureEntryChange(ARMED_SECURE_ENTRY_WATCH, '', 'm').value).toBe('m');
    // After the keystroke, nothing is watched any more.
    expect(readSecureEntryChange(cleared('motdepasse'), 'motdepasse', 'motdepasse12').value).toBe('motdepasse12');
  });
});
