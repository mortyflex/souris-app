// BeautIzzy — the read-only status card follows the REAL access policy:
// shown only under enforced read-only access, never with enforcement
// disabled (the shipped state), never with full access.

import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SUBSCRIPTION_ENFORCEMENT } from '@/features/access/enforcement';
import { createFakeSubscriptionSource } from '@/features/access/testing/fake-subscription-source';
import { TestPersistenceProvider, type TestBusinessAccessOptions } from '@/providers/testing/TestPersistenceProvider';

import { ReadOnlyStatusCard } from '../ReadOnlyStatusCard';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const FUTURE = new Date('2026-11-01T09:00:00.000Z');

async function renderCard(access?: TestBusinessAccessOptions) {
  const view = await render(
    <TestPersistenceProvider access={access}>
      <ReadOnlyStatusCard />
      <Text testID="sibling">ok</Text>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
}

describe('ReadOnlyStatusCard', () => {
  it('renders nothing with enforcement disabled, whatever the store says (the shipped state)', async () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const source = createFakeSubscriptionSource();
    source.respondWith({ kind: 'verified', status: { kind: 'expired' } });
    const view = await renderCard({ enforcement: SUBSCRIPTION_ENFORCEMENT, source });

    await waitFor(() => expect(source.calls.verify).toHaveLength(1));
    expect(view.queryByTestId('read-only-status')).toBeNull();
    expect(view.getByTestId('sibling')).toBeTruthy();
  });

  it('renders nothing by default (nobody signed in to the access session)', async () => {
    const view = await renderCard();
    expect(view.queryByTestId('read-only-status')).toBeNull();
  });

  it('renders nothing under full access with enforcement enabled', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith({ kind: 'verified', status: { kind: 'active', plan: 'annual', expiresAt: FUTURE } });
    const view = await renderCard({ enforcement: 'enabled', source, clock: () => new Date('2026-10-15T09:00:00.000Z') });

    await waitFor(() => expect(source.calls.verify).toHaveLength(1));
    expect(view.queryByTestId('read-only-status')).toBeNull();
  });

  it('shows the reassuring status under enforced read-only access, with the reason the policy knows', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith({ kind: 'verified', status: { kind: 'expired' } });
    const view = await renderCard({ enforcement: 'enabled', source });

    const card = await view.findByTestId('read-only-status');
    expect(view.getByText('Votre activité est en lecture seule.')).toBeTruthy();
    expect(view.getByText('Vous pouvez toujours consulter vos rendez-vous, votre clientèle et vos chiffres.')).toBeTruthy();
    expect(view.getByText('Votre abonnement BeautIzzy Plus n’est plus actif.')).toBeTruthy();
    expect(view.getByText('Vos données sont conservées. Les modifications nécessitent BeautIzzy Plus.')).toBeTruthy();
    expect(view.getByText('La gestion de l’abonnement sera bientôt disponible dans l’application.')).toBeTruthy();
    expect(card.props.accessible).toBe(true);
    expect(card.props.accessibilityLabel).toContain('Votre activité est en lecture seule.');
    expect(card.props.accessibilityLabel).not.toMatch(/supprim|paiement|erreur/i);
  });

  it('never claims an expiration the store did not confirm', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith({ kind: 'verified', status: { kind: 'never' } });
    const view = await renderCard({ enforcement: 'enabled', source });

    await view.findByTestId('read-only-status');
    expect(view.getByText('Votre compte n’a pas d’abonnement BeautIzzy Plus.')).toBeTruthy();
    expect(view.queryByText(/plus actif|expir/i)).toBeNull();
  });
});
