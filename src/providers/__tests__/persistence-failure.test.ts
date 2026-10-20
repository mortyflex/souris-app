// BeautIzzy — the one persistence alert: a refused subscription write is
// explained as such; every other failure keeps the generic alert.

import { Alert } from 'react-native';

import { BusinessAccessDeniedError } from '@/features/access/write-guard';

import {
  PERSISTENCE_FAILURE_MESSAGE,
  PERSISTENCE_FAILURE_TITLE,
  alertPersistenceFailure,
} from '../persistence-failure';

describe('alertPersistenceFailure', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  beforeEach(() => {
    alert.mockClear();
  });

  it('keeps the generic alert exactly as before without an error, and for any non-subscription error', () => {
    alertPersistenceFailure();
    alertPersistenceFailure(new Error('SQLITE_FULL'));
    alertPersistenceFailure('refused');
    alertPersistenceFailure(undefined);
    alertPersistenceFailure({ reason: 'subscription-expired', operation: 'clients.addClient' });

    expect(alert).toHaveBeenCalledTimes(5);
    for (const call of alert.mock.calls) {
      expect(call).toEqual([PERSISTENCE_FAILURE_TITLE, PERSISTENCE_FAILURE_MESSAGE]);
    }
    expect(PERSISTENCE_FAILURE_TITLE).toBe('Enregistrement impossible');
    expect(PERSISTENCE_FAILURE_MESSAGE).toBe('Les données n’ont pas pu être enregistrées. Réessayez.');
  });

  it('explains a refused subscription write with the Plus title and the reason the policy knows', () => {
    alertPersistenceFailure(new BusinessAccessDeniedError('clients.addClient', 'subscription-expired'));

    expect(alert).toHaveBeenCalledWith(
      'Action réservée à BeautIzzy Plus',
      'Votre abonnement BeautIzzy Plus n’est plus actif. Vous pouvez toujours consulter vos données. Un abonnement BeautIzzy Plus est nécessaire pour les modifier.',
    );
  });

  it('never calls a never-subscribed or unverified account expired, and never mentions a save', () => {
    alertPersistenceFailure(new BusinessAccessDeniedError('sales.completeSale', 'never-subscribed'));
    alertPersistenceFailure(new BusinessAccessDeniedError('products.addProduct', 'grace-elapsed'));

    const [never, grace] = alert.mock.calls;
    expect(never).toEqual([
      'Action réservée à BeautIzzy Plus',
      'Vous pouvez toujours consulter vos données. Un abonnement BeautIzzy Plus est nécessaire pour les modifier.',
    ]);
    expect(grace![0]).toBe('Action réservée à BeautIzzy Plus');
    expect(grace![1]).toMatch(/n’a pas pu être vérifié depuis plusieurs jours/);
    for (const call of alert.mock.calls) {
      expect(call[1]).not.toMatch(/enregistr|paiement|refus/i);
      expect(call[1]).not.toMatch(/expir/i);
    }
  });
});
