import {
  getAppointmentCreationSummary,
  getServiceProcessingMinutes,
} from '../presentation';

const services = {
  cut: {
    id: 'service-cut',
    businessId: 'fixture-business',
    name: 'Coupe',
    type: 'SERVICE' as const,
    price: 25,
    active: true,
    phases: [{ id: 'cut', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
  },
  color: {
    id: 'technique-color',
    businessId: 'fixture-business',
    name: 'Couleur Racines',
    type: 'TECHNIQUE' as const,
    price: 30,
    active: true,
    phases: [
      { id: 'application', name: 'Application', durationMinutes: 45, requiresStaff: true },
      { id: 'processing', name: 'Temps de pose', durationMinutes: 20, requiresStaff: false },
    ],
  },
};

describe('getAppointmentCreationSummary', () => {
  it('derives elapsed, active, processing, end time, and price from the domain', () => {
    const summary = getAppointmentCreationSummary(new Date(2026, 7, 24, 9), [
      { service: services.cut },
      { service: services.color },
    ]);

    expect(summary.elapsedMinutes).toBe(95);
    expect(summary.activeMinutes).toBe(75);
    expect(summary.processingMinutes).toBe(20);
    expect(summary.endAt).toEqual(new Date(2026, 7, 24, 10, 35));
    expect(summary.totalPrice).toBe(55);
  });

  it('reflects an edited price in the total without changing catalog defaults', () => {
    const summary = getAppointmentCreationSummary(new Date(2026, 7, 24, 9), [
      { service: services.color, price: 50 },
    ]);

    expect(summary.totalPrice).toBe(50);
    expect(services.color.price).toBe(30);
  });

  it('reflects an edited processing duration in elapsed, active, processing and end time', () => {
    const summary = getAppointmentCreationSummary(new Date(2026, 7, 24, 9), [
      {
        service: services.color,
        phaseDurationOverrides: { processing: 45 },
      },
    ]);

    // 45 active + 45 processing.
    expect(summary.elapsedMinutes).toBe(90);
    expect(summary.activeMinutes).toBe(45);
    expect(summary.processingMinutes).toBe(45);
    expect(summary.endAt).toEqual(new Date(2026, 7, 24, 10, 30));
    expect(services.color.phases[1].durationMinutes).toBe(20);
  });

  it('keeps processing at zero for SERVICE items regardless of overrides', () => {
    const summary = getAppointmentCreationSummary(new Date(2026, 7, 24, 9), [
      { service: services.cut },
    ]);

    expect(summary.processingMinutes).toBe(0);
    expect(summary.activeMinutes).toBe(30);
  });
});

describe('getServiceProcessingMinutes', () => {
  it('derives processing from requiresStaff, never from names', () => {
    expect(getServiceProcessingMinutes(services.cut)).toBe(0);
    expect(getServiceProcessingMinutes(services.color)).toBe(20);
  });
});
