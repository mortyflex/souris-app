// BeautIzzy - Shared appointment service editor drafts
//
// Creation drafts start from catalog Services. Edit drafts start from
// AppointmentItem snapshots. Both use the same immutable editing operations.

import type {
  Appointment,
  AppointmentItemEditDraft,
  AppointmentPhase,
  Service,
  ServicePhase,
  ServiceSnapshotSource,
} from '@/domain/appointments';
import { hydrateAppointmentDrafts as hydrateAppointmentItemDrafts } from '@/domain/appointments';
import {
  formatServicePriceInput,
  parseServicePriceInput,
} from '@/features/services/editor/service-form';

export type EditablePhase = ServicePhase | AppointmentPhase;

export interface SelectedServiceDraft {
  /** Existing AppointmentItem identity; absent until the creation boundary assigns it. */
  readonly appointmentItemId?: string;
  /**
   * Creation-only UI identity of ONE occurrence, so the same Service selected
   * twice (« Coupe ×2 ») gives two distinct drafts. Never persisted: the
   * creation boundary assigns the real AppointmentItem ids.
   */
  readonly localKey?: string;
  readonly serviceId: string;
  readonly serviceOptionId?: string;
  readonly order: number;
  readonly serviceName: string;
  readonly serviceType: Service['type'];
  readonly price: number;
  /** Owned phase snapshots used by both creation and existing appointment editing. */
  readonly phases: readonly EditablePhase[];
  /** Snapshot-level duration overrides keyed by phase id (never written to the catalog). */
  readonly phaseDurationOverrides: Readonly<Record<string, number>>;
}

export function createSelectedServiceDraft(
  service: Service,
  localKey?: string,
): SelectedServiceDraft {
  return {
    ...(localKey !== undefined ? { localKey } : {}),
    serviceId: service.id,
    order: 0,
    serviceName: service.name,
    serviceType: service.type,
    price: service.price,
    phases: service.phases.map((phase) => ({ ...phase })),
    phaseDurationOverrides: {},
  };
}

/** Returns the owned booking-time values, never a live catalog reference. */
export function toServiceSnapshotSource(
  draft: SelectedServiceDraft,
): ServiceSnapshotSource {
  return {
    id: draft.serviceId,
    name: draft.serviceName,
    type: draft.serviceType,
    price: draft.price,
    phases: draft.phases.map((phase) => ({ ...phase })),
  };
}

/** Returns the stable UI identity for a selected draft. */
export function getSelectedServiceDraftKey(draft: SelectedServiceDraft): string {
  return draft.appointmentItemId ?? draft.localKey ?? draft.serviceId;
}

/**
 * How many times each Service occurs in the selection — the quantity a
 * catalogue card shows. Every occurrence stays its own AppointmentItem.
 */
export function countServiceOccurrences(
  drafts: readonly Pick<SelectedServiceDraft, 'serviceId'>[],
  serviceId: string,
): number {
  return drafts.filter((draft) => draft.serviceId === serviceId).length;
}

/**
 * Removes ONE occurrence of a Service — the last one in the selection order,
 * so the earlier occurrences (and their edited prices or durations) stay
 * untouched. Unchanged when the Service is not selected.
 */
export function removeLastServiceOccurrence<Draft extends Pick<SelectedServiceDraft, 'serviceId'>>(
  drafts: readonly Draft[],
  serviceId: string,
): readonly Draft[] {
  const index = drafts.map((draft) => draft.serviceId).lastIndexOf(serviceId);
  if (index === -1) return drafts;
  return [...drafts.slice(0, index), ...drafts.slice(index + 1)];
}

/** Hydrates edit drafts from Appointment snapshots, never from the catalog. */
export function hydrateAppointmentDrafts(
  appointment: Appointment,
): readonly SelectedServiceDraft[] {
  return hydrateAppointmentItemDrafts(appointment).map((item) => ({
    appointmentItemId: item.id,
    serviceId: item.serviceId,
    serviceOptionId: item.serviceOptionId,
    order: item.order,
    serviceName: item.serviceName,
    serviceType: item.serviceType,
    price: item.price,
    phases: item.phases.map((phase) => ({ ...phase })),
    phaseDurationOverrides: Object.fromEntries(
      item.phases
        .filter((phase) => !phase.requiresStaff)
        .map((phase) => [phase.id, phase.durationMinutes]),
    ),
  }));
}

export function updateDraftPrice(
  draft: SelectedServiceDraft,
  price: number,
): SelectedServiceDraft {
  if (!isValidPrice(price)) return draft;
  return { ...draft, price };
}

export function updateDraftPhaseDuration(
  draft: SelectedServiceDraft,
  phaseId: string,
  durationMinutes: number,
): SelectedServiceDraft {
  if (!isValidPhaseDuration(durationMinutes)) return draft;

  return {
    ...draft,
    phases: draft.phases.map((phase) =>
      phase.id === phaseId ? { ...phase, durationMinutes } : phase,
    ),
    phaseDurationOverrides: {
      ...draft.phaseDurationOverrides,
      [phaseId]: durationMinutes,
    },
  };
}

export function getProcessingPhases(
  value: Pick<Service, 'phases'> | Pick<SelectedServiceDraft, 'phases'>,
): readonly EditablePhase[] {
  return value.phases.filter((phase) => !phase.requiresStaff);
}

export function getDraftDurationMinutes(draft: SelectedServiceDraft): number {
  return draft.phases.reduce((total, phase) => total + phase.durationMinutes, 0);
}

export function getDraftProcessingMinutes(draft: SelectedServiceDraft): number {
  return getProcessingPhases(draft).reduce(
    (total, phase) => total + phase.durationMinutes,
    0,
  );
}

export function isValidPrice(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function isValidPhaseDuration(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 0;
}

export function parsePriceInput(text: string): number | undefined {
  return parseServicePriceInput(text);
}

export function formatPriceInput(value: number): string {
  return formatServicePriceInput(value);
}

export function reorderDrafts(
  drafts: readonly SelectedServiceDraft[],
  fromIndex: number,
  toIndex: number,
): readonly SelectedServiceDraft[] {
  if (
    fromIndex < 0 ||
    fromIndex >= drafts.length ||
    toIndex < 0 ||
    toIndex >= drafts.length
  ) {
    throw new RangeError(
      `reorderDrafts: indices ${fromIndex} → ${toIndex} are out of range for ${drafts.length} drafts`,
    );
  }

  const reordered = [...drafts];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return reordered;
}

/** Compares meaningful snapshot state, including order and nested phases. */
export function areDraftsEqual(
  left: readonly SelectedServiceDraft[],
  right: readonly SelectedServiceDraft[],
): boolean {
  if (left.length !== right.length) return false;

  return left.every((draft, index) => {
    const other = right[index];
    if (!other) return false;
    if (
      draft.appointmentItemId !== other.appointmentItemId ||
      draft.serviceId !== other.serviceId ||
      draft.serviceOptionId !== other.serviceOptionId ||
      draft.order !== other.order ||
      draft.serviceName !== other.serviceName ||
      draft.serviceType !== other.serviceType ||
      draft.price !== other.price ||
      draft.phases.length !== other.phases.length
    ) {
      return false;
    }

    return draft.phases.every((phase, phaseIndex) => {
      const otherPhase = other.phases[phaseIndex];
      return (
        otherPhase !== undefined &&
        phase.id === otherPhase.id &&
        phase.name === otherPhase.name &&
        phase.durationMinutes === otherPhase.durationMinutes &&
        phase.requiresStaff === otherPhase.requiresStaff
      );
    });
  });
}

/** Converts a UI draft into the framework-independent domain update input. */
export function toAppointmentItemEditDraft(
  draft: SelectedServiceDraft,
  order: number,
): AppointmentItemEditDraft {
  if (!draft.appointmentItemId) {
    throw new Error(`Missing AppointmentItem id for service "${draft.serviceName}"`);
  }

  return {
    id: draft.appointmentItemId,
    serviceId: draft.serviceId,
    serviceOptionId: draft.serviceOptionId,
    order,
    serviceName: draft.serviceName,
    serviceType: draft.serviceType,
    price: draft.price,
    phases: draft.phases.map((phase) => ({ ...phase })),
  };
}
