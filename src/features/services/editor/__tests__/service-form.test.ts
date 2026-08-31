import {
  createAppointmentItemSnapshot,
  getElapsedDurationMinutes,
  getProcessingDurationMinutes,
  getStaffActiveDurationMinutes,
  type Appointment,
} from '@/domain/appointments';

import {
  buildServiceFromForm,
  createEmptyServiceForm,
  parseServicePriceInput,
  reorderServicePhases,
  setPhaseRequiresStaff,
  toServiceFormValues,
  validateServiceForm,
  type ServiceFormValues,
} from '../service-form';

describe('Service form rules', () => {
  it.each([
    ['42', 42],
    ['42,5', 42.5],
    ['42,50', 42.5],
    ['0', 0],
  ])('parses the supported euro input %s', (input, expected) => {
    expect(parseServicePriceInput(input)).toBe(expected);
  });

  it.each(['', '-1', 'prix', 'NaN'])('rejects invalid euro input %s', (input) => {
    expect(parseServicePriceInput(input)).toBeUndefined();
  });

  it('creates a simple Coupe as one staff-required canonical phase', () => {
    const values: ServiceFormValues = {
      ...createEmptyServiceForm('SERVICE', 'service-cut-phase-1'),
      name: '  Coupe  ',
      price: '42,00',
      simpleDurationMinutes: '45',
    };

    const service = buildServiceFromForm({
      id: 'service-cut',
      businessId: 'business-1',
      active: true,
      values,
    });

    expect(service).toEqual({
      id: 'service-cut',
      businessId: 'business-1',
      name: 'Coupe',
      type: 'SERVICE',
      price: 42,
      phases: [
        {
          id: 'service-cut-phase-1',
          name: 'Coupe',
          durationMinutes: 45,
          requiresStaff: true,
        },
      ],
      active: true,
    });
  });

  it('creates an ordered technique and derives active, pose, and elapsed totals', () => {
    const values: ServiceFormValues = {
      name: 'Balayage',
      price: '95',
      type: 'TECHNIQUE',
      simpleDurationMinutes: '',
      phases: [
        { id: 'phase-a', name: 'Application', durationMinutes: '30', requiresStaff: true },
        { id: 'phase-pose', name: 'Pose', durationMinutes: '45', requiresStaff: false },
        { id: 'phase-b', name: 'Finition', durationMinutes: '30', requiresStaff: true },
      ],
    };
    const service = buildServiceFromForm({
      id: 'service-balayage',
      businessId: 'business-1',
      active: true,
      values,
    });
    const item = createAppointmentItemSnapshot({ id: 'item-1', order: 0, service });
    const appointment: Appointment = {
      id: 'appointment-1',
      businessId: 'business-1',
      clientId: 'client-1',
      staffMemberId: 'staff-1',
      startAt: new Date(2026, 7, 31, 9),
      status: 'SCHEDULED',
      items: [item],
    };

    expect(service.phases.map((phase) => phase.id)).toEqual([
      'phase-a',
      'phase-pose',
      'phase-b',
    ]);
    expect(service.phases.map((phase) => phase.requiresStaff)).toEqual([
      true,
      false,
      true,
    ]);
    expect(getStaffActiveDurationMinutes(appointment)).toBe(60);
    expect(getProcessingDurationMinutes(appointment)).toBe(45);
    expect(getElapsedDurationMinutes(appointment)).toBe(105);
  });

  it('accepts a technique with no processing phase', () => {
    const values: ServiceFormValues = {
      name: 'Technique active',
      price: '60',
      type: 'TECHNIQUE',
      simpleDurationMinutes: '',
      phases: [
        { id: 'phase-a', name: 'Étape A', durationMinutes: '20', requiresStaff: true },
        { id: 'phase-b', name: 'Étape B', durationMinutes: '25', requiresStaff: true },
      ],
    };

    expect(validateServiceForm(values).valid).toBe(true);
    expect(
      buildServiceFromForm({
        id: 'service-active-technique',
        businessId: 'business-1',
        active: true,
        values,
      }).phases.every((phase) => phase.requiresStaff),
    ).toBe(true);
  });

  it('reorders phases while preserving every identity and value', () => {
    const values: ServiceFormValues = {
      name: 'Technique',
      price: '50',
      type: 'TECHNIQUE',
      simpleDurationMinutes: '',
      phases: [
        { id: 'a', name: 'A', durationMinutes: '10', requiresStaff: true },
        { id: 'pose', name: 'Pose', durationMinutes: '20', requiresStaff: false },
        { id: 'b', name: 'B', durationMinutes: '30', requiresStaff: true },
      ],
    };

    const reordered = reorderServicePhases(values, 2, 1);

    expect(reordered.phases).toEqual([
      values.phases[0],
      values.phases[2],
      values.phases[1],
    ]);
    expect(values.phases.map((phase) => phase.id)).toEqual(['a', 'pose', 'b']);
  });

  it('hydrates an edit exactly and keeps Service identity stable after duration edits', () => {
    const original = buildServiceFromForm({
      id: 'service-cut',
      businessId: 'business-1',
      active: true,
      values: {
        ...createEmptyServiceForm('SERVICE', 'phase-cut'),
        name: 'Coupe',
        price: '42',
        simpleDurationMinutes: '45',
      },
    });
    const hydrated = toServiceFormValues(original);
    const updated = buildServiceFromForm({
      id: original.id,
      businessId: original.businessId,
      active: original.active,
      values: { ...hydrated, simpleDurationMinutes: '50' },
    });

    expect(hydrated.phases[0].id).toBe('phase-cut');
    expect(updated.id).toBe(original.id);
    expect(updated.businessId).toBe(original.businessId);
    expect(updated.phases[0]).toEqual({
      id: 'phase-cut',
      name: 'Coupe',
      durationMinutes: 50,
      requiresStaff: true,
    });
    expect(original.phases[0].durationMinutes).toBe(45);
  });
});

describe('processing phase model', () => {
  it('uses the canonical Temps de pose name without a custom name', () => {
    const values: ServiceFormValues = {
      name: 'Balayage',
      price: '95',
      type: 'TECHNIQUE',
      simpleDurationMinutes: '',
      phases: [
        { id: 'active', name: 'Application', durationMinutes: '30', requiresStaff: true },
        { id: 'pose', name: '', durationMinutes: '45', requiresStaff: false },
      ],
    };

    expect(validateServiceForm(values).valid).toBe(true);

    const service = buildServiceFromForm({
      id: 'service-balayage',
      businessId: 'business-1',
      active: true,
      values,
    });
    const item = createAppointmentItemSnapshot({ id: 'item-1', order: 0, service });

    expect(service.phases[1]).toEqual({
      id: 'pose',
      name: 'Temps de pose',
      durationMinutes: 45,
      requiresStaff: false,
    });
    expect(item.phases[1].name).toBe('Temps de pose');
    expect(item.phases[1].requiresStaff).toBe(false);
  });

  it('keeps the draft active name in form state across a processing round-trip', () => {
    const values: ServiceFormValues = {
      name: 'Technique',
      price: '60',
      type: 'TECHNIQUE',
      simpleDurationMinutes: '',
      phases: [
        { id: 'p1', name: 'Rinçage', durationMinutes: '10', requiresStaff: true },
      ],
    };

    const processing = setPhaseRequiresStaff(values, 'p1', false);
    expect(processing.phases[0].name).toBe('Temps de pose');
    expect(processing.phases[0].previousActiveName).toBe('Rinçage');

    const activeAgain = setPhaseRequiresStaff(processing, 'p1', true);
    expect(activeAgain.phases[0].name).toBe('Rinçage');
    expect(activeAgain.phases[0].previousActiveName).toBeUndefined();
  });

  it('never silently saves an active phase as Temps de pose', () => {
    const values: ServiceFormValues = {
      name: 'Technique',
      price: '60',
      type: 'TECHNIQUE',
      simpleDurationMinutes: '',
      phases: [{ id: 'p1', name: '', durationMinutes: '20', requiresStaff: true }],
    };

    // Unnamed active → processing → active again: the name is empty and
    // the form stays invalid until the professional enters one.
    const processing = setPhaseRequiresStaff(values, 'p1', false);
    const activeAgain = setPhaseRequiresStaff(processing, 'p1', true);

    expect(activeAgain.phases[0].name).toBe('');
    expect(validateServiceForm(activeAgain).phaseValidities[0].nameValid).toBe(
      false,
    );
    expect(validateServiceForm(activeAgain).valid).toBe(false);
  });

  it('keeps switching semantics stable when the same phase toggles repeatedly', () => {
    const values: ServiceFormValues = {
      name: 'Technique',
      price: '60',
      type: 'TECHNIQUE',
      simpleDurationMinutes: '',
      phases: [
        { id: 'p1', name: 'Application', durationMinutes: '20', requiresStaff: true },
      ],
    };

    const processing = setPhaseRequiresStaff(values, 'p1', false);
    const active = setPhaseRequiresStaff(processing, 'p1', true);
    const processingAgain = setPhaseRequiresStaff(active, 'p1', false);

    expect(processingAgain.phases[0].name).toBe('Temps de pose');
    expect(processingAgain.phases[0].previousActiveName).toBe('Application');
  });
});
