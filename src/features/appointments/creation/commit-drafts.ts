// Souris — Appointment Creation catalog commit
//
// During NEW Appointment Creation, adjusted prices and phase durations become
// the future catalog defaults — but ONLY when creation succeeds. This module
// computes the canonical Service updates from the final draft; the caller
// applies them atomically with Appointment creation.

import type { Service } from '@/domain/appointments';

import type { SelectedServiceDraft } from '../editor/draft';

/**
 * Returns the canonical Services whose price or phase durations differ from
 * the current catalog values, rebuilt from the final draft values.
 *
 * - stable Service ids, businessId, name, type, active are preserved;
 * - phase ids and order are preserved; only durations change;
 * - Services no longer present in the catalog are skipped (the snapshot
 *   still uses the draft);
 * - drafts with no changes are skipped;
 * - the catalog is never mutated here.
 */
export function collectCatalogServiceUpdates(
  drafts: readonly SelectedServiceDraft[],
  getServiceById: (serviceId: string | undefined) => Service | undefined,
): readonly Service[] {
  const updates: Service[] = [];

  for (const draft of drafts) {
    const current = getServiceById(draft.serviceId);
    if (!current) continue;

    const draftDurationById = new Map(
      draft.phases.map((phase) => [phase.id, phase.durationMinutes]),
    );

    let phasesChanged = false;
    const phases = current.phases.map((phase) => {
      const draftDuration = draftDurationById.get(phase.id);
      if (draftDuration === undefined || draftDuration === phase.durationMinutes) {
        return phase;
      }
      phasesChanged = true;
      return { ...phase, durationMinutes: draftDuration };
    });

    if (current.price === draft.price && !phasesChanged) continue;

    updates.push({
      ...current,
      price: draft.price,
      phases,
    });
  }

  return updates;
}
