import { CLIENT_NOTES_MAX_LENGTH, normalizeClientNotes } from '../notes';

describe('normalizeClientNotes', () => {
  it('treats a missing, empty or whitespace-only note as no note', () => {
    expect(normalizeClientNotes(undefined)).toBeUndefined();
    expect(normalizeClientNotes(null)).toBeUndefined();
    expect(normalizeClientNotes('')).toBeUndefined();
    expect(normalizeClientNotes('  \n\n \t ')).toBeUndefined();
  });

  it('trims the edges and preserves every internal line break', () => {
    expect(normalizeClientNotes('  Allergie au PPD.\n\nPréfère le matin\n- cuir chevelu sensible \n')).toBe(
      'Allergie au PPD.\n\nPréfère le matin\n- cuir chevelu sensible',
    );
  });

  it('is idempotent', () => {
    const once = normalizeClientNotes(' ligne 1\nligne 2 ');
    expect(normalizeClientNotes(once)).toBe(once);
  });

  it('documents a generous input bound, never a tiny one', () => {
    expect(CLIENT_NOTES_MAX_LENGTH).toBeGreaterThanOrEqual(2000);
  });
});
