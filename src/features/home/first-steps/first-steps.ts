// BeautIzzy — « Premiers pas avec BeautIzzy »: which first steps are done — pure
//
// Every state is DERIVED from what the professional's own data shows, never
// stored and never assumed:
//
//   services     done once at least one active prestation exists and none of
//                them still waits for its price (the starter prestations are
//                written at 0 €, « à renseigner »)
//   clients      done once the address book holds at least one client
//                (imported or added by hand)
//   appointment  done once at least one appointment exists
//   products     OPTIONAL — done once a product exists; never required, since
//                not every beauty professional sells retail products
//
// The guidance is complete when every REQUIRED step is done.

import type { Service } from '@/domain/appointments';

export type FirstStepKey = 'services' | 'clients' | 'appointment' | 'products';

export interface FirstStepsEvidence {
  readonly activeServices: readonly Pick<Service, 'price'>[];
  readonly clientCount: number;
  readonly appointmentCount: number;
  readonly productCount: number;
}

export interface FirstStep {
  readonly key: FirstStepKey;
  readonly title: string;
  readonly description: string;
  readonly done: boolean;
  /** Never needed to complete the guidance (products). */
  readonly optional: boolean;
}

function describeServices(activeServices: FirstStepsEvidence['activeServices']): string {
  if (activeServices.length === 0) return 'Ajoutez vos prestations et leurs tarifs';
  const unpriced = activeServices.filter((service) => service.price <= 0).length;
  if (unpriced === 0) return 'Vos tarifs sont renseignés';
  return `${unpriced} tarif${unpriced > 1 ? 's' : ''} à renseigner`;
}

export function getFirstSteps(evidence: FirstStepsEvidence): readonly FirstStep[] {
  const { activeServices } = evidence;
  return [
    {
      key: 'services',
      title: 'Compléter vos prestations et tarifs',
      description: describeServices(activeServices),
      done: activeServices.length > 0 && activeServices.every((service) => service.price > 0),
      optional: false,
    },
    {
      key: 'clients',
      title: 'Importer votre clientèle',
      description: 'Depuis un fichier CSV ou une liste copiée',
      done: evidence.clientCount > 0,
      optional: false,
    },
    {
      key: 'appointment',
      title: 'Créer votre premier rendez-vous',
      description: 'Votre agenda prend vie',
      done: evidence.appointmentCount > 0,
      optional: false,
    },
    {
      key: 'products',
      title: 'Ajouter vos produits',
      description: 'Si vous vendez des produits : stock et ventes',
      done: evidence.productCount > 0,
      optional: true,
    },
  ];
}

export function areFirstStepsComplete(steps: readonly FirstStep[]): boolean {
  return steps.every((step) => step.optional || step.done);
}

/** « 1 sur 3 » — counts the required steps only. */
export function formatFirstStepsProgress(steps: readonly FirstStep[]): string {
  const required = steps.filter((step) => !step.optional);
  const done = required.filter((step) => step.done).length;
  return `${done} sur ${required.length}`;
}

/**
 * The steps done now that were not done before — the only ones a screen may
 * celebrate. `previous` is what the screen last acknowledged: the data it
 * mounted with (hydration is never a completion), then each state it showed.
 */
export function getNewlyCompletedSteps(
  previous: ReadonlySet<FirstStepKey>,
  steps: readonly FirstStep[],
): readonly FirstStep[] {
  return steps.filter((step) => step.done && !previous.has(step.key));
}

export function getDoneStepKeys(steps: readonly FirstStep[]): ReadonlySet<FirstStepKey> {
  return new Set(steps.filter((step) => step.done).map((step) => step.key));
}

export const FIRST_STEPS_READY_MESSAGE = 'Votre espace est prêt à vous accompagner !';

/** ONE spoken sentence for a batch of genuine completions. */
export function formatFirstStepsAnnouncement(
  completed: readonly FirstStep[],
  steps: readonly FirstStep[],
): string {
  if (areFirstStepsComplete(steps)) return `Premiers pas terminés. ${FIRST_STEPS_READY_MESSAGE}`;
  const titles = completed.map((step) => step.title).join(', ');
  const counted = completed.some((step) => !step.optional);
  return counted ? `${titles} : fait. ${formatFirstStepsProgress(steps)}.` : `${titles} : fait.`;
}

