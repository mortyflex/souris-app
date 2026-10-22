// BeautIzzy — the BeautIzzy Plus paywall screen (behavioral, no pixel tests)
//
// Presentation only: branding, approved copy and illustration; plan selection
// and the primary action it drives; the states of the offering; the ways out;
// what each context shows and never claims; accessibility.

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { haptics } from '@/shared/lib/haptics';
import { getAppTextStyle } from '@/shared/ui/AppText';
import { semanticColors } from '@/shared/ui/theme';

import { PaywallScreen, type PaywallScreenProps } from '../PaywallScreen';
import { paywallIllustration } from '../paywall-illustration';
import { unconfiguredPaywallOffering } from '../paywall-offering';
import { paywallContextFixtures, paywallOfferingFixtures } from '../testing/paywall-fixtures';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// The first-run frame fades its groups in with Reanimated; tests render it settled.
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

/** fr-FR uses a narrow no-break space before € and a no-break group separator. */
const plain = (value: string) => value.replace(/[\u202F\u00A0]/g, ' ');
const textOf = (element: { readonly props: Record<string, unknown> }) => plain(String(element.props.children));

/** Every interaction runs inside an awaited act: React 19 flushes updates asynchronously. */
const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });

async function renderPaywall(props: Partial<PaywallScreenProps> = {}) {
  const view = await render(
    <PaywallScreen
      context={paywallContextFixtures.initialOffer}
      offering={paywallOfferingFixtures.frenchWithTrial}
      {...props}
    />,
  );
  await act(async () => {});
  return view;
}

const selectedState = (view: Awaited<ReturnType<typeof renderPaywall>>, plan: 'annual' | 'monthly') =>
  view.getByTestId(`paywall-plan-${plan}`).props.accessibilityState;

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('PaywallScreen — branding and approved copy', () => {
  it('identifies BeautIzzy Plus, shows the approved headline, the three benefits and the growth-duo illustration', async () => {
    const view = await renderPaywall();

    expect(view.getByLabelText('BeautIzzy Plus')).toBeTruthy();
    expect(within(view.getByTestId('paywall-brand')).getByText('BeautIzzy Plus')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Faites grandir votre activité, simplement.' })).toBeTruthy();
    expect(view.getByText('Tout votre quotidien au même endroit.')).toBeTruthy();
    expect(view.getByText('Gardez le contrôle sur vos chiffres.')).toBeTruthy();
    expect(view.getByText('Gagnez du temps chaque jour.')).toBeTruthy();

    const illustration = view.getByTestId('paywall-illustration', { includeHiddenElements: true });
    expect(illustration.props.source).toBe(paywallIllustration);
    expect(illustration.props.resizeMode).toBe('contain');
    expect(illustration.props.accessible).toBe(false);
    expect(illustration.props.importantForAccessibility).toBe('no-hide-descendants');
    const { width, height } = StyleSheet.flatten(illustration.props.style);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(80);
    expect(width).toBeLessThanOrEqual(116);
  });

  it('gives the brand its presence in the hero capsule: 30 pt, the 16 pt semibold name, the symbol 16 pt wide — under the headline', async () => {
    const view = await renderPaywall();
    const badge = StyleSheet.flatten(view.getByTestId('paywall-brand').props.style);
    expect(badge.minHeight).toBe(30);
    expect(badge.paddingHorizontal).toBe(12);
    expect(badge.alignSelf).toBe('center');
    const name = within(view.getByTestId('paywall-brand')).getByText('BeautIzzy Plus');
    const nameStyle = StyleSheet.flatten(name.props.style);
    expect(nameStyle.fontSize).toBe(getAppTextStyle('control', 'ios').fontSize);
    expect(nameStyle.fontSize).toBe(16);
    expect(nameStyle.fontFamily).toBe(getAppTextStyle('control', Platform.OS === 'android' ? 'android' : 'ios').fontFamily);
    expect(nameStyle.color).toBe(semanticColors.accent);
    // The symbol is the one image inside the capsule, 16 pt wide (its height follows the PNG).
    const images = view.container.queryAll((node) => node.type === 'Image');
    const symbol = images.find((image) => StyleSheet.flatten(image.props.style).width === 16);
    expect(symbol).toBeDefined();
    expect(StyleSheet.flatten(symbol!.props.style).height).toBeGreaterThan(16);
    const title = StyleSheet.flatten(view.getByTestId('paywall-title').props.style);
    // The brand is a recognisable product, never as large as the headline.
    expect(nameStyle.fontSize).toBeLessThan(title.fontSize ?? 0);
    expect((title.fontSize ?? 0) / nameStyle.fontSize).toBeGreaterThanOrEqual(1.4);
  });

  it('puts the offer before the benefits: hero, lead, plans, then the three benefits', async () => {
    const view = await renderPaywall();
    const rendered = JSON.stringify(view.toJSON());
    const at = (marker: string) => {
      const index = rendered.indexOf(marker);
      expect(index).toBeGreaterThan(-1);
      return index;
    };
    expect(at('"paywall-hero"')).toBeLessThan(at('"paywall-plans"'));
    expect(at('"paywall-lead"')).toBeLessThan(at('"paywall-plans"'));
    expect(at('"paywall-plans"')).toBeLessThan(at('"paywall-benefits"'));
    expect(view.getByTestId('paywall-lead').props.children).toBe('Votre espace est prêt. Profitez pleinement de BeautIzzy Plus.');
  });

  it('keeps the hero compact: no top padding of its own, 4 pt gaps, the body flush under the top bar', async () => {
    const view = await renderPaywall();
    const hero = StyleSheet.flatten(view.getByTestId('paywall-hero').props.style);
    expect(hero.paddingTop).toBeUndefined();
    expect(hero.gap).toBe(4);
    const title = StyleSheet.flatten(view.getByTestId('paywall-title').props.style);
    // The 27 / 33 screen-title step on both platforms: one notch under the iOS
    // screen title, two under the display of Welcome, still bold and navy.
    expect(title.fontSize).toBe(getAppTextStyle('screenTitle', 'android').fontSize);
    expect(title.lineHeight).toBe(getAppTextStyle('screenTitle', 'android').lineHeight);
    expect(title.fontSize).toBeLessThan(getAppTextStyle('screenTitle', 'ios').fontSize ?? 0);
    expect(title.fontSize).toBeLessThan(getAppTextStyle('display', 'ios').fontSize ?? 0);
    expect(title.fontSize).toBeGreaterThanOrEqual(26);
    expect(title.fontFamily).toBe(getAppTextStyle('screenTitle', Platform.OS === 'android' ? 'android' : 'ios').fontFamily);
    let body = view.getByTestId('paywall-hero').parent;
    while (body && typeof body.type !== 'string') body = body.parent;
    expect(StyleSheet.flatten(body!.props.style).paddingTop).toBe(4);
  });

  it('keeps the headline navy and centred: the violet is carried by the badge and the actions', async () => {
    const view = await renderPaywall();
    const title = StyleSheet.flatten(view.getByTestId('paywall-title').props.style);
    expect(title.color).toBe(semanticColors.foreground);
    expect(title.textAlign).toBe('center');
  });
});

describe('PaywallScreen — plan selection', () => {
  it('preselects the annual plan when both are offered, recommended, and speaks the selection', async () => {
    const view = await renderPaywall();

    expect(view.getByTestId('paywall-plans').props.accessibilityRole).toBe('radiogroup');
    expect(view.getByTestId('paywall-plan-annual').props.accessibilityRole).toBe('radio');
    expect(selectedState(view, 'annual')).toEqual({ checked: true, selected: true });
    expect(selectedState(view, 'monthly')).toEqual({ checked: false, selected: false });
    expect(view.getByTestId('paywall-plan-annual-recommended')).toBeTruthy();
    expect(view.queryByTestId('paywall-plan-monthly-recommended')).toBeNull();
    expect(view.getByText('Recommandé')).toBeTruthy();
    expect(view.getByText('Économisez 17 %')).toBeTruthy();
    expect(view.getAllByText('14 jours gratuits')).toHaveLength(2);
    expect(textOf(view.getByTestId('paywall-plan-annual-price'))).toBe('129 €');
    expect(textOf(view.getByTestId('paywall-plan-monthly-price'))).toBe('12,99 €');
    expect(textOf(view.getByTestId('paywall-plan-annual-equivalent'))).toBe('soit 10,75 € par mois');
    expect(
      plain(view.getByTestId('paywall-plan-annual').props.accessibilityLabel),
    ).toBe('Formule annuelle, 129 € par an, soit 10,75 € par mois, Économisez 17 %, 14 jours gratuits, recommandée');
  });

  it('selecting the monthly plan updates the selection, the ring and the primary action', async () => {
    const selection = jest.spyOn(haptics, 'selection').mockImplementation(() => {});
    const onSubscribe = jest.fn();
    const view = await renderPaywall({ onSubscribe });

    expect(view.getByText('Essayer gratuitement 14 jours')).toBeTruthy();
    expect(textOf(view.getByTestId('paywall-subscribe-footnote'))).toBe('Puis 129 € par an.');

    await press(view.getByTestId('paywall-plan-monthly'));

    expect(selectedState(view, 'monthly')).toEqual({ checked: true, selected: true });
    expect(selectedState(view, 'annual')).toEqual({ checked: false, selected: false });
    expect(textOf(view.getByTestId('paywall-subscribe-footnote'))).toBe('Puis 12,99 € par mois.');
    expect(selection).toHaveBeenCalledTimes(1);

    // Pressing the selected plan again changes nothing and ticks nothing.
    await press(view.getByTestId('paywall-plan-monthly'));
    expect(selection).toHaveBeenCalledTimes(1);

    await press(view.getByTestId('paywall-subscribe'));
    expect(onSubscribe).toHaveBeenCalledWith('monthly');
    expect(onSubscribe).toHaveBeenCalledTimes(1);
  });

  it('subscribes to the preselected annual plan and never reports a purchase itself', async () => {
    const onSubscribe = jest.fn();
    const view = await renderPaywall({ onSubscribe });

    await press(view.getByTestId('paywall-subscribe'));
    expect(onSubscribe).toHaveBeenCalledWith('annual');
    // Nothing on the screen claims a purchase happened: the store integration will say.
    expect(view.queryByText(/abonnement .* est actif/)).toBeNull();
    expect(view.getByText('Essayer gratuitement 14 jours')).toBeTruthy();
  });

  it('honours an opening selection and falls back when it is not offered', async () => {
    const view = await renderPaywall({ initialPlan: 'monthly' });
    expect(selectedState(view, 'monthly')).toEqual({ checked: true, selected: true });

    const annualOnly = await render(
      <PaywallScreen
        context={paywallContextFixtures.initialOffer}
        initialPlan="monthly"
        offering={paywallOfferingFixtures.annualOnly}
      />,
    );
    await act(async () => {});
    expect(selectedState(annualOnly, 'annual')).toEqual({ checked: true, selected: true });
    expect(annualOnly.queryByTestId('paywall-plan-monthly')).toBeNull();
    expect(annualOnly.queryByText('Recommandé')).toBeNull();
    expect(annualOnly.queryByText(/Économisez/)).toBeNull();
  });
});

describe('PaywallScreen — offering states', () => {
  it('shows no trial and no trial action when the store says ineligible', async () => {
    const view = await renderPaywall({ offering: paywallOfferingFixtures.frenchTrialIneligible, onSubscribe: jest.fn() });
    expect(view.queryByText(/gratuit/)).toBeNull();
    expect(view.getByText('S’abonner à BeautIzzy Plus')).toBeTruthy();
    expect(textOf(view.getByTestId('paywall-subscribe-footnote'))).toBe('129 € par an.');
  });

  it('formats a foreign storefront with the store strings', async () => {
    const view = await renderPaywall({ offering: paywallOfferingFixtures.usDollars, onSubscribe: jest.fn() });
    expect(textOf(view.getByTestId('paywall-plan-annual-price'))).toBe('$149.99');
    expect(textOf(view.getByTestId('paywall-plan-monthly-price'))).toBe('$14.99');
    expect(textOf(view.getByTestId('paywall-subscribe-footnote'))).toBe('$149.99 par an.');
  });

  it('with the unconfigured offering of the application, shows no price, no plan and no purchase action', async () => {
    const onSubscribe = jest.fn();
    const view = await renderPaywall({
      offering: unconfiguredPaywallOffering,
      onSubscribe,
      onRetryOffering: jest.fn(),
      onContinueReadOnly: jest.fn(),
    });

    expect(view.queryByTestId('paywall-plans')).toBeNull();
    expect(view.queryByTestId('paywall-subscribe')).toBeNull();
    expect(view.queryByTestId('paywall-retry-offering')).toBeNull();
    expect(view.queryByText(/€/)).toBeNull();
    expect(view.getByText('Offres bientôt disponibles')).toBeTruthy();
    expect(view.getByText(/ne sont pas encore proposées dans cette version/)).toBeTruthy();
    expect(onSubscribe).not.toHaveBeenCalled();
    // Reading stays possible: the way out is there.
    expect(view.getByText('Explorer sans abonnement')).toBeTruthy();
  });

  it('with the store unavailable, offers a retry only when the caller can retry, and no purchase', async () => {
    const onRetryOffering = jest.fn();
    const view = await renderPaywall({ offering: paywallOfferingFixtures.storeUnavailable, onSubscribe: jest.fn(), onRetryOffering });

    expect(view.getByText('Offres indisponibles pour le moment')).toBeTruthy();
    expect(view.queryByTestId('paywall-subscribe')).toBeNull();
    expect(view.queryByText(/€/)).toBeNull();
    await press(view.getByTestId('paywall-retry-offering'));
    expect(onRetryOffering).toHaveBeenCalledTimes(1);

    const silent = await render(
      <PaywallScreen context={paywallContextFixtures.initialOffer} offering={paywallOfferingFixtures.storeUnavailable} />,
    );
    await act(async () => {});
    expect(silent.queryByTestId('paywall-retry-offering')).toBeNull();
  });

  it('while the offering loads, the action is disabled and says so, without a phantom price', async () => {
    const onSubscribe = jest.fn();
    const view = await renderPaywall({ offering: paywallOfferingFixtures.loading, onSubscribe });

    expect(view.getByTestId('paywall-plans-loading')).toBeTruthy();
    expect(view.getByTestId('paywall-plans-loading-pending')).toBeTruthy();
    const action = view.getByTestId('paywall-subscribe');
    expect(action.props.accessibilityState.disabled).toBe(true);
    expect(view.getAllByText('Chargement des offres…').length).toBeGreaterThan(0);
    expect(view.queryByTestId('paywall-subscribe-footnote')).toBeNull();
    expect(view.queryByText(/€/)).toBeNull();
    await press(action);
    expect(onSubscribe).not.toHaveBeenCalled();
  });

  it('without a purchase entry point, the action is disabled and identified as not available', async () => {
    const view = await renderPaywall();
    const action = view.getByTestId('paywall-subscribe');
    expect(action.props.accessibilityState.disabled).toBe(true);
    expect(view.getByText('S’abonner à BeautIzzy Plus')).toBeTruthy();
    expect(textOf(view.getByTestId('paywall-subscribe-footnote'))).toBe('Achat non disponible dans cette version.');
    // The store-derived trial stays on the cards; the disabled action promises nothing.
    expect(within(action).queryByText(/gratuit/)).toBeNull();
  });
});

describe('PaywallScreen — ways out', () => {
  it('« Explorer sans abonnement » is visible at once and reports the read-only intent, nothing else', async () => {
    const onContinueReadOnly = jest.fn();
    const onSubscribe = jest.fn();
    const onClose = jest.fn();
    const view = await renderPaywall({ onContinueReadOnly, onSubscribe, onClose });

    const explore = view.getByTestId('paywall-explore');
    expect(within(explore).getByText('Explorer sans abonnement')).toBeTruthy();
    expect(explore.props.accessibilityLabel).toBe('Explorer sans abonnement, en lecture seule');
    // The read-only limit lives with the action, as its quiet caption and spoken hint.
    const caption = 'Sans abonnement, vous pouvez consulter votre activité, sans la modifier.';
    expect(within(explore).getByText(caption)).toBeTruthy();
    expect(explore.props.accessibilityHint).toBe(caption);
    expect(within(view.getByTestId('paywall-lead')).queryByText(/lecture seule/)).toBeNull();
    await press(explore);
    expect(onContinueReadOnly).toHaveBeenCalledTimes(1);
    expect(onSubscribe).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders the close and back controls only when the caller handles them', async () => {
    const onClose = jest.fn();
    const onBack = jest.fn();
    const view = await renderPaywall({ onClose, onBack });

    await press(view.getByLabelText('Fermer'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await press(view.getByLabelText('Retour'));
    expect(onBack).toHaveBeenCalledTimes(1);

    const bare = await render(
      <PaywallScreen context={paywallContextFixtures.initialOffer} offering={paywallOfferingFixtures.frenchWithTrial} />,
    );
    await act(async () => {});
    expect(bare.queryByLabelText('Fermer')).toBeNull();
    expect(bare.queryByLabelText('Retour')).toBeNull();
    expect(bare.queryByTestId('paywall-explore')).toBeNull();
  });

  it('shows restore, terms and privacy only once their integrations are provided', async () => {
    const onRestorePurchases = jest.fn();
    const onOpenTerms = jest.fn();
    const onOpenPrivacy = jest.fn();
    const view = await renderPaywall({ onRestorePurchases, onOpenTerms, onOpenPrivacy });

    await press(view.getByTestId('paywall-link-restore'));
    await press(view.getByTestId('paywall-link-terms'));
    await press(view.getByTestId('paywall-link-privacy'));
    expect(onRestorePurchases).toHaveBeenCalledTimes(1);
    expect(onOpenTerms).toHaveBeenCalledTimes(1);
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('paywall-link-restore').props.accessibilityRole).toBe('link');

    const none = await render(
      <PaywallScreen context={paywallContextFixtures.initialOffer} offering={paywallOfferingFixtures.frenchWithTrial} />,
    );
    await act(async () => {});
    expect(none.queryByTestId('paywall-links')).toBeNull();
  });
});

describe('PaywallScreen — contexts', () => {
  it('an expired subscription: data preserved, the subscription no longer active, plans, and a return to the data', async () => {
    const onContinueReadOnly = jest.fn();
    const view = await renderPaywall({ context: paywallContextFixtures.expired, onContinueReadOnly });

    const notice = view.getByTestId('paywall-notice');
    expect(within(notice).getByText('Vos données sont conservées.')).toBeTruthy();
    expect(within(notice).getByText('Votre abonnement BeautIzzy Plus n’est plus actif.')).toBeTruthy();
    expect(
      within(notice).getByText(
        'Vous pouvez toujours consulter vos rendez-vous, votre clientèle et vos chiffres. Les modifications nécessitent BeautIzzy Plus.',
      ),
    ).toBeTruthy();
    expect(view.getByTestId('paywall-plans')).toBeTruthy();
    expect(view.queryByTestId('paywall-explore')).toBeNull();
    // No first-offer lead for a returning account, and no caption under the return action.
    expect(view.queryByTestId('paywall-lead')).toBeNull();
    expect(view.queryByText(/Votre espace est prêt/)).toBeNull();
    expect(view.getByTestId('paywall-return').props.accessibilityHint).toBeUndefined();
    expect(view.queryByText(/sans la modifier/)).toBeNull();
    await press(view.getByTestId('paywall-return'));
    expect(onContinueReadOnly).toHaveBeenCalledTimes(1);
    expect(view.getByText('Revenir à mes données')).toBeTruthy();
  });

  it('a never-subscribed account reads differently from an expired one and is never told it expired', async () => {
    const view = await renderPaywall({ context: paywallContextFixtures.neverSubscribed });
    const notice = view.getByTestId('paywall-notice');
    expect(within(notice).getByText('Votre compte n’a pas d’abonnement BeautIzzy Plus.')).toBeTruthy();
    expect(within(notice).queryByText(/plus actif/)).toBeNull();
    expect(view.queryByText(/expir/i)).toBeNull();
  });

  it('an active subscriber meets no plan, no price and no upsell — only a way to continue', async () => {
    const onClose = jest.fn();
    const onSubscribe = jest.fn();
    const view = await renderPaywall({ context: paywallContextFixtures.entitled, onClose, onSubscribe });

    expect(view.getByRole('header', { name: 'Votre abonnement BeautIzzy Plus est actif.' })).toBeTruthy();
    expect(view.queryByTestId('paywall-plans')).toBeNull();
    expect(view.queryByTestId('paywall-subscribe')).toBeNull();
    expect(view.queryByTestId('paywall-benefits')).toBeNull();
    expect(view.queryByText(/€/)).toBeNull();
    expect(view.queryByText('Explorer sans abonnement')).toBeNull();
    await press(view.getByTestId('paywall-continue'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubscribe).not.toHaveBeenCalled();
  });

  it('a pending verification claims nothing, shows no price, and never leaves the professional stuck', async () => {
    const onClose = jest.fn();
    const view = await renderPaywall({ context: paywallContextFixtures.verifying, offering: paywallOfferingFixtures.loading, onClose });

    expect(view.getByText('Vérification de votre abonnement…')).toBeTruthy();
    expect(view.getByTestId('paywall-notice-pending')).toBeTruthy();
    expect(view.queryByText(/plus actif|expir|pas d’abonnement/i)).toBeNull();
    expect(view.queryByTestId('paywall-plans')).toBeNull();
    expect(view.queryByTestId('paywall-plans-loading')).toBeNull();
    expect(view.queryByTestId('paywall-subscribe')).toBeNull();
    expect(view.queryByText(/€/)).toBeNull();
    await press(view.getByTestId('paywall-continue'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PaywallScreen — activity and environment notice (Phase 6.3)', () => {
  it.each([
    ['purchasing', 'Achat en cours…'],
    ['restoring', 'Restauration en cours…'],
    ['verifying', 'Vérification de l’abonnement…'],
  ] as const)('with %s in progress, the primary action is disabled, named, without footnote, and starts nothing', async (activity, title) => {
    const onSubscribe = jest.fn();
    const onRestorePurchases = jest.fn();
    const view = await renderPaywall({ activity, onSubscribe, onRestorePurchases });

    const action = view.getByTestId('paywall-subscribe');
    expect(action.props.accessibilityState.disabled).toBe(true);
    expect(within(action).getByText(title)).toBeTruthy();
    expect(view.queryByTestId('paywall-subscribe-footnote')).toBeNull();
    await press(action);
    expect(onSubscribe).not.toHaveBeenCalled();
    // The restore link is inert as well: no second transaction from the paywall.
    const restore = view.getByTestId('paywall-link-restore');
    expect(restore.props.accessibilityState).toEqual({ disabled: true });
    await press(restore);
    expect(onRestorePurchases).not.toHaveBeenCalled();
    // The plans stay drawn exactly as before: no redesign, the professional only waits.
    expect(view.getByTestId('paywall-plan-annual')).toBeTruthy();
    expect(view.getByTestId('paywall-plan-monthly')).toBeTruthy();
    expect(view.getByTestId('paywall-hero')).toBeTruthy();
  });

  it('without an activity, the action and the restore link work as before', async () => {
    const onSubscribe = jest.fn();
    const onRestorePurchases = jest.fn();
    const view = await renderPaywall({ onSubscribe, onRestorePurchases });
    await press(view.getByTestId('paywall-subscribe'));
    expect(onSubscribe).toHaveBeenCalledWith('annual');
    expect(view.getByTestId('paywall-link-restore').props.accessibilityState?.disabled).toBeFalsy();
    await press(view.getByTestId('paywall-link-restore'));
    expect(onRestorePurchases).toHaveBeenCalledTimes(1);
  });

  it('draws an environment notice as a quiet reassuring card under the hero, and none by default', async () => {
    const view = await renderPaywall({
      environmentNotice: { title: 'Achat de test — aucun paiement réel', lines: ['RevenueCat Test Store.'] },
    });
    const notice = view.getByTestId('paywall-environment-notice');
    expect(within(notice).getByText('Achat de test — aucun paiement réel')).toBeTruthy();
    expect(within(notice).getByText('RevenueCat Test Store.')).toBeTruthy();
    expect(view.queryByTestId('paywall-environment-notice-pending')).toBeNull();
    expect(view.getByTestId('paywall-plans')).toBeTruthy();

    const none = await renderPaywall();
    expect(none.queryByTestId('paywall-environment-notice')).toBeNull();
  });
});
