// BeautIzzy — read-only wording says exactly what the access policy knows

import type { ReadOnlyReason } from '@/domain/access';

import {
  ACCESS_DENIED_MESSAGE,
  ACCESS_DENIED_TITLE,
  READ_ONLY_DATA_PRESERVED,
  READ_ONLY_REQUIRES_PLUS,
  READ_ONLY_STATUS_DETAIL,
  READ_ONLY_STATUS_TITLE,
  describeBusinessAccessDenial,
  describeReadOnlyReason,
} from '../read-only-copy';

const EVERY_REASON: readonly ReadOnlyReason[] = [
  'subscription-expired',
  'never-subscribed',
  'no-entitlement-evidence',
  'grace-elapsed',
  'unreliable-evidence',
];

describe('read-only copy', () => {
  it('keeps the approved status sentences', () => {
    expect(READ_ONLY_STATUS_TITLE).toBe('Votre activité est en lecture seule.');
    expect(READ_ONLY_STATUS_DETAIL).toBe('Vous pouvez toujours consulter vos rendez-vous, votre clientèle et vos chiffres.');
    expect(READ_ONLY_DATA_PRESERVED).toBe('Vos données sont conservées.');
    expect(READ_ONLY_REQUIRES_PLUS).toBe('Les modifications nécessitent BeautIzzy Plus.');
  });

  it('says the subscription is no longer active only when the store confirmed its end', () => {
    expect(describeReadOnlyReason('subscription-expired')).toBe('Votre abonnement BeautIzzy Plus n’est plus actif.');
    for (const reason of EVERY_REASON.filter((candidate) => candidate !== 'subscription-expired')) {
      expect(describeReadOnlyReason(reason)).not.toMatch(/plus actif|expir/i);
    }
  });

  it('tells a never-subscribed account that it has none, and an unverified one that nothing could be verified', () => {
    expect(describeReadOnlyReason('never-subscribed')).toBe('Votre compte n’a pas d’abonnement BeautIzzy Plus.');
    expect(describeReadOnlyReason('no-entitlement-evidence')).toBe('Votre abonnement n’a pas pu être vérifié pour le moment.');
    expect(describeReadOnlyReason('unreliable-evidence')).toBe('Votre abonnement n’a pas pu être vérifié pour le moment.');
    expect(describeReadOnlyReason('grace-elapsed')).toBe('Votre abonnement n’a pas pu être vérifié depuis plusieurs jours.');
  });

  it('never blames a payment, never claims a deletion, never alarms', () => {
    for (const reason of EVERY_REASON) {
      const copy = `${describeReadOnlyReason(reason)} ${describeBusinessAccessDenial(reason).message}`;
      expect(copy).not.toMatch(/paiement|refus|carte|supprim|perdu|erreur|échec/i);
    }
  });
});

describe('access denial copy', () => {
  it('uses the Plus title and the generic explanation for every reason', () => {
    expect(ACCESS_DENIED_TITLE).toBe('Action réservée à BeautIzzy Plus');
    expect(ACCESS_DENIED_MESSAGE).toBe(
      'Vous pouvez toujours consulter vos données. Un abonnement BeautIzzy Plus est nécessaire pour les modifier.',
    );
    for (const reason of EVERY_REASON) {
      const { title, message } = describeBusinessAccessDenial(reason);
      expect(title).toBe(ACCESS_DENIED_TITLE);
      expect(message.endsWith(ACCESS_DENIED_MESSAGE)).toBe(true);
    }
  });

  it('leads with the reason when it adds something: expired says so, never-subscribed stays generic', () => {
    expect(describeBusinessAccessDenial('subscription-expired').message).toBe(
      `Votre abonnement BeautIzzy Plus n’est plus actif. ${ACCESS_DENIED_MESSAGE}`,
    );
    expect(describeBusinessAccessDenial('never-subscribed').message).toBe(ACCESS_DENIED_MESSAGE);
    expect(describeBusinessAccessDenial('grace-elapsed').message).toBe(
      `Votre abonnement n’a pas pu être vérifié depuis plusieurs jours. ${ACCESS_DENIED_MESSAGE}`,
    );
    expect(describeBusinessAccessDenial('no-entitlement-evidence').message).not.toMatch(/plus actif|expir/i);
  });
});
