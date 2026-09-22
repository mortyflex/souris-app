// Souris — Appointment deposit wording (« Acomptes »)
//
// French labels only: every amount comes from the domain deposit helpers.
// A VOIDED deposit always says so in words (« Annulé »), never by colour alone.

import type {
  AppointmentDeposit,
  AppointmentDepositInvariantBreach,
  AppointmentDepositShortfall,
} from '@/domain/appointments';
import { paymentMethodLabels } from '@/shared/icons/payment-method-icons';
import { formatEuroCents } from '@/shared/lib/money';

/** `22 sept.` */
export function formatDepositDay(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date);
}

/** `22 septembre` — the spoken form. */
function formatDepositSpokenDay(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(date);
}

/** `22 sept. · Carte` / `22 sept. · Carte · Annulé` */
export function formatDepositRowLabel(deposit: AppointmentDeposit): string {
  const parts = [formatDepositDay(deposit.paidAt), paymentMethodLabels[deposit.paymentMethod]];
  if (deposit.status === 'VOIDED') parts.push('Annulé');
  return parts.join(' · ');
}

/** `Acompte, 30,00 €, payé par carte le 22 septembre` (+ `, annulé`). */
export function formatDepositAccessibilityLabel(deposit: AppointmentDeposit): string {
  const label = [
    deposit.status === 'VOIDED' ? 'Acompte annulé' : 'Acompte',
    formatEuroCents(deposit.amountCents),
    `payé par ${paymentMethodLabels[deposit.paymentMethod].toLowerCase()} le ${formatDepositSpokenDay(deposit.paidAt)}`,
  ];
  return label.join(', ');
}

/** `Annuler l'acompte de 30,00 €` */
export function formatVoidDepositLabel(deposit: AppointmentDeposit): string {
  return `Annuler l’acompte de ${formatEuroCents(deposit.amountCents)}`;
}

/**
 * The ONE sentence of a refused change (Details quick edits, « Modifier »,
 * the checkout discount): the expected total would fall below the deposits.
 */
export interface DepositShortfallMessage {
  readonly message: string;
  readonly detail: string;
}

export function describeDepositShortfall(shortfall: AppointmentDepositShortfall): DepositShortfallMessage {
  return {
    message: `Ce changement ferait passer le total du rendez-vous sous les ${formatEuroCents(shortfall.activeDepositTotalCents)} déjà versés en acompte.`,
    detail: `Nouveau total : ${formatEuroCents(shortfall.expectedTotalCents)}. Annulez d’abord un acompte si ce changement est voulu.`,
  };
}

/**
 * The state itself is inconsistent: more was received in advance than the
 * Appointment is expected to bring in. Only a merge of two devices edited
 * offline produces it (`docs/architecture/CLOUD_SYNC.md` §21.2). The wording
 * names the two amounts and the two ways out — never « Reste 0,00 € » alone.
 */
export const DEPOSIT_CONFLICT_TITLE = 'Conflit financier à résoudre';

export function describeDepositInvariantBreach(
  breach: AppointmentDepositInvariantBreach,
): DepositShortfallMessage {
  return {
    message: `${DEPOSIT_CONFLICT_TITLE} : ${formatEuroCents(breach.activeDepositTotalCents)} d’acomptes pour un total de ${formatEuroCents(breach.expectedTotalCents)}.`,
    detail: `Écart de ${formatEuroCents(breach.excessCents)}. Annulez un acompte enregistré par erreur, ou remontez le total du rendez-vous. L’encaissement et les nouveaux acomptes restent bloqués jusque-là.`,
  };
}
