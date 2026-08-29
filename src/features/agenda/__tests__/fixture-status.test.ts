// Souris — Development fixture status coherence
//
// Past fixture appointments represent normally completed services and are
// seeded as COMPLETED (seed data, never runtime auto-completion). Derived
// activity then counts them correctly through the unchanged COMPLETED-only
// rule.

import { createAgendaFixtures } from '../fixtures/agenda-fixtures';
import { getClientActivitySummary } from '@/features/clients/profile/presentation';

const anchor = new Date(2026, 7, 29, 10, 0); // Saturday Aug 29 2026
const fixtures = createAgendaFixtures(anchor);

function findAppointment(id: string) {
  const entry = fixtures.find(({ appointment }) => appointment.id === id);
  expect(entry).toBeDefined();
  return entry?.appointment;
}

describe('Development Agenda fixture statuses', () => {
  it('seeds past weekday fixtures as COMPLETED', () => {
    expect(findAppointment('agenda-anais')?.status).toBe('COMPLETED');
    expect(findAppointment('agenda-elodie')?.status).toBe('COMPLETED');
    expect(findAppointment('agenda-hugo')?.status).toBe('COMPLETED');
    expect(findAppointment('agenda-julie')?.status).toBe('COMPLETED');
  });

  it('keeps anchor-day fixtures SCHEDULED', () => {
    expect(findAppointment('agenda-lea')?.status).toBe('SCHEDULED');
    expect(findAppointment('agenda-camille')?.status).toBe('SCHEDULED');
    expect(findAppointment('agenda-ines')?.status).toBe('SCHEDULED');
    expect(findAppointment('agenda-sofia')?.status).toBe('SCHEDULED');
    expect(findAppointment('agenda-nadia')?.status).toBe('SCHEDULED');
  });

  it('derives Anaïs activity from her completed snapshot: 1 RDV réalisé, 42,00 €', () => {
    const anaïs = findAppointment('agenda-anais');
    expect(anaïs?.clientId).toBe('client-agenda-anais');
    expect(anaïs?.items).toHaveLength(1);
    expect(anaïs?.items[0]?.price).toBe(42);

    const summary = getClientActivitySummary(fixtures, 'client-agenda-anais', anchor);

    expect(summary.completedAppointmentCount).toBe(1);
    expect(summary.totalSpent).toBe(42);
    expect(summary.appointmentCount).toBe(1);
  });

  it('derives Julie activity from her two completed snapshot items', () => {
    const summary = getClientActivitySummary(fixtures, 'client-agenda-julie', anchor);

    expect(summary.completedAppointmentCount).toBe(1);
    expect(summary.totalSpent).toBe(137);
  });

  it('derives the anchor-day Léa appointment as upcoming, not completed', () => {
    const summary = getClientActivitySummary(
      fixtures,
      'client-agenda-lea',
      new Date(2026, 7, 29, 8, 0),
    );

    expect(summary.completedAppointmentCount).toBe(0);
    expect(summary.totalSpent).toBe(0);
    expect(summary.nextAppointment?.appointment.id).toBe('agenda-lea');
  });

  it('never auto-completes a past SCHEDULED appointment at runtime', () => {
    const past = new Date(2026, 6, 5, 10, 0); // firmly before the anchor
    const pastScheduled = {
      appointment: {
        id: 'runtime-past-scheduled',
        businessId: 'fixture-business',
        clientId: 'client-agenda-lea',
        staffMemberId: 'staff-amelie',
        startAt: past,
        status: 'SCHEDULED' as const,
        items: [
          {
            id: 'runtime-past-item',
            serviceId: 'service-cut',
            order: 0,
            serviceName: 'Coupe',
            serviceType: 'SERVICE' as const,
            price: 42,
            phases: [
              { id: 'runtime-past-phase', name: 'Coupe', durationMinutes: 30, requiresStaff: true },
            ],
          },
        ],
      },
    };

    const summary = getClientActivitySummary([pastScheduled], 'client-agenda-lea', anchor);

    expect(pastScheduled.appointment.status).toBe('SCHEDULED');
    expect(summary.completedAppointmentCount).toBe(0);
    expect(summary.totalSpent).toBe(0);
  });
});
