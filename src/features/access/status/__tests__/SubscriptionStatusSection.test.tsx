// BeautIzzy — « Mon abonnement »: the badge and the details follow the
// session's verification through the REAL provider, never the access mode —
// an enforcement-disabled full access shows no badge; the card is one
// accessible element; no action is drawn; the fixtures preview draws every
// state outside __DEV__ never.

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import type { SubscriptionStatus, SubscriptionVerification } from '@/domain/access';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

import { BusinessAccessProvider, useBusinessAccess } from '../../session/BusinessAccessProvider';
import { createFakeSubscriptionSource, type FakeSubscriptionSource } from '../../testing/fake-subscription-source';
import { SubscriptionStatusPreviewSheet } from '../development/SubscriptionStatusPreviewSheet';
import { SubscriptionStatusCard } from '../SubscriptionStatusCard';
import { SubscriptionStatusSection } from '../SubscriptionStatusSection';
import { describeSubscriptionStatus } from '../subscription-status-presentation';
import { STATUS_FIXTURE_END, STATUS_FIXTURE_NOW, subscriptionStatusScenarios } from '../testing/subscription-status-fixtures';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const verified = (status: SubscriptionStatus): SubscriptionVerification => ({ kind: 'verified', status });

let access: ReturnType<typeof useBusinessAccess> | undefined;
function AccessProbe() {
  const value = useBusinessAccess();
  useEffect(() => {
    access = value;
  });
  return null;
}

const signedIn = () => createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });

async function renderSection({
  source = createFakeSubscriptionSource(),
  enforcement = 'disabled',
  auth = signedIn(),
}: {
  readonly source?: FakeSubscriptionSource;
  readonly enforcement?: 'enabled' | 'disabled';
  readonly auth?: ReturnType<typeof createFakeAuthGateway>;
} = {}) {
  access = undefined;
  const view = await render(
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider clock={() => STATUS_FIXTURE_NOW} enforcement={enforcement} source={source}>
        <AccessProbe />
        <SubscriptionStatusSection clock={() => STATUS_FIXTURE_NOW} />
      </BusinessAccessProvider>
    </AuthProvider>,
  );
  await act(async () => {});
  return view;
}

type View = Awaited<ReturnType<typeof renderSection>>;
const hasBadge = (view: View) => view.queryByTestId('subscription-status-badge') !== null;
const title = (view: View) => view.getByTestId('subscription-status-title').props.children as string;

describe('SubscriptionStatusSection', () => {
  it('shows the section header and a pending state before the first verification lands', async () => {
    const pending = createFakeSubscriptionSource({ verify: () => new Promise(() => undefined) });
    const view = await renderSection({ source: pending });
    expect(view.getByText('Mon abonnement')).toBeTruthy();
    expect(title(view)).toBe('Vérification de l’abonnement…');
    expect(hasBadge(view)).toBe(false);
  });

  it('full access with enforcement disabled proves nothing: a never-subscribed account shows no badge', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith(verified({ kind: 'never' }));
    const view = await renderSection({ source, enforcement: 'disabled' });
    expect(access?.canMutate).toBe(true);
    expect(access?.access).toEqual({ mode: 'full', reason: 'enforcement-disabled' });
    expect(hasBadge(view)).toBe(false);
    expect(title(view)).toBe('Aucun abonnement actif');
    expect(view.getByText('Toutes les fonctionnalités restent disponibles.')).toBeTruthy();
  });

  it('an unverifiable subscription is neither free nor expired, whatever the access mode', async () => {
    const view = await renderSection({ source: createFakeSubscriptionSource(), enforcement: 'disabled' });
    expect(access?.canMutate).toBe(true);
    expect(hasBadge(view)).toBe(false);
    expect(title(view)).toBe('Abonnement non vérifié');
    expect(view.queryByText(/Aucun abonnement/)).toBeNull();
  });

  it('a verified active subscription shows the badge, the plan and the end of the period', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith(verified({ kind: 'active', plan: 'annual', expiresAt: STATUS_FIXTURE_END }));
    const view = await renderSection({ source });
    expect(hasBadge(view)).toBe(true);
    const badge = view.getByTestId('subscription-status-badge');
    expect(within(badge).getByText('BeautIzzy Plus')).toBeTruthy();
    // A small brand label, not the focus of the card: the 24 pt capsule, a 14 pt name, start-aligned.
    expect(StyleSheet.flatten(badge.props.style)).toMatchObject({ minHeight: 24, paddingHorizontal: 10, alignSelf: 'flex-start' });
    const name = StyleSheet.flatten(within(badge).getByText('BeautIzzy Plus').props.style);
    expect(name).toMatchObject({ fontSize: 14, lineHeight: 18 });
    const symbol = view.container
      .queryAll((node) => node.type === 'Image')
      .find((image) => StyleSheet.flatten(image.props.style).width === 13);
    expect(symbol).toBeDefined();
    // The status title stays the largest text of the card.
    expect(StyleSheet.flatten(view.getByTestId('subscription-status-title').props.style).fontSize).toBeGreaterThan(14);
    expect(title(view)).toBe('Abonnement actif');
    expect(view.getByTestId('subscription-status-plan').props.children).toBe('Annuel');
    expect(view.getByText(/Période en cours jusqu’au 21 novembre 2026\./)).toBeTruthy();
  });

  it('follows a push from the store within the session', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith(verified({ kind: 'never' }));
    const view = await renderSection({ source });
    expect(hasBadge(view)).toBe(false);
    await act(async () => {
      source.emit('user-lea', verified({ kind: 'trial', plan: 'monthly', expiresAt: STATUS_FIXTURE_END }));
    });
    expect(hasBadge(view)).toBe(true);
    expect(title(view)).toBe('Essai gratuit');
  });

  it('is one accessible element that says everything, and draws no button or link', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith(verified({ kind: 'complimentary' }));
    const view = await renderSection({ source });
    const card = view.getByTestId('subscription-status');
    expect(card.props.accessible).toBe(true);
    expect(card.props.accessibilityLabel).toBe('BeautIzzy Plus, Accès offert');
    expect(view.queryAllByRole('button')).toHaveLength(0);
    expect(view.queryAllByRole('link')).toHaveLength(0);
    expect(view.queryByText(/Gérer/)).toBeNull();
  });

  it('signed out: a pending state, never the previous account’s status', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith(verified({ kind: 'active', plan: 'monthly', expiresAt: STATUS_FIXTURE_END }));
    const auth = signedIn();
    const view = await renderSection({ source, auth });
    expect(hasBadge(view)).toBe(true);
    await act(async () => auth.emitSession(null));
    expect(hasBadge(view)).toBe(false);
    expect(title(view)).toBe('Vérification de l’abonnement…');
  });
});

describe('SubscriptionStatusCard', () => {
  it.each(subscriptionStatusScenarios.map((scenario) => [scenario.key, scenario]))(
    'draws the « %s » fixture with its badge decision',
    async (_key, scenario) => {
      const model = describeSubscriptionStatus({ verification: scenario.verification, now: STATUS_FIXTURE_NOW, enforcement: 'disabled' });
      const view = await render(<SubscriptionStatusCard model={model} testID={`card-${scenario.key}`} />);
      await act(async () => {});
      expect(view.queryByTestId(`card-${scenario.key}-badge`) !== null).toBe(model.plus);
      expect(view.getByTestId(`card-${scenario.key}-title`).props.children).toBe(model.title);
    },
  );
});

function PreviewHost() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable accessibilityLabel="Ouvrir le statut" onPress={() => setVisible(true)} />
      <SubscriptionStatusPreviewSheet onClose={() => setVisible(false)} visible={visible} />
    </>
  );
}

describe('SubscriptionStatusPreviewSheet', () => {
  it('lists every fixture status in one sheet, labelled as fictional', async () => {
    const view = await render(<PreviewHost />);
    await act(async () => {});
    await act(async () => {
      fireEvent.press(view.getByLabelText('Ouvrir le statut'));
    });
    await settleSheetTransition();
    expect(view.getByTestId('subscription-status-preview-sheet')).toBeTruthy();
    expect(view.getByText('Données fictives. Aucun abonnement réel, aucun changement d’accès.')).toBeTruthy();
    for (const scenario of subscriptionStatusScenarios) {
      expect(view.getByTestId(`subscription-status-preview-${scenario.key}-card`)).toBeTruthy();
    }
    expect(view.getAllByText('BeautIzzy Plus')).toHaveLength(7);
  });

  it('draws the fixtures in a scrolling body so the last ones are reachable; scrolling never dismisses, Fermer does', async () => {
    const view = await render(<PreviewHost />);
    await act(async () => {});
    await act(async () => {
      fireEvent.press(view.getByLabelText('Ouvrir le statut'));
    });
    await settleSheetTransition();

    const scrollViews = view.container.queryAll((node) => node.type === 'RCTScrollView');
    expect(scrollViews).toHaveLength(1);
    const [list] = scrollViews;
    expect(list!.props.horizontal).toBeFalsy();
    expect(list!.props.scrollEnabled).not.toBe(false);
    expect(StyleSheet.flatten(list!.props.style)).toMatchObject({ flexShrink: 1 });
    const last = subscriptionStatusScenarios[subscriptionStatusScenarios.length - 1]!;
    expect(within(list!).getByTestId(`subscription-status-preview-${last.key}-card`)).toBeTruthy();
    expect(within(list!).getByTestId('subscription-status-preview-active-monthly-card')).toBeTruthy();

    await act(async () => {
      fireEvent.scroll(list!, { nativeEvent: { contentOffset: { y: 1500 } } });
    });
    expect(view.getByTestId('subscription-status-preview-sheet')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByText('Fermer'));
    });
    await settleSheetTransition();
    expect(view.queryByTestId('subscription-status-preview-sheet')).toBeNull();
  });

  it('renders nothing outside __DEV__', async () => {
    const flags = globalThis as unknown as { __DEV__: boolean };
    flags.__DEV__ = false;
    try {
      const view = await render(<SubscriptionStatusPreviewSheet onClose={jest.fn()} visible />);
      await act(async () => {});
      expect(view.queryByTestId('subscription-status-preview-sheet')).toBeNull();
    } finally {
      flags.__DEV__ = true;
    }
  });
});
