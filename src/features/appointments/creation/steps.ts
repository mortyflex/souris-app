// Souris — Appointment creation steps
//
// Pure step-state rules for the three-step creation flow:
//   Cliente → Prestations → Résumé
//
// Forward jumps are never permitted: a step must be completed before the
// next one becomes reachable. Backward navigation through completed steps
// is always allowed and preserves the draft.

export type CreationStep = 0 | 1 | 2;

export const stepLabels = ['Cliente', 'Prestations', 'Résumé'] as const;

export type CreationStepState = 'completed' | 'current' | 'future';

/** Visual state of the stepper node at `index` relative to the current step. */
export function getStepState(current: CreationStep, index: number): CreationStepState {
  if (index < current) return 'completed';
  if (index === current) return 'current';
  return 'future';
}

/**
 * Whether the professional may navigate to `target` from `current`.
 * Only completed (already visited) steps are reachable; forward jumps
 * into incomplete steps are forbidden.
 */
export function canNavigateTo(current: CreationStep, target: number): boolean {
  return target >= 0 && target < current;
}

/** Human-readable label for the current progress, e.g. "Étape 2 sur 3". */
export function getStepProgressLabel(current: CreationStep): string {
  return `Étape ${current + 1} sur ${stepLabels.length}`;
}
