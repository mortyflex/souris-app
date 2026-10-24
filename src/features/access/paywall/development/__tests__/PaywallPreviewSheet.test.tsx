// BeautIzzy — the development paywall preview: ONE native modal at a time.
//
// The scenario list is a BottomSheet (a React Native Modal) and the paywall a
// second, full-screen Modal. iOS refuses to present a modal over a modal, so
// the preview chains them through the real dismissal lifecycle: list down →
// paywall; paywall down → list. The Modal mock below mirrors the iOS contract
// (`onDismiss` once `visible` has dropped) and tags every presented host, so
// the tests can count what is on screen at every step.

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

import type { SubscriptionVerification } from '@/domain/access';

import { BusinessAccessProvider } from '../../../session/BusinessAccessProvider';
import { createFakeSubscriptionSource, type FakeSubscriptionSource } from '../../../testing/fake-subscription-source';
import type { StorePurchaseOutcome, StoreRestoreOutcome } from '../../../subscription-source';
import { CHECKOUT_VERIFY_AGAIN_TITLE } from '../../checkout-presentation';
import type { StorePaywallOffering } from '../../paywall-offering';
import { paywallPreviewScenarios } from '../../testing/paywall-fixtures';
import {
  APPLE_SANDBOX_NOTICE_TITLE,
  APPLE_SANDBOX_PREVIEW_DETAIL,
  LIVE_OFFERING_PREVIEW_KEY,
  LIVE_OFFERING_PREVIEW_TITLE,
  PaywallPreviewSheet,
  TEST_PURCHASE_CONFIRM_TITLE,
  TEST_PURCHASE_REFUSED_TITLE,
  TEST_PURCHASE_TITLE,
  TEST_RESTORE_CONFIRM_TITLE,
  TEST_RESTORE_TITLE,
} from '../PaywallPreviewSheet';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

/** Dismissals the mock Modal holds back while `hold` is set, released by the test (the iOS animation in flight). */
const mockModalDismissals: { hold: boolean; pending: (() => void)[] } = { hold: false, pending: [] };

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

  interface MockModalProps {
    readonly visible?: boolean;
    readonly presentationStyle?: string;
    readonly onDismiss?: () => void;
    readonly onRequestClose?: () => void;
    readonly children?: React.ReactNode;
  }

  class MockModal extends React.Component<MockModalProps> {
    componentDidUpdate(previous: MockModalProps) {
      if (previous.visible && !this.props.visible) {
        const dismissed = () => this.props.onDismiss?.();
        if (mockModalDismissals.hold) mockModalDismissals.pending.push(dismissed);
        else dismissed();
      }
    }

    render() {
      return this.props.visible
        ? React.createElement(
            View,
            {
              testID: 'mock-modal',
              accessibilityLabel: `modal:${this.props.presentationStyle ?? 'transparent'}`,
              onRequestClose: this.props.onRequestClose,
            } as unknown as React.ComponentProps<typeof View>,
            this.props.children,
          )
        : null;
    }
  }

  return { __esModule: true, default: MockModal };
});

/** fr-FR uses a narrow no-break space before € and a no-break group separator. */
const plain = (value: string) => value.replace(/[  ]/g, ' ');

function Host() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable accessibilityLabel="Ouvrir l’aperçu" onPress={() => setVisible(true)} />
      <Pressable accessibilityLabel="Retirer l’aperçu" onPress={() => setVisible(false)} />
      <PaywallPreviewSheet onClose={() => setVisible(false)} visible={visible} />
    </>
  );
}

/** The sheet lives under the session providers (it holds the checkout), as it does in Plus. */
function SessionHost({ source, signedOut = false }: { readonly source: FakeSubscriptionSource; readonly signedOut?: boolean }) {
  const [auth] = useState(() =>
    createFakeAuthGateway({ restore: async () => (signedOut ? { kind: 'unauthenticated' } : { kind: 'authenticated', user: fakeUser }) }),
  );
  return (
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider enforcement="disabled" source={source}>
        <Host />
      </BusinessAccessProvider>
    </AuthProvider>
  );
}

type View = Awaited<ReturnType<typeof render>>;

const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });

const presentedModals = (view: View) => view.queryAllByTestId('mock-modal');

async function renderPreview(source: FakeSubscriptionSource = createFakeSubscriptionSource({ offerings: true })) {
  const view = await render(<SessionHost source={source} />);
  await act(async () => {});
  return view;
}

async function openList(view: View) {
  await press(view.getByLabelText('Ouvrir l’aperçu'));
  await settleSheetTransition();
  expect(view.getByTestId('paywall-preview-sheet')).toBeTruthy();
}

/** Taps a scenario and lets the list slide down: the paywall is then presented. */
async function openScenario(view: View, key: string) {
  await press(view.getByTestId(`paywall-preview-${key}`));
  await settleSheetTransition();
  expect(view.queryByTestId('paywall-preview-sheet')).toBeNull();
  expect(view.getByTestId('paywall-preview-screen')).toBeTruthy();
  expect(presentedModals(view)).toHaveLength(1);
  expect(presentedModals(view)[0].props.accessibilityLabel).toBe('modal:fullScreen');
}

/** Closes the paywall; its dismissal brings the list back, alone. */
async function closePaywall(view: View) {
  await press(view.getByTestId('paywall-close'));
  await settleSheetTransition();
  expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
  expect(view.getByTestId('paywall-preview-sheet')).toBeTruthy();
  expect(presentedModals(view)).toHaveLength(1);
  expect(presentedModals(view)[0].props.accessibilityLabel).toBe('modal:transparent');
}

/** What identifies each scenario once its paywall is on screen. */
const scenarioEvidence: Record<string, (view: View) => void> = {
  'initial-trial': (view) => {
    expect(view.getByTestId('paywall-plan-annual')).toBeTruthy();
    expect(view.getByTestId('paywall-plan-monthly')).toBeTruthy();
    expect(within(view.getByTestId('paywall-subscribe')).getByText(/Essayer gratuitement/)).toBeTruthy();
    expect(view.getByTestId('paywall-explore')).toBeTruthy();
  },
  'initial-no-trial': (view) => {
    expect(view.getByTestId('paywall-plan-annual')).toBeTruthy();
    expect(within(view.getByTestId('paywall-subscribe')).queryByText(/gratuit/)).toBeNull();
  },
  expired: (view) => {
    expect(view.getByTestId('paywall-notice')).toBeTruthy();
    expect(view.getByText(/n’est plus actif/)).toBeTruthy();
    expect(view.getByTestId('paywall-plans')).toBeTruthy();
    expect(view.getByTestId('paywall-return')).toBeTruthy();
  },
  never: (view) => {
    expect(view.getByTestId('paywall-notice')).toBeTruthy();
    expect(view.queryByText(/n’est plus actif/)).toBeNull();
    expect(view.getByTestId('paywall-return')).toBeTruthy();
  },
  unverified: (view) => {
    expect(view.getByTestId('paywall-plans-unavailable')).toBeTruthy();
    expect(view.getByTestId('paywall-retry-offering')).toBeTruthy();
    expect(view.getByTestId('paywall-return')).toBeTruthy();
  },
  entitled: (view) => {
    expect(view.queryByTestId('paywall-plans')).toBeNull();
    expect(view.queryByTestId('paywall-subscribe')).toBeNull();
    expect(view.getByTestId('paywall-continue')).toBeTruthy();
  },
  verifying: (view) => {
    expect(view.getByTestId('paywall-notice-pending')).toBeTruthy();
    expect(view.queryByTestId('paywall-plans')).toBeNull();
    expect(view.getByTestId('paywall-continue')).toBeTruthy();
  },
  loading: (view) => {
    expect(view.getByTestId('paywall-plans-loading')).toBeTruthy();
    expect(view.getByTestId('paywall-subscribe').props.accessibilityState?.disabled).toBe(true);
  },
  'not-configured': (view) => {
    expect(view.getByTestId('paywall-plans-unavailable')).toBeTruthy();
    expect(view.queryByTestId('paywall-retry-offering')).toBeNull();
    expect(view.queryByTestId('paywall-subscribe')).toBeNull();
    expect(view.getByTestId('paywall-explore')).toBeTruthy();
  },
  'monthly-only': (view) => {
    expect(view.getByTestId('paywall-plan-monthly')).toBeTruthy();
    expect(view.queryByTestId('paywall-plan-annual')).toBeNull();
  },
  'annual-only': (view) => {
    expect(view.getByTestId('paywall-plan-annual')).toBeTruthy();
    expect(view.queryByTestId('paywall-plan-monthly')).toBeNull();
  },
  usd: (view) => {
    expect(plain(String(view.getByTestId('paywall-plan-annual-price').props.children))).toBe('$149.99');
  },
};

beforeEach(() => {
  jest.restoreAllMocks();
  mockModalDismissals.hold = false;
  mockModalDismissals.pending = [];
});

describe('PaywallPreviewSheet — presentation', () => {
  it('opens the scenario list in one sheet, with every scenario and the no-purchase hint', async () => {
    const view = await renderPreview();
    expect(presentedModals(view)).toHaveLength(0);

    await openList(view);
    expect(presentedModals(view)).toHaveLength(1);
    expect(view.getByText('Données fictives. Aucun achat, aucun changement d’accès.')).toBeTruthy();
    for (const scenario of paywallPreviewScenarios) {
      expect(view.getByTestId(`paywall-preview-${scenario.key}`)).toBeTruthy();
      expect(view.getByText(scenario.title)).toBeTruthy();
    }
    expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
  });

  it('lists the scenarios in a scrolling body so every entry is reachable, and scrolling never dismisses the list', async () => {
    const view = await renderPreview();
    await openList(view);

    // The only scroll container on screen is the sheet's body: the list lives in it.
    const scrollViews = view.container.queryAll((node) => node.type === 'RCTScrollView');
    expect(scrollViews).toHaveLength(1);
    const [list] = scrollViews;
    expect(list!.props.horizontal).toBeFalsy();
    expect(list!.props.scrollEnabled).not.toBe(false);
    expect(list!.props.keyboardShouldPersistTaps).toBe('handled');
    // The scroll container keeps the sheet's content-fit layout: it shrinks to the detent, never collapses.
    expect(StyleSheet.flatten(list!.props.style)).toMatchObject({ flexShrink: 1 });
    // Every scenario — the live entry and the last fixture included — is inside the scrolling body.
    expect(within(list!).getByTestId(`paywall-preview-${LIVE_OFFERING_PREVIEW_KEY}`)).toBeTruthy();
    for (const scenario of paywallPreviewScenarios) {
      expect(within(list!).getByTestId(`paywall-preview-${scenario.key}`)).toBeTruthy();
    }

    await act(async () => {
      fireEvent.scroll(list!, { nativeEvent: { contentOffset: { y: 900 } } });
    });
    expect(view.getByTestId('paywall-preview-sheet')).toBeTruthy();
    expect(presentedModals(view)).toHaveLength(1);

    // The last entry is selectable after the scroll, with the usual one-modal sequencing.
    const last = paywallPreviewScenarios[paywallPreviewScenarios.length - 1]!;
    await openScenario(view, last.key);
    scenarioEvidence[last.key]!(view);
    await closePaywall(view);
  });

  it('every scenario is covered by an identifying expectation', () => {
    expect(Object.keys(scenarioEvidence).sort()).toEqual(paywallPreviewScenarios.map((s) => s.key).sort());
  });

  it.each(paywallPreviewScenarios.map((scenario) => [scenario.key, scenario.title]))(
    'tapping « %s » presents that paywall alone, after the list is gone, then returns to the list',
    async (key) => {
      const view = await renderPreview();
      await openList(view);

      await openScenario(view, key);
      scenarioEvidence[key](view);

      await closePaywall(view);
    },
  );

  it('never presents the paywall while the list is still on screen: it waits for the real dismissal', async () => {
    const view = await renderPreview();
    await openList(view);

    await press(view.getByTestId('paywall-preview-initial-trial'));
    // The list is sliding down: still presented, and the paywall not yet.
    expect(view.getByTestId('paywall-preview-sheet')).toBeTruthy();
    expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
    expect(presentedModals(view)).toHaveLength(1);

    await settleSheetTransition();
    expect(view.queryByTestId('paywall-preview-sheet')).toBeNull();
    expect(view.getByTestId('paywall-preview-screen')).toBeTruthy();
    expect(presentedModals(view)).toHaveLength(1);
  });

  it('switches between scenarios repeatedly with one modal host at a time', async () => {
    const view = await renderPreview();
    await openList(view);

    for (const key of ['initial-trial', 'expired', 'entitled', 'usd', 'loading', 'initial-trial']) {
      await openScenario(view, key);
      scenarioEvidence[key](view);
      await closePaywall(view);
    }
  });

  it('a hardware back on the paywall returns to the list; a back on the list closes the preview', async () => {
    const view = await renderPreview();
    await openList(view);
    await openScenario(view, 'expired');

    await act(async () => {
      fireEvent(presentedModals(view)[0], 'requestClose');
    });
    await settleSheetTransition();
    expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
    expect(view.getByTestId('paywall-preview-sheet')).toBeTruthy();

    await act(async () => {
      fireEvent(presentedModals(view)[0], 'requestClose');
    });
    await settleSheetTransition();
    expect(view.queryByTestId('paywall-preview-sheet')).toBeNull();
    expect(presentedModals(view)).toHaveLength(0);
  });

  it('« Explorer sans abonnement » and « Revenir à mes données » also return to the list', async () => {
    const view = await renderPreview();
    await openList(view);

    await openScenario(view, 'initial-trial');
    await press(view.getByTestId('paywall-explore'));
    await settleSheetTransition();
    expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
    expect(view.getByTestId('paywall-preview-sheet')).toBeTruthy();

    await openScenario(view, 'never');
    await press(view.getByTestId('paywall-return'));
    await settleSheetTransition();
    expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
    expect(view.getByTestId('paywall-preview-sheet')).toBeTruthy();
    expect(presentedModals(view)).toHaveLength(1);
  });

  it('« Fermer » on the list closes the whole preview and leaves nothing presented', async () => {
    const view = await renderPreview();
    await openList(view);

    await press(view.getByText('Fermer'));
    await settleSheetTransition();
    expect(view.queryByTestId('paywall-preview-sheet')).toBeNull();
    expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
    expect(presentedModals(view)).toHaveLength(0);

    // Reopening starts on the list again.
    await openList(view);
    expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
  });
});

describe('PaywallPreviewSheet — nothing is bought, nothing is fetched', () => {
  it('the purchase action only explains that nothing is purchased, and the paywall stays', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await renderPreview();
    await openList(view);
    await openScenario(view, 'initial-trial');

    await press(view.getByTestId('paywall-subscribe'));
    expect(alert).toHaveBeenCalledWith('Aperçu de développement', 'Aucun achat n’est effectué dans cet aperçu.');
    expect(view.getByTestId('paywall-preview-screen')).toBeTruthy();
  });

  it('the retry action only explains that no store is queried', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await renderPreview();
    await openList(view);
    await openScenario(view, 'unverified');

    await press(view.getByTestId('paywall-retry-offering'));
    expect(alert).toHaveBeenCalledWith('Aperçu de développement', 'Aucun magasin n’est interrogé dans cet aperçu.');
    expect(view.getByTestId('paywall-preview-screen')).toBeTruthy();
  });
});

describe('PaywallPreviewSheet — production', () => {
  it('renders nothing outside __DEV__, even when requested', async () => {
    const flags = globalThis as unknown as { __DEV__: boolean };
    flags.__DEV__ = false;
    try {
      const [auth] = [createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) })];
      const view = await render(
        <AuthProvider gateway={auth}>
          <BusinessAccessProvider enforcement="disabled" source={createFakeSubscriptionSource({ transactions: true })}>
            <PaywallPreviewSheet onClose={jest.fn()} visible />
          </BusinessAccessProvider>
        </AuthProvider>,
      );
      await act(async () => {});
      expect(view.queryByTestId('paywall-preview-sheet')).toBeNull();
      expect(presentedModals(view)).toHaveLength(0);
    } finally {
      flags.__DEV__ = true;
    }
  });
});

// ---------------------------------------------------------------------------
// « Offre RevenueCat actuelle » — the live entry draws the REAL offering of
// the signed-in account through the provider: store prices and trial state
// from the source, loading and unavailable states, the same one-modal
// lifecycle — and, since Phase 6.3, the ONLY purchase entry point: a guarded,
// confirmed Test Store purchase run by the sheet AFTER the paywall Modal is
// really dismissed, so the SDK's dialog is the only presentation; each
// outcome worded, nothing shown as active without a verified entitlement.
// ---------------------------------------------------------------------------

const LIVE_OFFERING: StorePaywallOffering = {
  status: 'available',
  reference: 'offering-1',
  plans: [
    { plan: 'annual', price: { amount: 49.99, currencyCode: 'USD', formatted: '$49.99' } },
    {
      plan: 'monthly',
      price: { amount: 4.99, currencyCode: 'USD', formatted: '$4.99' },
      freeTrial: { period: { unit: 'week', count: 1 }, eligibility: 'eligible' },
    },
  ],
};

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const ACTIVE: SubscriptionVerification = { kind: 'verified', status: { kind: 'active', plan: 'unknown', expiresAt: FUTURE } };
const NEVER: SubscriptionVerification = { kind: 'verified', status: { kind: 'never' } };
const UNAVAILABLE: SubscriptionVerification = { kind: 'unavailable' };

/** A transacting source answering NEVER, selling the live offering. */
function liveSource(verification: SubscriptionVerification = NEVER) {
  const source = createFakeSubscriptionSource({ offerings: true, transactions: true });
  source.respondWith(verification);
  source.respondWithOffering(LIVE_OFFERING);
  return source;
}

interface AlertButton {
  readonly text?: string;
  readonly style?: string;
  readonly onPress?: () => void;
}

/** The last alert shown: its title, message and buttons. */
function lastAlert(alert: jest.SpyInstance) {
  const call = alert.mock.calls[alert.mock.calls.length - 1] as [string, string | undefined, AlertButton[] | undefined] | undefined;
  if (call === undefined) throw new Error('no alert shown');
  return { title: call[0], message: call[1], buttons: call[2] ?? [] };
}

async function pressAlertButton(alert: jest.SpyInstance, text: string) {
  const button = lastAlert(alert).buttons.find((candidate) => candidate.text === text);
  if (button === undefined) throw new Error(`no alert button « ${text} »`);
  await act(async () => {
    button.onPress?.();
  });
}

async function openLivePaywall(source: FakeSubscriptionSource) {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const view = await renderPreview(source);
  await openList(view);
  await openScenario(view, LIVE_OFFERING_PREVIEW_KEY);
  return { view, alert };
}

/** Confirms the selected plan: the paywall slides down, the sheet buys once it is gone. */
async function confirmPurchase(view: View, alert: jest.SpyInstance) {
  await press(view.getByTestId('paywall-subscribe'));
  await pressAlertButton(alert, TEST_PURCHASE_CONFIRM_TITLE);
  await settleSheetTransition();
}

/** Nothing of ours is presented: no sheet, no paywall, no modal host. */
function expectNothingPresented(view: View) {
  expect(view.queryByTestId('paywall-preview-sheet')).toBeNull();
  expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
  expect(presentedModals(view)).toHaveLength(0);
}

/** « OK » on the outcome alert presents the live paywall again. */
async function returnFromResult(view: View, alert: jest.SpyInstance) {
  await pressAlertButton(alert, 'OK');
  await settleSheetTransition();
  expect(view.getByTestId('paywall-preview-screen')).toBeTruthy();
  expect(presentedModals(view)).toHaveLength(1);
  expect(presentedModals(view)[0].props.accessibilityLabel).toBe('modal:fullScreen');
}

describe('PaywallPreviewSheet — « Offre RevenueCat actuelle » (real offering)', () => {
  it('lists the live entry first, labelled as the real offering and the Test Store purchase, without touching the fixtures', async () => {
    const source = createFakeSubscriptionSource({ offerings: true });
    const view = await renderPreview(source);
    await openList(view);
    expect(view.getByTestId(`paywall-preview-${LIVE_OFFERING_PREVIEW_KEY}`)).toBeTruthy();
    expect(view.getByText(LIVE_OFFERING_PREVIEW_TITLE)).toBeTruthy();
    expect(view.getByText(/Offre réelle du compte connecté. Achat de test sur le RevenueCat Test Store — aucun paiement réel./)).toBeTruthy();
    // Nothing is asked of the store while the list is up.
    expect(source.calls.loadOffering).toEqual([]);
    for (const scenario of paywallPreviewScenarios) {
      expect(view.getByTestId(`paywall-preview-${scenario.key}`)).toBeTruthy();
    }
  });

  it('presents the paywall over the store offering: real prices, annual preselected, the eligible trial of the monthly plan only, the Test Store notice', async () => {
    const source = createFakeSubscriptionSource({ offerings: true });
    source.respondWithOffering(LIVE_OFFERING);
    const view = await renderPreview(source);
    await openList(view);

    await openScenario(view, LIVE_OFFERING_PREVIEW_KEY);
    expect(source.calls.loadOffering).toEqual(['user-lea']);
    expect(plain(String(view.getByTestId('paywall-plan-annual-price').props.children))).toBe('$49.99');
    expect(plain(String(view.getByTestId('paywall-plan-monthly-price').props.children))).toBe('$4.99');
    expect(view.getByTestId('paywall-plan-annual').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('paywall-plan-annual-recommended')).toBeTruthy();
    expect(view.queryByText('7 jours gratuits')).toBeTruthy();
    // The annual plan carries no trial: the preselected action sells it at its price.
    expect(within(view.getByTestId('paywall-subscribe')).queryByText(/gratuit/)).toBeNull();
    // No fixture price reached the screen.
    expect(view.queryByText(/12,99|129 €/)).toBeNull();
    // The environment is said on the screen itself.
    const notice = view.getByTestId('paywall-environment-notice');
    expect(within(notice).getByText(TEST_PURCHASE_TITLE)).toBeTruthy();
    expect(within(notice).getByText(/L’essai gratuit Apple n’existe pas dans le Test Store/)).toBeTruthy();
    // The restore entry point exists on the live entry.
    expect(view.getByTestId('paywall-link-restore')).toBeTruthy();

    await closePaywall(view);
  });

  it('shows the loading state while the store answers, then the offering', async () => {
    let release: ((offering: StorePaywallOffering) => void) | undefined;
    const source = createFakeSubscriptionSource({
      loadOffering: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const view = await renderPreview(source);
    await openList(view);
    await openScenario(view, LIVE_OFFERING_PREVIEW_KEY);
    expect(view.getByTestId('paywall-plans-loading')).toBeTruthy();
    expect(view.getByTestId('paywall-subscribe').props.accessibilityState?.disabled).toBe(true);

    await act(async () => release!(LIVE_OFFERING));
    expect(view.queryByTestId('paywall-plans-loading')).toBeNull();
    expect(view.getByTestId('paywall-plan-annual')).toBeTruthy();
    await closePaywall(view);
  });

  it('shows a meaningful unavailable state with a retry that asks the store again', async () => {
    const source = createFakeSubscriptionSource({ offerings: true });
    const view = await renderPreview(source);
    await openList(view);
    await openScenario(view, LIVE_OFFERING_PREVIEW_KEY);
    expect(view.getByTestId('paywall-plans-unavailable')).toBeTruthy();
    expect(view.getByText('Offres indisponibles pour le moment')).toBeTruthy();
    expect(view.queryByTestId('paywall-subscribe')).toBeNull();

    source.respondWithOffering(LIVE_OFFERING);
    await press(view.getByTestId('paywall-retry-offering'));
    expect(source.calls.loadOffering).toEqual(['user-lea', 'user-lea']);
    expect(view.getByTestId('paywall-plan-annual')).toBeTruthy();
    await closePaywall(view);
  });

  it('keeps one modal host at a time across the live entry and the fixtures, and reloads on each opening', async () => {
    const source = createFakeSubscriptionSource({ offerings: true });
    source.respondWithOffering(LIVE_OFFERING);
    const view = await renderPreview(source);
    await openList(view);

    await openScenario(view, LIVE_OFFERING_PREVIEW_KEY);
    await closePaywall(view);
    await openScenario(view, 'initial-trial');
    scenarioEvidence['initial-trial']!(view);
    await closePaywall(view);
    await openScenario(view, LIVE_OFFERING_PREVIEW_KEY);
    expect(plain(String(view.getByTestId('paywall-plan-annual-price').props.children))).toBe('$49.99');
    await closePaywall(view);
    expect(source.calls.loadOffering).toEqual(['user-lea', 'user-lea']);
  });

  it('a late store answer after the paywall closed lands nowhere', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    let release: ((offering: StorePaywallOffering) => void) | undefined;
    const source = createFakeSubscriptionSource({
      loadOffering: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const view = await renderPreview(source);
    await openList(view);
    await openScenario(view, LIVE_OFFERING_PREVIEW_KEY);
    await closePaywall(view);
    await act(async () => release!(LIVE_OFFERING));
    expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('PaywallPreviewSheet — the Test Store purchase (Phase 6.3)', () => {
  it('asks for an explicit confirmation naming the plan, the exact store price and the Test Store; nothing is bought before', async () => {
    const source = liveSource();
    const { view, alert } = await openLivePaywall(source);

    await press(view.getByTestId('paywall-subscribe'));
    const confirmation = lastAlert(alert);
    expect(confirmation.title).toBe(TEST_PURCHASE_TITLE);
    expect(plain(confirmation.message ?? '')).toContain('Annuel · $49.99 par an');
    expect(confirmation.message).toContain('RevenueCat Test Store, compte connecté. Aucun paiement réel.');
    expect(confirmation.message).toContain('L’essai gratuit Apple n’existe pas dans le Test Store.');
    expect(confirmation.buttons.map((button) => button.text)).toEqual(['Annuler', TEST_PURCHASE_CONFIRM_TITLE]);
    expect(source.calls.purchase).toEqual([]);
    // The paywall is still presented: nothing moved before the confirmation.
    expect(presentedModals(view)).toHaveLength(1);

    // Declining buys nothing and leaves the paywall where it is.
    await pressAlertButton(alert, 'Annuler');
    await settleSheetTransition();
    expect(source.calls.purchase).toEqual([]);
    expect(view.getByTestId('paywall-preview-screen')).toBeTruthy();
    expect(presentedModals(view)).toHaveLength(1);
    await closePaywall(view);
  });

  it('on confirmation the paywall Modal is dismissed FIRST; the purchase starts only once the native dismissal completed, with nothing of ours presented', async () => {
    const presentedAtPurchase: number[] = [];
    let view: View | undefined;
    const source = createFakeSubscriptionSource({
      offerings: true,
      purchase: () => {
        presentedAtPurchase.push(presentedModals(view!).length);
        return Promise.resolve({ kind: 'cancelled' });
      },
    });
    source.respondWith(NEVER);
    source.respondWithOffering(LIVE_OFFERING);
    const opened = await openLivePaywall(source);
    view = opened.view;
    const { alert } = opened;

    // The iOS dismissal animation is in flight: the Modal has not reported its dismissal yet.
    mockModalDismissals.hold = true;
    await press(view.getByTestId('paywall-subscribe'));
    await pressAlertButton(alert, TEST_PURCHASE_CONFIRM_TITLE);
    await settleSheetTransition();
    expect(presentedModals(view)).toHaveLength(0);
    expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
    expect(source.calls.purchase).toEqual([]);
    expect(mockModalDismissals.pending).toHaveLength(1);

    // The real dismissal: now, and only now, the sheet buys — exactly once, over an empty screen.
    await act(async () => {
      mockModalDismissals.pending.splice(0).forEach((dismissed) => dismissed());
    });
    await settleSheetTransition();
    expect(source.calls.purchase).toEqual([{ userId: 'user-lea', request: { reference: 'offering-1', plan: 'annual' } }]);
    expect(presentedAtPurchase).toEqual([0]);
    expect(lastAlert(alert).title).toBe('Achat annulé');
    await returnFromResult(view, alert);
  });

  it('confirms the SELECTED plan: the monthly package by its reference, with the monthly store price', async () => {
    const source = liveSource();
    source.respondWithPurchase({ kind: 'cancelled' });
    const { view, alert } = await openLivePaywall(source);
    await press(view.getByTestId('paywall-plan-monthly'));
    await press(view.getByTestId('paywall-subscribe'));
    expect(plain(lastAlert(alert).message ?? '')).toContain('Mensuel · $4.99 par mois');
    await pressAlertButton(alert, TEST_PURCHASE_CONFIRM_TITLE);
    await settleSheetTransition();
    expect(source.calls.purchase).toEqual([{ userId: 'user-lea', request: { reference: 'offering-1', plan: 'monthly' } }]);
    await returnFromResult(view, alert);
  });

  it('a verified entitlement after the purchase: « Abonnement activé », then the live paywall returns in its ENTITLED context — nothing to buy twice', async () => {
    const source = liveSource();
    source.respondWithPurchase({ kind: 'completed', verification: ACTIVE });
    const { view, alert } = await openLivePaywall(source);
    expect(view.getByTestId('paywall-explore')).toBeTruthy();

    await confirmPurchase(view, alert);
    expect(source.calls.purchase).toEqual([{ userId: 'user-lea', request: { reference: 'offering-1', plan: 'annual' } }]);
    expectNothingPresented(view);
    expect(lastAlert(alert)).toMatchObject({ title: 'Abonnement activé', message: 'Votre accès BeautIzzy Plus est actif.' });
    expect(lastAlert(alert).buttons.map((button) => button.text)).toEqual(['OK']);

    await returnFromResult(view, alert);
    // The same screen, now over an entitled account: no plan, no price, no purchase action; the loader ran again.
    expect(view.getByText('Votre abonnement BeautIzzy Plus est actif.')).toBeTruthy();
    expect(view.queryByTestId('paywall-plans')).toBeNull();
    expect(view.queryByTestId('paywall-subscribe')).toBeNull();
    expect(source.calls.loadOffering).toEqual(['user-lea', 'user-lea']);
    expect(view.getByTestId('paywall-continue')).toBeTruthy();
    await press(view.getByTestId('paywall-continue'));
    await settleSheetTransition();
    expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
    expect(view.getByTestId('paywall-preview-sheet')).toBeTruthy();
  });

  it('an account already entitled meets the entitled context at once and can start no purchase', async () => {
    const source = liveSource(ACTIVE);
    const { view } = await openLivePaywall(source);
    expect(view.getByText('Votre abonnement BeautIzzy Plus est actif.')).toBeTruthy();
    expect(view.queryByTestId('paywall-subscribe')).toBeNull();
    expect(source.calls.purchase).toEqual([]);
    await closePaywall(view);
  });

  it('a completed purchase the store has not confirmed: « Achat reçu », never activated, with a re-verification that buys nothing', async () => {
    const source = liveSource();
    source.respondWithPurchase({ kind: 'completed', verification: UNAVAILABLE });
    const { view, alert } = await openLivePaywall(source);
    await confirmPurchase(view, alert);
    const received = lastAlert(alert);
    expect(received.title).toBe('Achat reçu');
    expect(received.message).toBe('Achat reçu. Vérification de votre abonnement en cours.');
    expect(received.buttons.map((button) => button.text)).toEqual([CHECKOUT_VERIFY_AGAIN_TITLE, 'OK']);
    expectNothingPresented(view);

    // « Vérifier à nouveau »: one more verification, no transaction, the answer alerted again.
    source.respondWith(ACTIVE);
    await pressAlertButton(alert, CHECKOUT_VERIFY_AGAIN_TITLE);
    expect(source.calls.purchase).toHaveLength(1);
    expect(source.calls.verify).toEqual(['user-lea', 'user-lea']);
    expect(lastAlert(alert).title).toBe('Abonnement activé');
    await returnFromResult(view, alert);
    expect(view.getByText('Votre abonnement BeautIzzy Plus est actif.')).toBeTruthy();
  });

  it('« OK » on « Achat reçu » returns to the live paywall, still selling: no entitlement was fabricated', async () => {
    const source = liveSource();
    source.respondWithPurchase({ kind: 'completed', verification: UNAVAILABLE });
    const { view, alert } = await openLivePaywall(source);
    await confirmPurchase(view, alert);
    await returnFromResult(view, alert);
    expect(view.getByTestId('paywall-subscribe').props.accessibilityState?.disabled).toBeFalsy();
    expect(view.queryByText('Votre abonnement BeautIzzy Plus est actif.')).toBeNull();
    await closePaywall(view);
  });

  it('a cancelled purchase is said calmly, and the paywall comes back as it was — never stuck in progress', async () => {
    const source = liveSource();
    source.respondWithPurchase({ kind: 'cancelled' });
    const { view, alert } = await openLivePaywall(source);
    await confirmPurchase(view, alert);
    expect(lastAlert(alert)).toMatchObject({ title: 'Achat annulé', message: 'Aucun achat n’a été effectué.' });
    await returnFromResult(view, alert);
    const action = view.getByTestId('paywall-subscribe');
    expect(action.props.accessibilityState?.disabled).toBeFalsy();
    expect(within(action).queryByText('Achat en cours…')).toBeNull();
    expect(view.queryByText('Votre abonnement BeautIzzy Plus est actif.')).toBeNull();
    await closePaywall(view);
  });

  it.each([
    [{ kind: 'pending' }, 'Achat en attente'],
    [{ kind: 'failed', reason: 'store-problem' }, 'Achat impossible'],
    [{ kind: 'failed', reason: 'network' }, 'Achat impossible'],
    [{ kind: 'failed', reason: 'already-owned' }, 'Achat impossible'],
  ] as const)('the outcome %o is worded « %s », nothing reads as active, and the preview is reachable again', async (outcome, title) => {
    const source = liveSource();
    source.respondWithPurchase(outcome);
    const { view, alert } = await openLivePaywall(source);
    await confirmPurchase(view, alert);
    expect(lastAlert(alert).title).toBe(title);
    expect(lastAlert(alert).message).not.toMatch(/activé|actif/);
    await returnFromResult(view, alert);
    expect(view.queryByText('Votre abonnement BeautIzzy Plus est actif.')).toBeNull();
    await closePaywall(view);
  });

  it('while the SDK dialog is up, nothing of ours is presented and a second purchase cannot be started; the result waits for the SDK', async () => {
    let release: ((outcome: StorePurchaseOutcome) => void) | undefined;
    const source = createFakeSubscriptionSource({ offerings: true, purchase: () => new Promise((resolve) => (release = resolve)) });
    source.respondWith(NEVER);
    source.respondWithOffering(LIVE_OFFERING);
    const { view, alert } = await openLivePaywall(source);
    await confirmPurchase(view, alert);

    expectNothingPresented(view);
    expect(source.calls.purchase).toHaveLength(1);
    const alerts = alert.mock.calls.length;
    // The preview list cannot be reopened over the SDK dialog, and nothing is alerted before the SDK answers.
    await press(view.getByLabelText('Ouvrir l’aperçu'));
    await settleSheetTransition();
    expectNothingPresented(view);
    expect(alert.mock.calls.length).toBe(alerts);
    expect(source.calls.purchase).toHaveLength(1);

    await act(async () => release!({ kind: 'cancelled' }));
    expect(lastAlert(alert).title).toBe('Achat annulé');
    await returnFromResult(view, alert);
    expect(source.calls.purchase).toHaveLength(1);
  });

  it('a purchase confirmed, then the preview withdrawn by Plus: the outcome is applied by the provider, nothing is alerted or presented', async () => {
    let release: ((outcome: StorePurchaseOutcome) => void) | undefined;
    const source = createFakeSubscriptionSource({ offerings: true, purchase: () => new Promise((resolve) => (release = resolve)) });
    source.respondWith(NEVER);
    source.respondWithOffering(LIVE_OFFERING);
    const { view, alert } = await openLivePaywall(source);
    await confirmPurchase(view, alert);
    await press(view.getByLabelText('Retirer l’aperçu'));
    const alerts = alert.mock.calls.length;
    await act(async () => release!({ kind: 'completed', verification: ACTIVE }));
    await settleSheetTransition();
    expect(alert.mock.calls.length).toBe(alerts);
    expectNothingPresented(view);
    // Reopening the preview: the list, then the live entry in its entitled context — the provider holds the answer.
    await openList(view);
    await openScenario(view, LIVE_OFFERING_PREVIEW_KEY);
    expect(view.getByText('Votre abonnement BeautIzzy Plus est actif.')).toBeTruthy();
    await closePaywall(view);
  });

  it('on Android the Modal hides with its prop: the purchase starts at once, still from the sheet, still once', async () => {
    const os = Platform.OS;
    (Platform as { OS: string }).OS = 'android';
    try {
      const source = liveSource();
      source.respondWithPurchase({ kind: 'cancelled' });
      const { view, alert } = await openLivePaywall(source);
      await press(view.getByTestId('paywall-subscribe'));
      await pressAlertButton(alert, TEST_PURCHASE_CONFIRM_TITLE);
      await settleSheetTransition();
      expect(source.calls.purchase).toHaveLength(1);
      expectNothingPresented(view);
      expect(lastAlert(alert).title).toBe('Achat annulé');
      await returnFromResult(view, alert);
    } finally {
      (Platform as { OS: string }).OS = os;
    }
  });

  it('refuses safely when the source is not bound to the Test Store, without asking anything or moving the paywall', async () => {
    const source = createFakeSubscriptionSource({ offerings: true, transactions: true, store: 'app-store' });
    source.respondWith(NEVER);
    source.respondWithOffering(LIVE_OFFERING);
    const { view, alert } = await openLivePaywall(source);
    await press(view.getByTestId('paywall-subscribe'));
    expect(lastAlert(alert)).toMatchObject({ title: TEST_PURCHASE_REFUSED_TITLE });
    expect(lastAlert(alert).message).toMatch(/Test Store/);
    expect(lastAlert(alert).buttons).toEqual([]);
    expect(source.calls.purchase).toEqual([]);
    expect(presentedModals(view)).toHaveLength(1);
    await closePaywall(view);
  });

  it('refuses safely outside a development bundle', async () => {
    const source = liveSource();
    const { view, alert } = await openLivePaywall(source);
    const flags = globalThis as unknown as { __DEV__: boolean };
    flags.__DEV__ = false;
    try {
      await press(view.getByTestId('paywall-subscribe'));
    } finally {
      flags.__DEV__ = true;
    }
    expect(lastAlert(alert)).toMatchObject({ title: TEST_PURCHASE_REFUSED_TITLE, message: 'Achat de test réservé aux bundles de développement.' });
    expect(source.calls.purchase).toEqual([]);
    await closePaywall(view);
  });

  it('the fixture scenarios still buy nothing: their action only explains, the paywall stays, and the sheet is never asked', async () => {
    const source = liveSource();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await renderPreview(source);
    await openList(view);
    for (const key of ['initial-trial', 'expired', 'usd']) {
      await openScenario(view, key);
      await press(view.getByTestId('paywall-subscribe'));
      expect(lastAlert(alert)).toEqual({ title: 'Aperçu de développement', message: 'Aucun achat n’est effectué dans cet aperçu.', buttons: [] });
      expect(view.getByTestId('paywall-preview-screen')).toBeTruthy();
      expect(view.queryByTestId('paywall-link-restore')).toBeNull();
      await closePaywall(view);
    }
    expect(source.calls.purchase).toEqual([]);
    expect(source.calls.restore).toEqual([]);
  });
});

describe('PaywallPreviewSheet — the Test Store restore (Phase 6.3)', () => {
  it('explains the Test Store limitation and asks for confirmation; declining restores nothing', async () => {
    const source = liveSource();
    const { view, alert } = await openLivePaywall(source);
    await press(view.getByTestId('paywall-link-restore'));
    const confirmation = lastAlert(alert);
    expect(confirmation.title).toBe(TEST_RESTORE_TITLE);
    expect(confirmation.message).toMatch(/ne restaure pas un historique d’achats réel/);
    expect(confirmation.message).toMatch(/Sandbox Apple \/ TestFlight/);
    expect(confirmation.buttons.map((button) => button.text)).toEqual(['Annuler', TEST_RESTORE_CONFIRM_TITLE]);
    await pressAlertButton(alert, 'Annuler');
    expect(source.calls.restore).toEqual([]);
    await closePaywall(view);
  });

  it.each([
    [{ kind: 'completed', verification: ACTIVE }, 'Achats restaurés'],
    [{ kind: 'completed', verification: NEVER }, 'Aucun achat à restaurer'],
    [{ kind: 'completed', verification: UNAVAILABLE }, 'Restauration reçue'],
    [{ kind: 'cancelled' }, 'Achat annulé'],
    [{ kind: 'failed', reason: 'network' }, 'Restauration impossible'],
  ] as const satisfies readonly (readonly [StoreRestoreOutcome, string])[])('confirming runs the user-initiated restore in place and words %o as « %s »', async (outcome, title) => {
    const source = liveSource();
    source.respondWithRestore(outcome);
    const { view, alert } = await openLivePaywall(source);
    await press(view.getByTestId('paywall-link-restore'));
    await pressAlertButton(alert, TEST_RESTORE_CONFIRM_TITLE);
    expect(source.calls.restore).toEqual(['user-lea']);
    expect(lastAlert(alert).title).toBe(title);
    // The restore presents nothing natively: the paywall stayed.
    expect(presentedModals(view)).toHaveLength(1);
    if (outcome.kind === 'completed' && outcome.verification === ACTIVE) {
      expect(view.getByText('Votre abonnement BeautIzzy Plus est actif.')).toBeTruthy();
    } else {
      expect(view.queryByText('Votre abonnement BeautIzzy Plus est actif.')).toBeNull();
      await closePaywall(view);
    }
  });

  it('while the restore runs, the primary action is disabled and reads « Restauration en cours… », then frees', async () => {
    let release: ((outcome: StoreRestoreOutcome) => void) | undefined;
    const source = createFakeSubscriptionSource({ offerings: true, restore: () => new Promise((resolve) => (release = resolve)) });
    source.respondWith(NEVER);
    source.respondWithOffering(LIVE_OFFERING);
    const { view, alert } = await openLivePaywall(source);
    await press(view.getByTestId('paywall-link-restore'));
    await pressAlertButton(alert, TEST_RESTORE_CONFIRM_TITLE);
    const action = view.getByTestId('paywall-subscribe');
    expect(action.props.accessibilityState?.disabled).toBe(true);
    expect(within(action).getByText('Restauration en cours…')).toBeTruthy();
    const alerts = alert.mock.calls.length;
    await press(action);
    expect(alert.mock.calls.length).toBe(alerts);
    await act(async () => release!({ kind: 'cancelled' }));
    expect(view.getByTestId('paywall-subscribe').props.accessibilityState?.disabled).toBeFalsy();
    await closePaywall(view);
  });

  it('never restores on opening, on loading or on closing the live entry', async () => {
    const source = liveSource();
    const { view } = await openLivePaywall(source);
    await closePaywall(view);
    await openScenario(view, LIVE_OFFERING_PREVIEW_KEY);
    await closePaywall(view);
    expect(source.calls.restore).toEqual([]);
    expect(source.calls.purchase).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Apple Sandbox mode (Phase 6.4A): a debug bundle bound to the App Store
// (`APP_VARIANT=apple-sandbox`). The live entry draws the REAL App Store
// offering — prices, periods, trial eligibility — and transacts nothing: the
// primary action only explains, no restore link exists, the notice says
// read-only. Loading, unavailable, retry and the entitled context are kept.
// ---------------------------------------------------------------------------

describe('PaywallPreviewSheet — Apple Sandbox mode (App Store, read-only)', () => {
  /** A source bound to the App Store, as the wiring builds it in Apple Sandbox mode. */
  function sandboxSource(offering: StorePaywallOffering = LIVE_OFFERING, verification: SubscriptionVerification = NEVER) {
    const source = createFakeSubscriptionSource({ offerings: true, transactions: true, store: 'app-store' });
    source.respondWith(verification);
    source.respondWithOffering(offering);
    return source;
  }

  it('labels the live entry as the read-only App Store offering, not as a Test Store purchase', async () => {
    const source = sandboxSource();
    const view = await renderPreview(source);
    await openList(view);
    expect(view.getByText(APPLE_SANDBOX_PREVIEW_DETAIL)).toBeTruthy();
    expect(view.queryByText(/Achat de test sur le RevenueCat Test Store/)).toBeNull();
    expect(source.calls.loadOffering).toEqual([]);
  });

  it('draws the real offering — prices, trial, annual preselected — under the Apple Sandbox read-only notice, without any restore link', async () => {
    const source = sandboxSource();
    const { view } = await openLivePaywall(source);
    expect(source.calls.loadOffering).toEqual(['user-lea']);
    expect(plain(String(view.getByTestId('paywall-plan-annual-price').props.children))).toBe('$49.99');
    expect(plain(String(view.getByTestId('paywall-plan-monthly-price').props.children))).toBe('$4.99');
    expect(view.getByTestId('paywall-plan-annual').props.accessibilityState.selected).toBe(true);
    expect(view.queryByText('7 jours gratuits')).toBeTruthy();
    const notice = view.getByTestId('paywall-environment-notice');
    expect(within(notice).getByText(APPLE_SANDBOX_NOTICE_TITLE)).toBeTruthy();
    expect(within(notice).getByText(/Aucun achat ni restauration/)).toBeTruthy();
    expect(within(notice).queryByText(TEST_PURCHASE_TITLE)).toBeNull();
    expect(view.queryByTestId('paywall-link-restore')).toBeNull();
    await closePaywall(view);
  });

  it('the primary action never starts an Apple purchase: it explains the read-only mode, asks nothing, and the paywall stays', async () => {
    const source = sandboxSource();
    const { view, alert } = await openLivePaywall(source);
    for (const plan of ['annual', 'monthly'] as const) {
      await press(view.getByTestId(`paywall-plan-${plan}`));
      await press(view.getByTestId('paywall-subscribe'));
      expect(lastAlert(alert)).toMatchObject({ title: TEST_PURCHASE_REFUSED_TITLE, buttons: [] });
      expect(lastAlert(alert).message).toMatch(/Apple Sandbox, lecture seule — aucun achat/);
      expect(view.getByTestId('paywall-preview-screen')).toBeTruthy();
      expect(presentedModals(view)).toHaveLength(1);
    }
    expect(alert).not.toHaveBeenCalledWith(TEST_PURCHASE_TITLE, expect.anything(), expect.anything());
    expect(source.calls.purchase).toEqual([]);
    expect(source.calls.restore).toEqual([]);
    await closePaywall(view);
  });

  it('keeps the loading state, the unavailable state and the retry over the App Store', async () => {
    let release: ((offering: StorePaywallOffering) => void) | undefined;
    let loads = 0;
    const source = createFakeSubscriptionSource({
      store: 'app-store',
      transactions: true,
      loadOffering: () => {
        loads += 1;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });
    source.respondWith(NEVER);
    const { view } = await openLivePaywall(source);
    expect(view.getByTestId('paywall-plans-loading')).toBeTruthy();
    expect(view.getByTestId('paywall-subscribe').props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      release!({ status: 'unavailable', reason: 'store-unavailable' });
    });
    expect(view.getByTestId('paywall-plans-unavailable')).toBeTruthy();
    expect(view.queryByTestId('paywall-link-restore')).toBeNull();

    await press(view.getByTestId('paywall-retry-offering'));
    expect(loads).toBe(2);
    await act(async () => {
      release!(LIVE_OFFERING);
    });
    expect(plain(String(view.getByTestId('paywall-plan-annual-price').props.children))).toBe('$49.99');
    expect(source.calls.purchase).toEqual([]);
    expect(source.calls.restore).toEqual([]);
    await closePaywall(view);
  });

  it('an entitled account meets the entitled context: nothing to sell, nothing to buy, nothing to restore', async () => {
    const source = sandboxSource(LIVE_OFFERING, ACTIVE);
    const { view } = await openLivePaywall(source);
    expect(view.queryByTestId('paywall-plans')).toBeNull();
    expect(view.queryByTestId('paywall-subscribe')).toBeNull();
    expect(view.queryByTestId('paywall-link-restore')).toBeNull();
    expect(view.getByTestId('paywall-continue')).toBeTruthy();
    expect(source.calls.purchase).toEqual([]);
    expect(source.calls.restore).toEqual([]);
    await closePaywall(view);
  });

  it('closing the live entry, or withdrawing the preview, transacts nothing either', async () => {
    const source = sandboxSource();
    const { view } = await openLivePaywall(source);
    await closePaywall(view);
    await press(view.getByLabelText('Retirer l’aperçu'));
    await settleSheetTransition();
    expectNothingPresented(view);
    expect(source.calls.purchase).toEqual([]);
    expect(source.calls.restore).toEqual([]);
  });
});
