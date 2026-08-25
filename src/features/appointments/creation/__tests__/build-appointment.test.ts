import { getAppointmentEndAt } from '@/domain/appointments';

import { buildAppointment, type BuildAppointmentItemInput } from '../build-appointment';

const services = {
  cut: {
    id: 'service-cut',
    businessId: 'fixture-business',
    name: 'Coupe',
    type: 'SERVICE' as const,
    price: 25,
    active: true,
    phases: [
      { id: 'cut-phase', name: 'Coupe', durationMinutes: 30, requiresStaff: true },
    ],
  },
  color: {
    id: 'technique-color',
    businessId: 'fixture-business',
    name: 'Couleur Racines',
    type: 'TECHNIQUE' as const,
    price: 30,
    active: true,
    phases: [
      { id: 'color-application', name: 'Couleur Racines', durationMinutes: 45, requiresStaff: true },
      { id: 'color-processing', name: 'Temps de pose', durationMinutes: 20, requiresStaff: false },
    ],
  },
};

function build(input: {
  readonly appointmentId: string;
  readonly items: readonly BuildAppointmentItemInput[];
}) {
  return buildAppointment({
    appointmentId: input.appointmentId,
    businessId: 'fixture-business',
    clientId: 'legacy-client-1',
    itemIds: input.items.map((_, index) => `${input.appointmentId}-item-${index}`),
    items: input.items,
    staffMemberId: 'staff-amelie',
    startAt: new Date(2026, 7, 24, 9),
  });
}

describe('buildAppointment', () => {
  it('preserves selection order and creates historical snapshots', () => {
    const appointment = build({
      appointmentId: 'appointment-1',
      items: [{ service: services.cut }, { service: services.color }],
    });

    expect(appointment.status).toBe('SCHEDULED');
    expect(appointment.startAt).toEqual(new Date(2026, 7, 24, 9));
    expect(appointment.items.map((item) => item.serviceId)).toEqual([
      'service-cut',
      'technique-color',
    ]);
    expect(appointment.items.map((item) => item.order)).toEqual([0, 1]);
    expect(appointment.items[1].phases[1]).toEqual({
      id: 'color-processing',
      name: 'Temps de pose',
      durationMinutes: 20,
      requiresStaff: false,
    });
  });

  it('uses the complete domain timeline, including processing time', () => {
    const appointment = build({
      appointmentId: 'appointment-2',
      items: [{ service: services.cut }, { service: services.color }],
    });

    expect(getAppointmentEndAt(appointment)).toEqual(new Date(2026, 7, 24, 10, 35));
  });

  it('does not share phase objects with the catalog service', () => {
    const appointment = build({
      appointmentId: 'appointment-3',
      items: [{ service: services.color }],
    });

    expect(appointment.items[0].phases).not.toBe(services.color.phases);
    expect(appointment.items[0].phases[0]).not.toBe(services.color.phases[0]);
  });

  it('rejects an empty selection', () => {
    expect(() =>
      build({ appointmentId: 'appointment-empty', items: [] }),
    ).toThrow('at least one service');
  });

  it('records an appointment-specific price without modifying the catalog service', () => {
    const appointment = build({
      appointmentId: 'appointment-price',
      items: [{ service: services.color, price: 50 }],
    });

    expect(appointment.items[0].price).toBe(50);
    expect(services.color.price).toBe(30);
  });

  it('records a processing duration override without modifying the catalog service', () => {
    const appointment = build({
      appointmentId: 'appointment-processing',
      items: [
        {
          service: services.color,
          phaseDurationOverrides: { 'color-processing': 45 },
        },
      ],
    });

    expect(appointment.items[0].phases[1].durationMinutes).toBe(45);
    expect(services.color.phases[1].durationMinutes).toBe(20);
  });

  it('recalculates elapsed duration and end time from processing overrides', () => {
    const appointment = build({
      appointmentId: 'appointment-processing-timeline',
      items: [
        {
          service: services.color,
          phaseDurationOverrides: { 'color-processing': 45 },
        },
      ],
    });

    // 45 active + 45 processing = 90 minutes elapsed.
    expect(getAppointmentEndAt(appointment)).toEqual(new Date(2026, 7, 24, 10, 30));
    expect(appointment.items[0].phases.reduce((total, phase) => total + phase.durationMinutes, 0)).toBe(90);
  });

  it('allows a zero-minute processing override', () => {
    const appointment = build({
      appointmentId: 'appointment-zero-processing',
      items: [
        {
          service: services.color,
          phaseDurationOverrides: { 'color-processing': 0 },
        },
      ],
    });

    expect(appointment.items[0].phases[1].durationMinutes).toBe(0);
    expect(getAppointmentEndAt(appointment)).toEqual(new Date(2026, 7, 24, 9, 45));
  });

  it('rejects an invalid appointment-specific price', () => {
    expect(() =>
      build({
        appointmentId: 'appointment-bad-price',
        items: [{ service: services.color, price: Number.NaN }],
      }),
    ).toThrow('Invalid appointment-specific price');
  });

  it('rejects an invalid processing duration override', () => {
    expect(() =>
      build({
        appointmentId: 'appointment-bad-processing',
        items: [
          {
            service: services.color,
            phaseDurationOverrides: { 'color-processing': -5 },
          },
        ],
      }),
    ).toThrow('Invalid phase duration override');
  });
});
