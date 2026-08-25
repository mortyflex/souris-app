import type { Appointment } from '@/domain/appointments';

import type { AgendaStaffSegment } from '../layout/agenda-staff-segments';
import { buildAgendaStaffSegments } from '../layout/agenda-staff-segments';
import { getAgendaSegmentContent } from '../segment-content';

function segment(
  serviceName: string,
  phaseNames: readonly string[],
  isResume = false,
): AgendaStaffSegment {
  return {
    id: 'segment-a',
    appointmentId: 'appointment-a',
    clientId: 'client-a',
    serviceName,
    phaseNames,
    startAt: new Date(2026, 7, 24, 9, 0),
    endAt: new Date(2026, 7, 24, 9, 15),
    isResume,
    phases: [],
  };
}

function consecutiveSimpleServices(): Appointment {
  return {
    id: 'appointment-simple-services',
    businessId: 'business-a',
    clientId: 'client-a',
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 7, 24, 9),
    status: 'SCHEDULED',
    items: [
      {
        id: 'item-cut',
        serviceId: 'service-cut',
        order: 0,
        serviceName: 'Coupe Femme / Homme',
        serviceType: 'SERVICE',
        price: 25,
        phases: [
          {
            id: 'phase-cut',
            name: 'Coupe Femme / Homme',
            durationMinutes: 30,
            requiresStaff: true,
          },
        ],
      },
      {
        id: 'item-brushing',
        serviceId: 'service-brushing',
        order: 1,
        serviceName: 'Brushing 1',
        serviceType: 'SERVICE',
        price: 30,
        phases: [
          {
            id: 'phase-brushing',
            name: 'Brushing 1',
            durationMinutes: 30,
            requiresStaff: true,
          },
        ],
      },
    ],
  };
}

describe('Agenda segment content', () => {
  it('deduplicates a SERVICE name and identical phase', () => {
    const content = getAgendaSegmentContent(segment('Coupe', ['Coupe']), 'Camille Durand', 'tall');

    expect(content.serviceLabel).toBe('Coupe');
    expect(content.phaseLabel).toBeUndefined();
  });

  it('deduplicates labels differing only by case and whitespace', () => {
    const content = getAgendaSegmentContent(
      segment('  Brushing ', ['BRUSHING']),
      'Inès Bernard',
      'tall',
    );

    expect(content.phaseLabel).toBeUndefined();
  });

  it('does not repeat a composite simple-service summary as its phase line', () => {
    const content = getAgendaSegmentContent(
      segment('Coupe Femme / Homme · Brushing 1', ['Coupe Femme / Homme', 'Brushing 1']),
      'Clarisse Baudry',
      'tall',
    );

    expect(content.serviceLabel).toBe('Coupe Femme / Homme · Brushing 1');
    expect(content.phaseLabel).toBeUndefined();
  });

  it('deduplicates the content generated from consecutive simple appointment items', () => {
    const agendaSegment = buildAgendaStaffSegments(consecutiveSimpleServices())[0];
    expect(agendaSegment).toBeDefined();

    if (!agendaSegment) return;
    const content = getAgendaSegmentContent(agendaSegment, 'Clarisse Baudry', 'tall');

    expect(content.serviceLabel).toBe('Coupe Femme / Homme · Brushing 1');
    expect(content.phaseLabel).toBeUndefined();
  });

  it('preserves distinct TECHNIQUE service and phase concepts', () => {
    const content = getAgendaSegmentContent(
      segment('Balayage', ['Application']),
      'Sofia Petit',
      'tall',
    );

    expect(content.serviceLabel).toBe('Balayage');
    expect(content.phaseLabel).toBe('Application');
  });

  it('keeps service context on a medium reprise', () => {
    const content = getAgendaSegmentContent(
      segment('Coloration', ['Rinçage'], true),
      'Léa Martin',
      'medium',
    );

    expect(content.serviceLabel).toBe('Coloration');
    expect(content.showReprise).toBe(true);
    expect(content.phaseLabel).toBeUndefined();
  });

  it('keeps service context and phase detail on a tall reprise', () => {
    const content = getAgendaSegmentContent(
      segment('Coloration', ['Rinçage'], true),
      'Léa Martin',
      'tall',
    );

    expect(content.serviceLabel).toBe('Coloration');
    expect(content.showReprise).toBe(true);
    expect(content.phaseLabel).toBe('Rinçage');
    expect(content.phaseOnSeparateLine).toBe(true);
  });

  it('exposes client and service in a compact initial segment', () => {
    const content = getAgendaSegmentContent(segment('Coloration', ['Application']), 'Léa Martin', 'compact');

    expect(content.compactClientLabel).toBe('Léa');
    expect(content.compactSecondaryLabel).toBe('Coloration');
    expect(content.compactSecondaryIsReprise).toBe(false);
  });

  it('exposes client and reprise state in a compact reprise', () => {
    const content = getAgendaSegmentContent(
      segment('Coloration', ['Rinçage'], true),
      'Léa Martin',
      'compact',
    );

    expect(content.compactClientLabel).toBe('Léa');
    expect(content.compactSecondaryLabel).toBe('Reprise');
    expect(content.compactSecondaryIsReprise).toBe(true);
  });
});
