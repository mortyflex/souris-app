import { caution } from '@/shared/ui/theme';

import {
  describeNoShowSeverity,
  getNoShowSeverity,
  getNoShowSeverityAccent,
} from '../no-show-severity';

describe('getNoShowSeverity', () => {
  it('keeps zero absences neutral', () => {
    expect(getNoShowSeverity(0)).toBe('neutral');
  });

  it('reads one or two absences as low (amber) — a single no-show already shows', () => {
    expect(getNoShowSeverity(1)).toBe('low');
    expect(getNoShowSeverity(2)).toBe('low');
  });

  it('reads three to five absences as moderate (orange)', () => {
    expect(getNoShowSeverity(3)).toBe('moderate');
    expect(getNoShowSeverity(4)).toBe('moderate');
    expect(getNoShowSeverity(5)).toBe('moderate');
  });

  it('reads six absences and beyond as high (red)', () => {
    expect(getNoShowSeverity(6)).toBe('high');
    expect(getNoShowSeverity(7)).toBe('high');
    expect(getNoShowSeverity(42)).toBe('high');
  });

  it('treats invalid or missing input as neutral, never alarming', () => {
    for (const input of [undefined, null, NaN, Infinity, -Infinity, -1, '3', {}, [], true]) {
      expect(getNoShowSeverity(input)).toBe('neutral');
    }
  });

  it('grades a fractional count by its whole part', () => {
    expect(getNoShowSeverity(0.5)).toBe('neutral');
    expect(getNoShowSeverity(2.9)).toBe('low');
    expect(getNoShowSeverity(5.5)).toBe('moderate');
  });
});

describe('no-show severity presentation', () => {
  it('maps each severity to one caution outline, none for neutral', () => {
    expect(getNoShowSeverityAccent('neutral')).toBeUndefined();
    expect(getNoShowSeverityAccent('low')).toEqual({ color: caution.amber600 });
    expect(getNoShowSeverityAccent('moderate')).toEqual({ color: caution.orange600 });
    expect(getNoShowSeverityAccent('high')).toEqual({ color: caution.red600 });
  });

  it('speaks every non-neutral severity so colour is never the only cue', () => {
    expect(describeNoShowSeverity('neutral')).toBeUndefined();
    expect(describeNoShowSeverity('low')).toBe('à surveiller');
    expect(describeNoShowSeverity('moderate')).toBe('absences répétées');
    expect(describeNoShowSeverity('high')).toBe('absences fréquentes');
  });
});
