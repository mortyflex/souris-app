// BeautIzzy — what the professional reads after a purchase or a restore — pure
//
// From the checkout result (`use-plus-checkout.ts`), the title and message of
// the ONE dialog the screen shows, and whether that dialog offers to verify
// again. Inclusive, gender-neutral French. Rules:
//
//   * « Abonnement activé » is written for `activated` ONLY: a verified
//     entitlement in force for this account. A completed transaction the
//     store has not confirmed yet (`received`) reads as received and under
//     verification — never as active, never as failed — and offers to verify
//     again, which starts no second purchase;
//   * a cancellation is calm: nothing happened, nothing is alarming;
//   * a deferred payment is not a success: nothing is owned until the store
//     confirms;
//   * a restore that found nothing is not an error, and no restore promises
//     that every historical purchase comes back;
//   * a session that changed meanwhile is said plainly: the result belongs to
//     the account that started it;
//   * every failure has its own sentence, never a code, never a receipt.

import type { StoreTransactionFailure } from '../subscription-source';
import type { PlusCheckoutResult } from '../session/use-plus-checkout';
import { PLUS_BRAND_NAME } from './paywall-copy';

export interface CheckoutResultModel {
  readonly tone: 'success' | 'neutral' | 'failure';
  readonly title: string;
  readonly message: string;
  /** The dialog offers « Vérifier à nouveau »: a re-verification, never a new transaction. */
  readonly offersVerification: boolean;
}

export const CHECKOUT_ACTIVATED_TITLE = 'Abonnement activé';
export const CHECKOUT_ACTIVATED_MESSAGE = `Votre accès ${PLUS_BRAND_NAME} est actif.`;
export const CHECKOUT_RECEIVED_TITLE = 'Achat reçu';
export const CHECKOUT_RECEIVED_MESSAGE = 'Achat reçu. Vérification de votre abonnement en cours.';
export const CHECKOUT_CANCELLED_TITLE = 'Achat annulé';
export const CHECKOUT_CANCELLED_MESSAGE = 'Aucun achat n’a été effectué.';
export const CHECKOUT_DEFERRED_TITLE = 'Achat en attente';
export const CHECKOUT_DEFERRED_MESSAGE =
  'Le magasin doit encore confirmer cet achat. Votre abonnement prendra effet dès sa confirmation.';
export const CHECKOUT_RESTORED_TITLE = 'Achats restaurés';
export const CHECKOUT_RESTORED_MESSAGE = `Votre accès ${PLUS_BRAND_NAME} est actif.`;
export const CHECKOUT_RESTORE_RECEIVED_TITLE = 'Restauration reçue';
export const CHECKOUT_RESTORE_RECEIVED_MESSAGE = 'Vérification de votre abonnement en cours.';
export const CHECKOUT_NOTHING_TO_RESTORE_TITLE = 'Aucun achat à restaurer';
export const CHECKOUT_NOTHING_TO_RESTORE_MESSAGE = `Aucun abonnement ${PLUS_BRAND_NAME} actif n’a été trouvé pour ce compte.`;
export const CHECKOUT_ACCOUNT_CHANGED_TITLE = 'Compte modifié';
export const CHECKOUT_ACCOUNT_CHANGED_MESSAGE =
  'Le compte connecté a changé pendant l’opération. Le résultat appartient au compte qui l’a lancée : reconnectez-vous avec ce compte pour vérifier son abonnement.';
export const CHECKOUT_FAILED_PURCHASE_TITLE = 'Achat impossible';
export const CHECKOUT_FAILED_RESTORE_TITLE = 'Restauration impossible';
export const CHECKOUT_VERIFY_AGAIN_TITLE = 'Vérifier à nouveau';

export const CHECKOUT_FAILURE_MESSAGES: Readonly<Record<StoreTransactionFailure, string>> = {
  'no-account': 'Connectez-vous pour continuer.',
  'not-configured': 'Les achats ne sont pas disponibles dans cette version.',
  'not-enabled': 'Les achats ne sont pas encore activés pour ce magasin.',
  'operation-in-progress': 'Une opération est déjà en cours. Patientez un instant.',
  'stale-offering': 'Les offres ont changé. Rechargez les offres, puis réessayez.',
  'sdk-unavailable': 'Le magasin n’est pas disponible dans cette version de l’application.',
  'identity-mismatch': 'Le compte du magasin ne correspond pas au compte connecté. Reconnectez-vous, puis réessayez.',
  'store-problem': 'Le magasin n’a pas pu finaliser l’opération. Réessayez plus tard.',
  'product-unavailable': 'Cette formule n’est pas disponible pour le moment.',
  'already-owned': `Ce compte possède déjà cet abonnement ${PLUS_BRAND_NAME}.`,
  'linked-to-another-account': 'Cet achat est associé à un autre compte.',
  'not-allowed': 'Les achats ne sont pas autorisés sur cet appareil.',
  network: 'Connexion indisponible. Vérifiez votre connexion, puis réessayez.',
  unexpected: 'Une erreur inattendue est survenue. Réessayez plus tard.',
};

export function describeCheckoutResult(result: PlusCheckoutResult): CheckoutResultModel {
  switch (result.kind) {
    case 'activated':
      return { tone: 'success', title: CHECKOUT_ACTIVATED_TITLE, message: CHECKOUT_ACTIVATED_MESSAGE, offersVerification: false };
    case 'received':
      return { tone: 'neutral', title: CHECKOUT_RECEIVED_TITLE, message: CHECKOUT_RECEIVED_MESSAGE, offersVerification: true };
    case 'cancelled':
      return { tone: 'neutral', title: CHECKOUT_CANCELLED_TITLE, message: CHECKOUT_CANCELLED_MESSAGE, offersVerification: false };
    case 'deferred':
      return { tone: 'neutral', title: CHECKOUT_DEFERRED_TITLE, message: CHECKOUT_DEFERRED_MESSAGE, offersVerification: false };
    case 'restored':
      return { tone: 'success', title: CHECKOUT_RESTORED_TITLE, message: CHECKOUT_RESTORED_MESSAGE, offersVerification: false };
    case 'restore-received':
      return {
        tone: 'neutral',
        title: CHECKOUT_RESTORE_RECEIVED_TITLE,
        message: CHECKOUT_RESTORE_RECEIVED_MESSAGE,
        offersVerification: true,
      };
    case 'nothing-to-restore':
      return {
        tone: 'neutral',
        title: CHECKOUT_NOTHING_TO_RESTORE_TITLE,
        message: CHECKOUT_NOTHING_TO_RESTORE_MESSAGE,
        offersVerification: false,
      };
    case 'account-changed':
      return {
        tone: 'neutral',
        title: CHECKOUT_ACCOUNT_CHANGED_TITLE,
        message: CHECKOUT_ACCOUNT_CHANGED_MESSAGE,
        offersVerification: false,
      };
    case 'failed':
      return {
        tone: 'failure',
        title: result.operation === 'purchase' ? CHECKOUT_FAILED_PURCHASE_TITLE : CHECKOUT_FAILED_RESTORE_TITLE,
        message: CHECKOUT_FAILURE_MESSAGES[result.reason],
        offersVerification: false,
      };
  }
}
