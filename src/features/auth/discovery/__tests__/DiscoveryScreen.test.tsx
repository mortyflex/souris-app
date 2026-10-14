// BeautIzzy — Product Discovery screen (behavioral, no pixel tests)

import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import DiscoveryRoute from '@/app/(auth)/index';
import { haptics } from '@/shared/lib/haptics';
import { semanticColors } from '@/shared/ui/theme';

import { DiscoveryScreen } from '../DiscoveryScreen';
import { DISCOVERY_SLIDES } from '../discovery-slides';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }),
}));

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

const { width } = Dimensions.get('window');
const SIGN_IN = 'Déjà un compte ? Se connecter';
const PAGE_LABELS = [
  'Écran 1 sur 3, Votre activité, c’est easy.',
  'Écran 2 sur 3, Vos produits, votre stock, vos ventes.',
  'Écran 3 sur 3, Découvrez ce qui fait votre succès.',
];

/** Every interaction runs inside an awaited act: React 19 flushes updates asynchronously. */
const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });

const scrollEvent = (x: number) => ({
  nativeEvent: {
    contentOffset: { x, y: 0 },
    contentSize: { width: width * DISCOVERY_SLIDES.length, height: 400 },
    layoutMeasurement: { width, height: 400 },
  },
});

async function renderDiscovery(initialPage?: number) {
  const view = await render(<DiscoveryScreen initialPage={initialPage} />);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
});

describe('DiscoveryScreen — the signed-out first-launch experience', () => {
  it('is the (auth) entry route: slide 1 opens directly, with no Welcome and no back button', async () => {
    const view = await render(<DiscoveryRoute />);
    await act(async () => {});

    expect(view.getByTestId('discovery-screen')).toBeTruthy();
    expect(view.getByLabelText(PAGE_LABELS[0]!)).toBeTruthy();
    expect(view.getByRole('header', { name: 'Votre activité, c’est easy.' })).toBeTruthy();
    expect(view.queryByTestId('onboarding-back')).toBeNull();
    expect(view.queryByTestId('welcome-screen')).toBeNull();
    expect(view.queryByText('Commencer')).toBeNull();
  });

  it('renders the three approved pages in order with their masters, every headline in navy', async () => {
    const view = await renderDiscovery();

    const pages = view.getAllByTestId(/^discovery-page-(organisation|products|insights)$/, {
      includeHiddenElements: true,
    });
    expect(pages.map((page) => page.props.testID)).toEqual([
      'discovery-page-organisation',
      'discovery-page-products',
      'discovery-page-insights',
    ]);
    for (const slide of DISCOVERY_SLIDES) {
      expect(view.getByText(slide.title, { includeHiddenElements: true })).toBeTruthy();
      expect(view.getByText(slide.description, { includeHiddenElements: true })).toBeTruthy();
      const illustration = view.getByTestId(`discovery-illustration-${slide.key}`, { includeHiddenElements: true });
      expect(illustration.props.source).toBe(slide.illustration);
      expect(illustration.props.resizeMode).toBe('contain');
      expect(illustration.props.accessibilityElementsHidden).toBe(true);
      // One hierarchy on every slide: the brand violet belongs to the mark, the actions and the pills.
      expect(view.getByText(slide.title, { includeHiddenElements: true })).toHaveStyle({
        color: semanticColors.foreground,
        textAlign: 'center',
      });
      expect(view.getByText(slide.description, { includeHiddenElements: true })).toHaveStyle({
        color: semanticColors.foregroundSoft,
      });
    }
    // Only the current page is exposed to assistive technology.
    expect(view.getByRole('header', { name: DISCOVERY_SLIDES[0]!.title })).toBeTruthy();
    expect(view.queryByRole('header', { name: DISCOVERY_SLIDES[1]!.title })).toBeNull();
    // Brand: the discreet mark, announced once; « Passer »; no setup progress.
    expect(view.getAllByLabelText('BeautIzzy')).toHaveLength(1);
    // The editorial mark, 232 dp wide on a regular phone (the jest window is 750 × 1334).
    expect(view.getByLabelText('BeautIzzy')).toHaveStyle({ width: 232 });
    expect(view.getByLabelText('Passer la présentation')).toBeTruthy();
    expect(view.queryByTestId('onboarding-progress')).toBeNull();
    expect(view.getByText('Continuer')).toBeTruthy();
  });

  it.each([0, 1, 2])('offers the direct sign-in link on slide %i, pushing sign-in with one light haptic', async (initialPage) => {
    const action = jest.spyOn(haptics, 'action');
    const view = await renderDiscovery(initialPage);

    await press(view.getByText(SIGN_IN));
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
    action.mockRestore();
  });

  it('« Continuer » moves forward one page at a time until « Créer mon compte », which pushes sign-up', async () => {
    const action = jest.spyOn(haptics, 'action');
    const view = await renderDiscovery();

    await press(view.getByTestId('discovery-primary'));
    expect(view.getByLabelText(PAGE_LABELS[1]!)).toBeTruthy();
    expect(view.getByRole('header', { name: DISCOVERY_SLIDES[1]!.title })).toBeTruthy();
    expect(view.getByText('Continuer')).toBeTruthy();
    expect(view.getByTestId('discovery-skip')).toBeTruthy();
    expect(view.getByTestId('onboarding-back')).toBeTruthy();

    await press(view.getByTestId('discovery-primary'));
    expect(view.getByLabelText(PAGE_LABELS[2]!)).toBeTruthy();
    expect(view.getByText('Créer mon compte')).toBeTruthy();
    // No redundant skip on the last page; the sign-in link stays.
    expect(view.queryByTestId('discovery-skip')).toBeNull();
    expect(view.getByText(SIGN_IN)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();

    await press(view.getByTestId('discovery-primary'));
    expect(mockPush).toHaveBeenCalledWith('/sign-up');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(3);
    action.mockRestore();
  });

  it('back returns to the previous page, and disappears on the first one', async () => {
    const view = await renderDiscovery(2);
    expect(view.getByText('Créer mon compte')).toBeTruthy();

    await press(view.getByTestId('onboarding-back'));
    expect(view.getByLabelText(PAGE_LABELS[1]!)).toBeTruthy();
    await press(view.getByTestId('onboarding-back'));
    expect(view.getByLabelText(PAGE_LABELS[0]!)).toBeTruthy();
    expect(view.queryByTestId('onboarding-back')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('« Passer » pushes sign-up and leaves the tour on its first page, so back from sign-up lands there', async () => {
    const action = jest.spyOn(haptics, 'action');
    const view = await renderDiscovery(1);

    await press(view.getByTestId('discovery-skip'));
    expect(mockPush).toHaveBeenCalledWith('/sign-up');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(view.getByLabelText(PAGE_LABELS[0]!)).toBeTruthy();
    expect(view.queryByTestId('onboarding-back')).toBeNull();
    expect(action).toHaveBeenCalledTimes(1);
    action.mockRestore();
  });

  it('a finger swipe keeps the pills, the CTA and VoiceOver on the visible page', async () => {
    const view = await renderDiscovery();
    const pager = view.getByTestId('discovery-pager');

    // Past the midpoint the next page is the nearest one.
    await act(async () => {
      fireEvent.scroll(pager, scrollEvent(width * 0.6));
    });
    expect(view.getByLabelText(PAGE_LABELS[1]!)).toBeTruthy();
    expect(view.getByTestId('onboarding-back')).toBeTruthy();

    await act(async () => {
      fireEvent(pager, 'momentumScrollEnd', scrollEvent(width * 2));
    });
    expect(view.getByLabelText(PAGE_LABELS[2]!)).toBeTruthy();
    expect(view.getByText('Créer mon compte')).toBeTruthy();
    expect(view.queryByTestId('discovery-skip')).toBeNull();

    // Back towards the first page.
    await act(async () => {
      fireEvent.scroll(pager, scrollEvent(width * 0.3));
    });
    expect(view.getByText('Continuer')).toBeTruthy();
    expect(view.getByLabelText(PAGE_LABELS[0]!)).toBeTruthy();
    expect(view.queryByTestId('onboarding-back')).toBeNull();
  });

  it('the pagination is adjustable and its pills are tappable, with a selection tick', async () => {
    const selection = jest.spyOn(haptics, 'selection');
    const view = await renderDiscovery();

    await press(view.getByTestId('discovery-page-indicator-insights'));
    expect(view.getByText('Créer mon compte')).toBeTruthy();
    expect(selection).toHaveBeenCalledTimes(1);

    const pagination = view.getByTestId('discovery-pagination');
    expect(pagination.props.accessibilityRole).toBe('adjustable');
    await act(async () => {
      fireEvent(pagination, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    });
    expect(view.getByLabelText(PAGE_LABELS[1]!)).toBeTruthy();
    await act(async () => {
      fireEvent(pagination, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    });
    expect(view.getByLabelText(PAGE_LABELS[2]!)).toBeTruthy();
    // Pressing the current pill is a no-op: no extra tick.
    await press(view.getByTestId('discovery-page-indicator-insights'));
    expect(selection).toHaveBeenCalledTimes(3);
    selection.mockRestore();
  });
});
