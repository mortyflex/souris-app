import type { Service, ServicePhase, ServiceType } from '@/domain/appointments';
import { isValidServiceDescription, normalizeServiceDescription } from '@/domain/services';

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

/**
 * Canonical user-facing identity of a processing phase — the default the
 * editor gives a new unattended phase in the Services / Techniques
 * experience. The unified catalogue gives « Temps d’attente » instead
 * (`getWaitingPhaseName`, catalogue-presentation.ts); callers pass it.
 */
export const PROCESSING_PHASE_NAME = 'Temps de pose';

export interface ServiceFormValues {
  readonly name: string;
  readonly price: string;
  readonly type: ServiceType;
  readonly simpleDurationMinutes: string;
  readonly phases: readonly ServicePhaseFormValues[];
  /** The chosen category id; undefined = « Aucune catégorie ». */
  readonly categoryId?: string;
  /** Free multiline text, as typed (absent = empty); normalised — trimmed, blank = none — when saved. */
  readonly description?: string;
}

export interface ServiceFormValidation {
  readonly nameValid: boolean;
  readonly descriptionValid: boolean;
  readonly priceValid: boolean;
  readonly simpleDurationValid: boolean;
  readonly phaseValidities: readonly {
    readonly nameValid: boolean;
    readonly durationValid: boolean;
  }[];
  /** TECHNIQUE only: at least one processing phase exists. */
  readonly hasProcessingPhase: boolean;
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
    description: '',
  };
}

/**
 * Creation only (the type never changes once saved — SERVICES.md §7): turns
 * the draft into the other structure, keeping name, price, category and
 * description. To phases: the single duration becomes a first active phase,
 * followed by a waiting phase (`processingPhaseName`, « Temps de pose » by
 * default) the professional sizes — a phased prestation needs one (§3). Back to one duration: the first active phase's
 * duration is kept when no single duration was typed.
 */
export function switchServiceFormType(
  values: ServiceFormValues,
  type: ServiceType,
  processingPhaseId: string,
  processingPhaseName: string = PROCESSING_PHASE_NAME,
): ServiceFormValues {
  if (values.type === type) return values;
  const first = values.phases[0];
  if (!first) return values;
  if (type === 'TECHNIQUE') {
    return {
      ...values,
      type,
      phases: [
        { id: first.id, name: '', durationMinutes: values.simpleDurationMinutes, requiresStaff: true },
        { id: processingPhaseId, name: processingPhaseName, durationMinutes: '', requiresStaff: false },
      ],
    };
  }
  const firstActive = values.phases.find((phase) => phase.requiresStaff);
  return {
    ...values,
    type,
    simpleDurationMinutes: values.simpleDurationMinutes || (firstActive?.durationMinutes ?? ''),
    phases: [{ id: first.id, name: '', durationMinutes: '', requiresStaff: true }],
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
    ...(service.categoryId !== undefined && { categoryId: service.categoryId }),
    ...(service.description !== undefined && { description: service.description }),
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
  const descriptionValid = isValidServiceDescription(values.description);
  const priceValid = parseServicePriceInput(values.price) !== undefined;
  const simpleDurationValid =
    values.type !== 'SERVICE' ||
    parsePositiveDurationInput(values.simpleDurationMinutes) !== undefined;
  const phaseValidities = values.phases.map((phase) => ({
    // Processing phases carry the app's own name (« Temps de pose », « Temps
    // d’attente ») and need no user-entered name; only active phases require one.
    nameValid: phase.requiresStaff ? phase.name.trim().length > 0 : true,
    durationValid: parsePositiveDurationInput(phase.durationMinutes) !== undefined,
  }));
  const hasProcessingPhase = values.phases.some((phase) => !phase.requiresStaff);
  const phasesValid =
    values.type !== 'TECHNIQUE' ||
    (values.phases.length > 0 &&
      hasProcessingPhase &&
      phaseValidities.every((phase) => phase.nameValid && phase.durationValid));

  return {
    nameValid,
    descriptionValid,
    priceValid,
    simpleDurationValid,
    phaseValidities,
    hasProcessingPhase,
    phasesValid,
    valid: nameValid && descriptionValid && priceValid && simpleDurationValid && phasesValid,
  };
}

export interface BuildServiceFromFormInput {
  readonly id: string;
  readonly businessId: string;
  readonly active: boolean;
  readonly values: ServiceFormValues;
  /** The name of an unattended phase that has none yet; « Temps de pose » by default. */
  readonly processingPhaseName?: string;
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
          // An unattended phase keeps the name it already has (its stored
          // name, or the one given when it became unattended): a stored name is
          // never rewritten by a save.
          name: phase.requiresStaff
            ? phase.name.trim()
            : phase.name.trim() || (input.processingPhaseName ?? PROCESSING_PHASE_NAME),
          durationMinutes: parsePositiveDurationInput(phase.durationMinutes) as number,
          requiresStaff: phase.requiresStaff,
        }));

  const description = normalizeServiceDescription(input.values.description);
  return {
    id: input.id,
    businessId: input.businessId,
    name,
    type: input.values.type,
    price,
    phases,
    active: input.active,
    ...(input.values.categoryId !== undefined && { categoryId: input.values.categoryId }),
    ...(description !== undefined && { description }),
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
 * active → processing: the name becomes `processingPhaseName` (« Temps de
 * pose » by default, « Temps d’attente » in the unified catalogue); the
 * previous user-entered name is kept in form-session state only so switching
 * back can restore it.
 *
 * processing → active: the draft name is restored when available, otherwise
 * the phase starts unnamed and requires a valid name before save. An active
 * phase can never silently save under the waiting-phase name.
 */
export function setPhaseRequiresStaff(
  values: ServiceFormValues,
  phaseId: string,
  requiresStaff: boolean,
  processingPhaseName: string = PROCESSING_PHASE_NAME,
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
        name: processingPhaseName,
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
    left.categoryId === right.categoryId &&
    (left.description ?? '') === (right.description ?? '') &&
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
