import {
  describeWorkingHoursTimeZone,
  formatMinuteOfDay,
  formatOpenSwitchLabel,
  formatSpokenMinuteOfDay,
  formatSpokenWorkingDay,
  formatWeekday,
  formatWorkingDaySummary,
} from '../presentation';

describe('working hours presentation', () => {
  it('names the days in French, Monday first', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((weekday) => formatWeekday(weekday as 1))).toEqual([
      'Lundi',
      'Mardi',
      'Mercredi',
      'Jeudi',
      'Vendredi',
      'Samedi',
      'Dimanche',
    ]);
    expect(formatOpenSwitchLabel(7)).toBe('Ouvert le dimanche');
  });

  it('formats wall-clock minutes as they are, never through a Date', () => {
    expect(formatMinuteOfDay(0)).toBe('00:00');
    expect(formatMinuteOfDay(545)).toBe('09:05');
    expect(formatMinuteOfDay(1435)).toBe('23:55');
    expect(formatMinuteOfDay(1440)).toBe('24:00');
    expect(formatSpokenMinuteOfDay(60)).toBe('1 heure');
    expect(formatSpokenMinuteOfDay(750)).toBe('12 heures 30');
  });

  it('summarizes a day, its break included', () => {
    expect(
      formatWorkingDaySummary({
        weekday: 1,
        isOpen: true,
        intervals: [
          { startMinute: 540, endMinute: 720 },
          { startMinute: 840, endMinute: 1140 },
        ],
      }),
    ).toBe('09:00 – 12:00 · 14:00 – 19:00');
    expect(formatWorkingDaySummary({ weekday: 2, isOpen: false, intervals: [] })).toBe('Fermé');
  });

  it('speaks a day without relying on the layout', () => {
    expect(
      formatSpokenWorkingDay({
        weekday: 1,
        isOpen: true,
        intervals: [
          { startMinute: 540, endMinute: 720 },
          { startMinute: 840, endMinute: 1140 },
        ],
      }),
    ).toBe('Lundi, de 9 heures à 12 heures, puis de 14 heures à 19 heures');
    expect(formatSpokenWorkingDay({ weekday: 2, isOpen: false, intervals: [] })).toBe('Mardi, fermé');
  });

  it('says which clock the hours follow', () => {
    expect(describeWorkingHoursTimeZone('Europe/Paris')).toBe('Horaires à l’heure de Paris.');
    expect(describeWorkingHoursTimeZone('America/Martinique')).toBe('Horaires à l’heure locale (America/Martinique).');
  });
});
