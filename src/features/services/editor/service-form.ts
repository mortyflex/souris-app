import type { Service, ServicePhase, ServiceType } from '@/domain/appointments';

export interface ServicePhaseFormValues {
  readonly id: string;
  readonly name: string;
  readonly durationMinutes: string;
  readonly requiresStaff: boolean;
  /**
   * Form-session only: the last user-entered active name, kept when the
   * phase switches to processing so switching back can restore it.
   * Never part of the canonical Service model.
   */
  readonly previousActiveName?: string;
}

/** Canonical user-facing identity of a processing phase. */
export const PROCESSING_PHASE_NAME = 'Temps de pose';

export interface ServiceFormValues {
  readonly name: string;
  readonly price: string;
  readonly type: ServiceType;
  readonly simpleDurationMinutes: string;
  readonly phases: readonly ServicePhaseFormValues[];
}

export interface ServiceFormValidation {
  readonly nameValid: boolean;
  readonly priceValid: boolean;
  readonly simpleDurationValid: boolean;
  readonly phaseValidities: readonly {
    readonly nameValid: boolean;
    readonly durationValid: boolean;
  }[];
  readonly phasesValid: boolean;
  readonly valid: boolean;
}

export function createEmptyServiceForm(
  type: ServiceType,
  firstPhaseId: string,
): ServiceFormValues {
  return {
    name: '',
    price: '',
    type,
    simpleDurationMinutes: '',
    phases: [
      {
        id: firstPhaseId,
        name: '',
        durationMinutes: '',
        requiresStaff: true,
      },
    ],
  };
}

export function toServiceFormValues(service: Service): ServiceFormValues {
  return {
    name: service.name,
    price: formatServicePriceInput(service.price),
    type: service.type,
    simpleDurationMinutes:
      service.type === 'SERVICE' && service.phases[0]
        ? String(service.phases[0].durationMinutes)
        : '',
    phases: service.phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      durationMinutes: String(phase.durationMinutes),
      requiresStaff: phase.requiresStaff,
    })),
  };
}

export function parseServicePriceInput(text: string): number | undefined {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized.length === 0) return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function formatServicePriceInput(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}

export function parsePositiveDurationInput(text: string): number | undefined {
  const value = Number(text.trim());
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function validateServiceForm(values: ServiceFormValues): ServiceFormValidation {
  const nameValid = values.name.trim().length > 0;
  const priceValid = parseServicePriceInput(values.price) !== undefined;
  const simpleDurationValid =
    values.type !== 'SERVICE' ||
    parsePositiveDurationInput(values.simpleDurationMinutes) !== undefined;
  const phaseValidities = values.phases.map((phase) => ({
    // Processing phases carry the canonical "Temps de pose" name and need
    // no user-entered name; only active phases require a real name.
    nameValid: phase.requiresStaff ? phase.name.trim().length > 0 : true,
    durationValid: parsePositiveDurationInput(phase.durationMinutes) !== undefined,
  }));
  const phasesValid =
    values.type !== 'TECHNIQUE' ||
    (values.phases.length > 0 &&
      phaseValidities.every((phase) => phase.nameValid && phase.durationValid));

  return {
    nameValid,
    priceValid,
    simpleDurationValid,
    phaseValidities,
    phasesValid,
    valid: nameValid && priceValid && simpleDurationValid && phasesValid,
  };
}

export interface BuildServiceFromFormInput {
  readonly id: string;
  readonly businessId: string;
  readonly active: boolean;
  readonly values: ServiceFormValues;
}

export function buildServiceFromForm(input: BuildServiceFromFormInput): Service {
  const validation = validateServiceForm(input.values);
  if (!validation.valid) {
    throw new Error('Invalid service form');
  }

  const name = input.values.name.trim();
  const price = parseServicePriceInput(input.values.price);
  if (price === undefined) {
    throw new Error('Invalid service price');
  }

  const phases: readonly ServicePhase[] =
    input.values.type === 'SERVICE'
      ? [
          {
            id: input.values.phases[0].id,
            name,
            durationMinutes: parsePositiveDurationInput(
              input.values.simpleDurationMinutes,
            ) as number,
            requiresStaff: true,
          },
        ]
      : input.values.phases.map((phase) => ({
          id: phase.id,
          name: phase.requiresStaff ? phase.name.trim() : PROCESSING_PHASE_NAME,
          durationMinutes: parsePositiveDurationInput(phase.durationMinutes) as number,
          requiresStaff: phase.requiresStaff,
        }));

  return {
    id: input.id,
    businessId: input.businessId,
    name,
    type: input.values.type,
    price,
    phases,
    active: input.active,
  };
}

export function addServicePhase(
  values: ServiceFormValues,
  phaseId: string,
): ServiceFormValues {
  return {
    ...values,
    phases: [
      ...values.phases,
      { id: phaseId, name: '', durationMinutes: '', requiresStaff: true },
    ],
  };
}

export function updateServicePhase(
  values: ServiceFormValues,
  phaseId: string,
  update: Partial<Omit<ServicePhaseFormValues, 'id'>>,
): ServiceFormValues {
  return {
    ...values,
    phases: values.phases.map((phase) =>
      phase.id === phaseId ? { ...phase, ...update } : phase,
    ),
  };
}

/**
 * Switches a phase between active and processing.
 *
 * active → processing: the canonical name becomes "Temps de pose"; the
 * previous user-entered name is kept in form-session state only so switching
 * back can restore it.
 *
 * processing → active: the draft name is restored when available, otherwise
 * the phase starts unnamed and requires a valid name before save. An active
 * phase can never silently save as "Temps de pose".
 */
export function setPhaseRequiresStaff(
  values: ServiceFormValues,
  phaseId: string,
  requiresStaff: boolean,
): ServiceFormValues {
  return {
    ...values,
    phases: values.phases.map((phase) => {
      if (phase.id !== phaseId || phase.requiresStaff === requiresStaff) {
        return phase;
      }
      if (requiresStaff) {
        return {
          ...phase,
          requiresStaff: true,
          name: phase.previousActiveName ?? '',
          previousActiveName: undefined,
        };
      }
      return {
        ...phase,
        requiresStaff: false,
        name: PROCESSING_PHASE_NAME,
        previousActiveName:
          phase.name.trim().length > 0 ? phase.name : phase.previousActiveName,
      };
    }),
  };
}

export function removeServicePhase(
  values: ServiceFormValues,
  phaseId: string,
): ServiceFormValues {
  return {
    ...values,
    phases: values.phases.filter((phase) => phase.id !== phaseId),
  };
}

export function reorderServicePhases(
  values: ServiceFormValues,
  fromIndex: number,
  toIndex: number,
): ServiceFormValues {
  if (
    fromIndex < 0 ||
    fromIndex >= values.phases.length ||
    toIndex < 0 ||
    toIndex >= values.phases.length
  ) {
    throw new RangeError('Service phase reorder indices are out of range');
  }

  const phases = [...values.phases];
  const [moved] = phases.splice(fromIndex, 1);
  phases.splice(toIndex, 0, moved);
  return { ...values, phases };
}

export function areServiceFormsEqual(
  left: ServiceFormValues,
  right: ServiceFormValues,
): boolean {
  return (
    left.name === right.name &&
    left.price === right.price &&
    left.type === right.type &&
    left.simpleDurationMinutes === right.simpleDurationMinutes &&
    left.phases.length === right.phases.length &&
    left.phases.every((phase, index) => {
      const other = right.phases[index];
      return (
        other !== undefined &&
        phase.id === other.id &&
        phase.name === other.name &&
        phase.durationMinutes === other.durationMinutes &&
        phase.requiresStaff === other.requiresStaff &&
        phase.previousActiveName === other.previousActiveName
      );
    })
  );
}
