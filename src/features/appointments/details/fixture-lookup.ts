import { startOfLocalDay } from '@/features/agenda/calendar/week';
import { createAgendaFixtures, type AgendaFixtureAppointment } from '@/features/agenda/fixtures/agenda-fixtures';

/** Temporary development boundary until Agenda data is persisted. */
export function getAgendaFixtureAppointmentById(
  appointmentId: string | undefined,
  referenceDay: Date,
): AgendaFixtureAppointment | undefined {
  if (!appointmentId) return undefined;

  return createAgendaFixtures(startOfLocalDay(referenceDay)).find(
    ({ appointment }) => appointment.id === appointmentId,
  );
}
