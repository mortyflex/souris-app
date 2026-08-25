import { createAgendaFixtures } from '@/features/agenda/fixtures/agenda-fixtures';

import { getAppointmentSessionEntryById } from '../fixture-lookup';

describe('Agenda fixture appointment lookup', () => {
  const appointments = createAgendaFixtures(new Date(2026, 7, 24));

  it('resolves a known appointment by identity', () => {
    const result = getAppointmentSessionEntryById(appointments, 'agenda-sofia');

    expect(result?.clientDisplayName).toBe('Sofia Petit');
  });

  it('returns undefined for an unknown appointment id', () => {
    expect(getAppointmentSessionEntryById(appointments, 'missing-appointment')).toBeUndefined();
  });
});
