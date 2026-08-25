// Souris — Appointment creation draft
//
// Feature-local representation of the services selected during Appointment
// Creation. The draft never mutates the canonical catalog Service: it only
// carries the appointment-specific values that will later be applied to the
// AppointmentItem snapshot.

import type { Service, ServicePhase } from '@/domain/appointments';

export interface SelectedServiceDraft {
  readonly serviceId: string;
  /**
   * Appointment-specific price. Initialized from the catalog service price
   * and editable during creation without touching the catalog.
   */
  readonly price: number;
  /**
   * Appointment-specific phase durations keyed by catalog phase id.
   * Only phases present in the catalog service can be overridden.
   */
  readonly phaseDurationOverrides: Readonly<Record<string, number>>;
}

/** Creates a draft initialized with the catalog service defaults. */
export function createSelectedServiceDraft(service: Service): SelectedServiceDraft {
  return {
    serviceId: service.id,
    price: service.price,
    phaseDurationOverrides: {},
  };
}

/** Returns a new draft with the appointment-specific price replaced. */
export function updateDraftPrice(
  draft: SelectedServiceDraft,
  price: number,
): SelectedServiceDraft {
  if (!isValidPrice(price)) {
    return draft;
  }
  return { ...draft, price };
}

/** Returns a new draft with one phase duration override replaced. */
export function updateDraftPhaseDuration(
  draft: SelectedServiceDraft,
  phaseId: string,
  durationMinutes: number,
): SelectedServiceDraft {
  if (!isValidPhaseDuration(durationMinutes)) {
    return draft;
  }
  return {
    ...draft,
    phaseDurationOverrides: {
      ...draft.phaseDurationOverrides,
      [phaseId]: durationMinutes,
    },
  };
}

/** Phases during which the professional is not required (processing time). */
export function getProcessingPhases(service: Service): readonly ServicePhase[] {
  return service.phases.filter((phase) => !phase.requiresStaff);
}

/** A price is valid when it is a finite non-negative number. */
export function isValidPrice(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** A phase duration is valid when it is a non-negative integer. */
export function isValidPhaseDuration(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 0;
}

/**
 * Parses free text typed in the price field.
 * Accepts both "," and "." as decimal separators.
 * Returns undefined for empty or invalid input so the caller can surface
 * an explicit error instead of silently producing NaN.
 */
export function parsePriceInput(text: string): number | undefined {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized.length === 0) {
    return undefined;
  }
  const value = Number(normalized);
  return isValidPrice(value) ? value : undefined;
}

/**
 * Formats a numeric price for the editable price field.
 * French locale without the currency symbol: 45 → "45,00".
 */
export function formatPriceInput(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}

/**
 * Steps a phase duration by `delta` minutes, never below zero.
 * Keeps integer minutes.
 */
export function stepPhaseDuration(current: number, delta: number): number {
  return Math.max(0, current + delta);
}
