// BeautIzzy — the wording of a checkout result: activated only for a verified
// entitlement, a calm cancellation, a deferral that owns nothing, a received
// transaction that offers to verify again, every failure with its own sentence.

import type { StoreTransactionFailure } from '../../subscription-source';
import {
  CHECKOUT_ACTIVATED_MESSAGE,
  CHECKOUT_ACTIVATED_TITLE,
  CHECKOUT_FAILURE_MESSAGES,
  CHECKOUT_RECEIVED_MESSAGE,
  describeCheckoutResult,
} from '../checkout-presentation';

const FAILURES: readonly StoreTransactionFailure[] = [
  'no-account',
  'not-configured',
  'not-enabled',
  'not-test-account',
  'operation-in-progress',
  'stale-offering',
  'sdk-unavailable',
  'identity-mismatch',
  'store-problem',
  'product-unavailable',
  'already-owned',
  'linked-to-another-account',
  'not-allowed',
  'network',
  'unexpected',
];

describe('describeCheckoutResult', () => {
  it('says « Abonnement activé » for activated — and for nothing else', () => {
    expect(describeCheckoutResult({ kind: 'activated' })).toEqual({
      tone: 'success',
      title: CHECKOUT_ACTIVATED_TITLE,
      message: CHECKOUT_ACTIVATED_MESSAGE,
      offersVerification: false,
    });
    for (const kind of ['received', 'cancelled', 'deferred', 'restore-received', 'nothing-to-restore', 'account-changed'] as const) {
      const model = describeCheckoutResult({ kind });
      expect(`${model.title} ${model.message}`).not.toMatch(/activé|Abonnement actif/);
      expect(model.tone).toBe('neutral');
    }
  });

  it('a received transaction is neutral and offers to verify again — never a second purchase', () => {
    expect(describeCheckoutResult({ kind: 'received' })).toMatchObject({ tone: 'neutral', message: CHECKOUT_RECEIVED_MESSAGE, offersVerification: true });
    expect(CHECKOUT_RECEIVED_MESSAGE).toBe('Achat reçu. Vérification de votre abonnement en cours.');
    expect(describeCheckoutResult({ kind: 'restore-received' })).toMatchObject({ offersVerification: true });
  });

  it('a cancellation is not alarming, a deferral owns nothing, an empty restore is not an error', () => {
    expect(describeCheckoutResult({ kind: 'cancelled' })).toMatchObject({ tone: 'neutral', title: 'Achat annulé' });
    expect(describeCheckoutResult({ kind: 'deferred' }).message).toMatch(/doit encore confirmer/);
    expect(describeCheckoutResult({ kind: 'nothing-to-restore' })).toMatchObject({ tone: 'neutral', title: 'Aucun achat à restaurer' });
    expect(describeCheckoutResult({ kind: 'restored' })).toMatchObject({ tone: 'success', title: 'Achats restaurés' });
  });

  it('a session that changed meanwhile is said plainly', () => {
    expect(describeCheckoutResult({ kind: 'account-changed' }).message).toMatch(/appartient au compte qui l’a lancée/);
  });

  it('every failure reason has its own sentence, titled by the operation', () => {
    for (const reason of FAILURES) {
      expect(describeCheckoutResult({ kind: 'failed', operation: 'purchase', reason })).toEqual({
        tone: 'failure',
        title: 'Achat impossible',
        message: CHECKOUT_FAILURE_MESSAGES[reason],
        offersVerification: false,
      });
      expect(describeCheckoutResult({ kind: 'failed', operation: 'restore', reason }).title).toBe('Restauration impossible');
      expect(CHECKOUT_FAILURE_MESSAGES[reason]).not.toMatch(/\d{2,}|code|receipt|reçu d’achat/i);
    }
    expect(new Set(Object.values(CHECKOUT_FAILURE_MESSAGES)).size).toBe(FAILURES.length);
  });
});
