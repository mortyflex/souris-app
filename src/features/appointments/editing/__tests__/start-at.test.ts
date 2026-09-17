import { changeAppointmentLocalDate, isSameStartAt, setAppointmentLocalTime } from '../start-at';

describe('setAppointmentLocalTime', () => {
  const start = new Date(2026, 7, 25, 10, 15, 30);

  it('sets the chosen time on the same local calendar date, dropping seconds', () => {
    expect(setAppointmentLocalTime(start, 19, 0)).toEqual(new Date(2026, 7, 25, 19, 0));
  });

  it('allows the whole day, from 00:xx to 23:xx, without changing the date', () => {
    expect(setAppointmentLocalTime(start, 0, 5)).toEqual(new Date(2026, 7, 25, 0, 5));
    expect(setAppointmentLocalTime(start, 23, 55)).toEqual(new Date(2026, 7, 25, 23, 55));
  });

  it('keeps an off-grid minute when only the hour changes', () => {
    const offGrid = new Date(2026, 7, 25, 9, 36);
    expect(setAppointmentLocalTime(offGrid, 14, offGrid.getMinutes())).toEqual(
      new Date(2026, 7, 25, 14, 36),
    );
  });

  it('is detected as a change at minute precision', () => {
    expect(isSameStartAt(new Date(2026, 7, 25, 10, 15), setAppointmentLocalTime(start, 10, 15))).toBe(true);
    expect(isSameStartAt(new Date(2026, 7, 25, 10, 15), setAppointmentLocalTime(start, 10, 20))).toBe(false);
  });
});

describe('changeAppointmentLocalDate', () => {
  it('keeps the time of day chosen on the wheels when the date moves', () => {
    const start = setAppointmentLocalTime(new Date(2026, 7, 25, 10, 15), 23, 40);
    expect(changeAppointmentLocalDate(start, new Date(2026, 8, 2))).toEqual(new Date(2026, 8, 2, 23, 40));
  });
});
