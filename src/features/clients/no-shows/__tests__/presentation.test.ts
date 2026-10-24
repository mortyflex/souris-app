import { caution, cautionTint } from '@/shared/ui/theme';

import {
  DEPOSIT_HINT,
  formatRecordedNoShows,
  getClientNoShowWarning,
  getNoShowWarningColors,
} from '../presentation';

describe('getClientNoShowWarning', () => {
  it('says nothing for a client without no-shows, whatever the latest outcome', () => {
    expect(getClientNoShowWarning({ noShowCount: 0, latestOutcome: undefined })).toBeUndefined();
    expect(getClientNoShowWarning({ noShowCount: 0, latestOutcome: 'ATTENDED' })).toBeUndefined();
  });

  it('warns that the last appointment was missed: singular count, then the deposit hint, one line', () => {
    expect(getClientNoShowWarning({ noShowCount: 1, latestOutcome: 'NO_SHOW' })).toEqual({
      kind: 'LAST_MISSED',
      noShowCount: 1,
      severity: 'low',
      title: 'Dernier rendez-vous non honoré',
      summary: '1 absence enregistrée. Pensez à demander un acompte.',
      accessibilityLabel:
        'Dernier rendez-vous non honoré. 1 absence enregistrée. Pensez à demander un acompte.',
    });
  });

  it('uses the plural count from two no-shows', () => {
    const warning = getClientNoShowWarning({ noShowCount: 2, latestOutcome: 'NO_SHOW' });

    expect(warning?.severity).toBe('low');
    expect(warning?.summary).toBe(`2 absences enregistrées. ${DEPOSIT_HINT}`);
  });

  it('grades the severity like the profile: orange at 3 and 5, red at 6 and beyond', () => {
    expect(getClientNoShowWarning({ noShowCount: 3, latestOutcome: 'NO_SHOW' })?.severity).toBe('moderate');
    expect(getClientNoShowWarning({ noShowCount: 5, latestOutcome: 'NO_SHOW' })?.severity).toBe('moderate');
    expect(getClientNoShowWarning({ noShowCount: 6, latestOutcome: 'NO_SHOW' })?.severity).toBe('high');
    expect(getClientNoShowWarning({ noShowCount: 11, latestOutcome: 'ATTENDED' })?.severity).toBe('high');
  });

  it('falls back to the history wording — the count alone — when the client came back since', () => {
    expect(getClientNoShowWarning({ noShowCount: 1, latestOutcome: 'ATTENDED' })).toEqual({
      kind: 'HISTORY',
      noShowCount: 1,
      severity: 'low',
      title: "Historique d'absences",
      summary: '1 absence enregistrée.',
      accessibilityLabel: "Historique d'absences. 1 absence enregistrée.",
    });
    expect(getClientNoShowWarning({ noShowCount: 4, latestOutcome: 'ATTENDED' })?.summary).toBe(
      '4 absences enregistrées.',
    );
  });

  it('never claims a missed last appointment when the latest outcome is unknown', () => {
    const warning = getClientNoShowWarning({ noShowCount: 4, latestOutcome: undefined });

    expect(warning?.kind).toBe('HISTORY');
    expect(warning?.title).toBe("Historique d'absences");
    expect(warning?.accessibilityLabel).not.toMatch(/dernier|acompte/i);
  });

  it('keeps every visible word neutral: never « cliente »', () => {
    for (const warning of [
      getClientNoShowWarning({ noShowCount: 1, latestOutcome: 'NO_SHOW' }),
      getClientNoShowWarning({ noShowCount: 3, latestOutcome: 'ATTENDED' }),
    ]) {
      expect(warning?.accessibilityLabel).not.toMatch(/\bclientes?\b/i);
    }
  });
});

describe('no-show warning wording', () => {
  it('agrees the recorded count in number', () => {
    expect(formatRecordedNoShows(1)).toBe('1 absence enregistrée.');
    expect(formatRecordedNoShows(2)).toBe('2 absences enregistrées.');
    expect(formatRecordedNoShows(12)).toBe('12 absences enregistrées.');
  });
});

describe('getNoShowWarningColors', () => {
  it('maps the severity to the caution outline and its quiet badge tint', () => {
    expect(getNoShowWarningColors('low')).toEqual({ accent: caution.amber600, badge: cautionTint.amber });
    expect(getNoShowWarningColors('moderate')).toEqual({
      accent: caution.orange600,
      badge: cautionTint.orange,
    });
    expect(getNoShowWarningColors('high')).toEqual({ accent: caution.red600, badge: cautionTint.red });
  });
});
