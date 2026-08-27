import type { Appointment, Service } from '@/domain/appointments';

import {
  areDraftsEqual,
  createSelectedServiceDraft,
  getSelectedServiceDraftKey,
  hydrateAppointmentDrafts,
  updateDraftPhaseDuration,
} from '../draft';

const currentBalayage: Service = {
  id: 'service-balayage',
  businessId: 'fixture-business',
  name: 'Balayage',
  type: 'TECHNIQUE',
  price: 100,
  active: true,
  phases: [
    { id: 'application', name: 'Application', durationMinutes: 30, requiresStaff: true },
    { id: 'processing', name: 'Temps de pose', durationMinutes: 45, requiresStaff: false },
    { id: 'finish', name: 'Finition', durationMinutes: 30, requiresStaff: true },
  ],
};

const currentCoupe: Service = {
  id: 'service-coupe',
  businessId: 'fixture-business',
  name: 'Coupe',
  type: 'SERVICE',
  price: 42,
  active: true,
  phases: [{ id: 'cut', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
};

const existingAppointment: Appointment = {
  id: 'appointment-snapshot',
  businessId: 'fixture-business',
  clientId: 'client-1',
  staffMemberId: 'staff-1',
  startAt: new Date('2026-08-24T14:00:00.000Z'),
  status: 'SCHEDULED',
  items: [
    {
      id: 'item-balayage',
      serviceId: currentBalayage.id,
      order: 0,
      serviceName: 'Balayage',
      serviceType: 'TECHNIQUE',
      price: 95,
      phases: [
        { id: 'application', name: 'Application', durationMinutes: 30, requiresStaff: true },
        { id: 'processing', name: 'Temps de pose', durationMinutes: 55, requiresStaff: false },
        { id: 'finish', name: 'Finition', durationMinutes: 30, requiresStaff: true },
      ],
    },
  ],
};

describe('shared appointment service editor drafts', () => {
  it('hydrates an existing snapshot instead of reading current catalog values', () => {
    const [draft] = hydrateAppointmentDrafts(existingAppointment);

    expect(draft).toMatchObject({
      appointmentItemId: 'item-balayage',
      serviceId: 'service-balayage',
      serviceName: 'Balayage',
      serviceType: 'TECHNIQUE',
      price: 95,
    });
    expect(draft?.phases.map((phase) => phase.durationMinutes)).toEqual([30, 55, 30]);
    expect(currentBalayage.price).toBe(100);
    expect(currentBalayage.phases[1]?.durationMinutes).toBe(45);
  });

  it('keeps repeated historical services independently addressable by item id', () => {
    const original = existingAppointment.items[0];
    if (!original) throw new Error('Expected an existing service item');

    const repeatedAppointment: Appointment = {
      ...existingAppointment,
      items: [
        {
          ...original,
          id: 'item-balayage-second',
          order: 1,
          price: 80,
        },
        original,
      ],
    };
    const drafts = hydrateAppointmentDrafts(repeatedAppointment);

    expect(drafts.map(getSelectedServiceDraftKey)).toEqual([
      'item-balayage',
      'item-balayage-second',
    ]);
  });

  it('starts a newly added service from current catalog configuration', () => {
    const draft = createSelectedServiceDraft(currentCoupe);

    expect(draft).toMatchObject({
      serviceId: 'service-coupe',
      serviceName: 'Coupe',
      serviceType: 'SERVICE',
      price: 42,
    });
    expect(draft.phases).toEqual(currentCoupe.phases);
    expect(draft.phases).not.toBe(currentCoupe.phases);
  });

  it('updates the appointment draft phases without changing the catalog', () => {
    const [draft] = hydrateAppointmentDrafts(existingAppointment);
    if (!draft) throw new Error('Expected a hydrated draft');

    const updated = updateDraftPhaseDuration(draft, 'processing', 40);

    expect(updated.phases[1]?.durationMinutes).toBe(40);
    expect(draft.phases[1]?.durationMinutes).toBe(55);
    expect(existingAppointment.items[0]?.phases[1]?.durationMinutes).toBe(55);
  });

  it('detects meaningful edits but treats independent draft object copies as equal', () => {
    const drafts = hydrateAppointmentDrafts(existingAppointment);
    const copied = hydrateAppointmentDrafts(existingAppointment);

    expect(areDraftsEqual(drafts, copied)).toBe(true);
    expect(areDraftsEqual(drafts, [
      {
        ...copied[0],
        price: 90,
      },
    ])).toBe(false);
  });
});
