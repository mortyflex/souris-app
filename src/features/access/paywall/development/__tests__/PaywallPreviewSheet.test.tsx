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
import { Alert, Pressable } from 'react-native';

import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

import { PaywallPreviewSheet } from '../PaywallPreviewSheet';
import { paywallPreviewScenarios } from '../../testing/paywall-fixtures';

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
      if (previous.visible && !this.props.visible) this.props.onDismiss?.();
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
      <PaywallPreviewSheet onClose={() => setVisible(false)} visible={visible} />
    </>
  );
}

type View = Awaited<ReturnType<typeof render>>;

const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });

const presentedModals = (view: View) => view.queryAllByTestId('mock-modal');

async function renderPreview() {
  const view = await render(<Host />);
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
      const view = await render(<PaywallPreviewSheet onClose={jest.fn()} visible />);
      await act(async () => {});
      expect(view.queryByTestId('paywall-preview-sheet')).toBeNull();
      expect(presentedModals(view)).toHaveLength(0);
    } finally {
      flags.__DEV__ = true;
    }
  });
});
