// Souris — Development fixture status + runtime reconciliation
//
// Fixtures seed every appointment SCHEDULED (raw seed data). Automatic
// previous-local-day completion is product behavior and runs at the
// appointment session boundary: reconciling the seed against the anchor day
// completes the past-weekday fixtures, which then flow into Client activity
// through the unchanged COMPLETED-only rule.

import { createAgendaFixtures } from '../fixtures/agenda-fixtures';
import { reconcileAppointmentEntriesForLocalDay } from '@/features/appointments/session/reconciliation';
import { getClientActivitySummary } from '@/features/clients/profile/presentation';

const anchor = new Date(2026, 7, 29, 10, 0); // Saturday Aug 29 2026
const seeded = createAgendaFixtures(anchor);
const reconciled = reconcileAppointmentEntriesForLocalDay(seeded, anchor);

function seededAppointment(id: string) {
  return seeded.find(({ appointment }) => appointment.id === id)?.appointment;
}

function reconciledAppointment(id: string) {
  return reconciled.find(({ appointment }) => appointment.id === id)?.appointment;
}

describe('Development Agenda fixture statuses + reconciliation', () => {
  it('seeds every fixture SCHEDULED (status is raw seed data only)', () => {
    for (const { appointment } of seeded) {
      expect(appointment.status).toBe('SCHEDULED');
    }
  });

  it('reconciliation completes the past-weekday fixtures', () => {
    expect(reconciledAppointment('agenda-anais')?.status).toBe('COMPLETED');
    expect(reconciledAppointment('agenda-elodie')?.status).toBe('COMPLETED');
    expect(reconciledAppointment('agenda-hugo')?.status).toBe('COMPLETED');
    expect(reconciledAppointment('agenda-julie')?.status).toBe('COMPLETED');
  });

  it('reconciliation keeps anchor-day fixtures SCHEDULED', () => {
    expect(reconciledAppointment('agenda-lea')?.status).toBe('SCHEDULED');
    expect(reconciledAppointment('agenda-camille')?.status).toBe('SCHEDULED');
    expect(reconciledAppointment('agenda-ines')?.status).toBe('SCHEDULED');
    expect(reconciledAppointment('agenda-sofia')?.status).toBe('SCHEDULED');
    expect(reconciledAppointment('agenda-nadia')?.status).toBe('SCHEDULED');
  });

  it('does not mutate the seed collection', () => {
    expect(seededAppointment('agenda-anais')?.status).toBe('SCHEDULED');
  });

  it('derives Anaïs activity from her reconciled snapshot: 1 RDV réalisé, 42,00 €', () => {
    const anaïs = reconciledAppointment('agenda-anais');
    expect(anaïs?.clientId).toBe('client-agenda-anais');
    expect(anaïs?.items).toHaveLength(1);
    expect(anaïs?.items[0]?.price).toBe(42);

    const summary = getClientActivitySummary(reconciled, 'client-agenda-anais', anchor);

    expect(summary.completedAppointmentCount).toBe(1);
    expect(summary.totalSpent).toBe(42);
    expect(summary.appointmentCount).toBe(1);
  });

  it('derives Julie activity from her two reconciled snapshot items', () => {
    const summary = getClientActivitySummary(reconciled, 'client-agenda-julie', anchor);

    expect(summary.completedAppointmentCount).toBe(1);
    expect(summary.totalSpent).toBe(137);
  });

  it('derives the anchor-day Léa appointment as upcoming, not completed', () => {
    const summary = getClientActivitySummary(
      reconciled,
      'client-agenda-lea',
      new Date(2026, 7, 29, 8, 0),
    );

    expect(summary.completedAppointmentCount).toBe(0);
    expect(summary.totalSpent).toBe(0);
    expect(summary.nextAppointment?.appointment.id).toBe('agenda-lea');
  });
});
