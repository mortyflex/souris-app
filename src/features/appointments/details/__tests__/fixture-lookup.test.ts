import { getAgendaFixtureAppointmentById } from '../fixture-lookup';

describe('Agenda fixture appointment lookup', () => {
  it('resolves a known appointment by identity', () => {
    const result = getAgendaFixtureAppointmentById('agenda-sofia', new Date(2026, 7, 24));

    expect(result?.clientName).toBe('Sofia Petit');
  });

  it('returns undefined for an unknown appointment id', () => {
    expect(
      getAgendaFixtureAppointmentById('missing-appointment', new Date(2026, 7, 24)),
    ).toBeUndefined();
  });
});
