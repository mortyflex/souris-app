import {
  calculateAppointmentTimeline,
  canRemoveAppointmentItem,
  hydrateAppointmentDrafts,
  updateAppointmentFromDrafts,
  type Appointment,
  type AppointmentItem,
  type AppointmentItemEditDraft,
} from '../index';

function item(
  id: string,
  order: number,
  serviceId: string,
  serviceName: string,
  price: number,
  phases: AppointmentItem['phases'],
): AppointmentItem {
  return {
    id,
    serviceId,
    order,
    serviceName,
    serviceType: phases.some((phase) => !phase.requiresStaff) ? 'TECHNIQUE' : 'SERVICE',
    price,
    phases,
  };
}

function appointment(): Appointment {
  return {
    id: 'appointment-edit',
    businessId: 'business-edit',
    clientId: 'client-edit',
    staffMemberId: 'staff-edit',
    startAt: new Date('2026-08-24T09:00:00.000Z'),
    status: 'COMPLETED',
    notes: 'Conserver la longueur',
    cancellation: {
      cancelledAt: new Date('2026-08-20T10:00:00.000Z'),
      cancelledBy: 'BUSINESS',
      reason: 'Test historique',
    },
    noShow: { recordedAt: new Date('2026-08-21T10:00:00.000Z') },
    items: [
      item('item-balayage', 0, 'service-balayage', 'Balayage', 95, [
        { id: 'application', name: 'Application', durationMinutes: 30, requiresStaff: true },
        { id: 'processing', name: 'Temps de pose', durationMinutes: 55, requiresStaff: false },
        { id: 'finish', name: 'Finition', durationMinutes: 30, requiresStaff: true },
      ]),
      item('item-coupe', 1, 'service-coupe', 'Coupe', 42, [
        { id: 'cut', name: 'Coupe', durationMinutes: 30, requiresStaff: true },
      ]),
      item('item-brushing', 2, 'service-brushing', 'Brushing', 35, [
        { id: 'blowdry', name: 'Brushing', durationMinutes: 45, requiresStaff: true },
      ]),
    ],
  };
}

function draft(
  id: string,
  serviceId: string,
  order: number,
  serviceName: string,
  price: number,
  phases: AppointmentItem['phases'],
): AppointmentItemEditDraft {
  return { id, serviceId, order, serviceName, serviceType: 'SERVICE', price, phases };
}

describe('Appointment service editing domain operation', () => {
  it('hydrates existing snapshot values and owns nested phase objects', () => {
    const source = appointment();
    const drafts = hydrateAppointmentDrafts(source);

    expect(drafts.map((entry) => [entry.id, entry.serviceName, entry.price])).toEqual([
      ['item-balayage', 'Balayage', 95],
      ['item-coupe', 'Coupe', 42],
      ['item-brushing', 'Brushing', 35],
    ]);
    expect(drafts[0]?.phases[1]?.durationMinutes).toBe(55);
    expect(drafts[0]?.phases).not.toBe(source.items[0]?.phases);
    expect(drafts[0]?.phases[1]).not.toBe(source.items[0]?.phases[1]);
  });

  it('rebuilds price and processing changes immutably while preserving metadata', () => {
    const source = appointment();
    const drafts = hydrateAppointmentDrafts(source);
    const balayage = drafts[0];
    if (!balayage) throw new Error('Expected a Balayage draft');

    const updated = updateAppointmentFromDrafts(source, [
      {
        ...balayage,
        price: 90,
        phases: balayage.phases.map((phase) =>
          phase.id === 'processing' ? { ...phase, durationMinutes: 40 } : phase,
        ),
      },
      drafts[1],
      drafts[2],
    ]);

    expect(updated.items[0]?.id).toBe('item-balayage');
    expect(updated.items[0]?.price).toBe(90);
    expect(updated.items[0]?.phases[1]?.durationMinutes).toBe(40);
    expect(calculateAppointmentTimeline(updated).endAt).toEqual(
      new Date('2026-08-24T11:55:00.000Z'),
    );
    expect(updated.id).toBe(source.id);
    expect(updated.businessId).toBe(source.businessId);
    expect(updated.clientId).toBe(source.clientId);
    expect(updated.staffMemberId).toBe(source.staffMemberId);
    expect(updated.startAt).toEqual(source.startAt);
    expect(updated.status).toBe(source.status);
    expect(updated.notes).toBe(source.notes);
    expect(updated.cancellation).toEqual(source.cancellation);
    expect(updated.noShow).toEqual(source.noShow);
    expect(source.items[0]?.price).toBe(95);
    expect(source.items[0]?.phases[1]?.durationMinutes).toBe(55);
  });

  it('normalizes a reorder, preserves retained ids, and recalculates the timeline', () => {
    const source = appointment();
    const drafts = hydrateAppointmentDrafts(source);
    const reordered = updateAppointmentFromDrafts(source, [
      drafts[1],
      drafts[0],
      drafts[2],
    ]);
    const timeline = calculateAppointmentTimeline(reordered);

    expect(reordered.items.map((entry) => [entry.id, entry.order])).toEqual([
      ['item-coupe', 0],
      ['item-balayage', 1],
      ['item-brushing', 2],
    ]);
    expect(timeline.items.map((entry) => entry.serviceName)).toEqual([
      'Coupe',
      'Balayage',
      'Brushing',
    ]);
    expect(timeline.items[1]?.startAt).toEqual(new Date('2026-08-24T09:30:00.000Z'));
    expect(source.items.map((entry) => entry.id)).toEqual([
      'item-balayage',
      'item-coupe',
      'item-brushing',
    ]);
  });

  it('removes an item without deleting its catalog identity and rejects an empty result', () => {
    const source = appointment();
    const drafts = hydrateAppointmentDrafts(source);
    const remaining = updateAppointmentFromDrafts(source, [drafts[0], drafts[1]]);

    expect(remaining.items.map((entry) => entry.serviceName)).toEqual(['Balayage', 'Coupe']);
    expect(remaining.items.map((entry) => entry.id)).toEqual(['item-balayage', 'item-coupe']);
    expect(canRemoveAppointmentItem(2)).toBe(true);
    expect(canRemoveAppointmentItem(1)).toBe(false);
    expect(() => updateAppointmentFromDrafts(source, [])).toThrow('at least one service');
  });

  it('accepts a newly assigned item id and preserves the new catalog snapshot', () => {
    const source = appointment();
    const drafts = hydrateAppointmentDrafts(source);
    const newService: AppointmentItemEditDraft = draft(
      'appointment-edit-item-new',
      'service-treatment',
      3,
      'Soin profond',
      48,
      [{ id: 'treatment', name: 'Soin profond', durationMinutes: 35, requiresStaff: true }],
    );
    const updated = updateAppointmentFromDrafts(source, [drafts[0], newService]);

    expect(updated.items.map((entry) => entry.id)).toEqual([
      'item-balayage',
      'appointment-edit-item-new',
    ]);
    expect(updated.items[1]).toMatchObject({
      serviceId: 'service-treatment',
      serviceName: 'Soin profond',
      price: 48,
      order: 1,
    });
  });
});
