// Prestations & tarifs › Catégories: the app's list management (shared drag-and-drop reorder,
// shared swipe-to-delete, their haptics), deletion that never deletes a prestation, and the « + »
// that opens category creation directly (prestations are created from Prestations & tarifs).

import { act, fireEvent, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { State, type PanGesture } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import type { Service } from '@/domain/appointments';
import type { ServiceCategory } from '@/domain/services';
import { ServiceCatalogProvider, useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import type { ServiceCatalogSessionValue } from '@/features/services/session/types';
import type { FirstRunSeed } from '@/persistence/seed';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { settleFloatingReveal } from '@/shared/ui/testing/sheet-transitions';
import { FORM_SCROLL_REVEAL_MARGIN } from '@/shared/ui/FormScrollView';
import { scrollToMock, settleFormScroll, stageFocusedInput } from '@/shared/ui/testing/form-scroll';
import { captureKeyboardEvents } from '@/shared/ui/testing/sheet-keyboard';

import { ServiceCategoriesScreen } from '../ServiceCategoriesScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDragStart = jest.spyOn(haptics, 'dragStart').mockImplementation();
const mockDragEnd = jest.spyOn(haptics, 'dragEnd').mockImplementation();
const mockWarning = jest.spyOn(haptics, 'warning').mockImplementation();
const mockSuccess = jest.spyOn(haptics, 'success').mockImplementation();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View: NativeView } = jest.requireActual('react-native') as typeof import('react-native');
  const AnimatedView = (props: { readonly children?: React.ReactNode }) => React.createElement(NativeView, props);
  const createAnimationBuilder = () => {
    const builder = { duration: () => builder, easing: () => builder };
    return builder;
  };
  return {
    __esModule: true,
    default: Object.assign(AnimatedView, { View: AnimatedView, createAnimatedComponent: (component: unknown) => component }),
    FadeIn: createAnimationBuilder(),
    FadeOut: createAnimationBuilder(),
    LinearTransition: createAnimationBuilder(),
    Easing: { bezier: () => () => 0 },
    interpolate: (value: number, input: number[], output: number[]) =>
      value <= input[0] ? output[0] : output[output.length - 1],
    Extrapolation: { CLAMP: 'clamp' },
    useAnimatedStyle: (style: () => object) => style(),
    useAnimatedReaction: (prepare: () => unknown, react: (value: unknown, previous: unknown) => void) =>
      react(prepare(), null),
    useEvent: () => () => undefined,
    useReducedMotion: () => false,
    useSharedValue: (init: unknown) => {
      const [shared] = React.useState(() => {
        const holder = {
          value: init,
          get: () => holder.value,
          set: (next: unknown) => {
            holder.value = next;
          },
        };
        return holder;
      });
      return shared;
    },
    withTiming: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withDelay: (_delay: number, value: unknown) => value,
    cancelAnimation: () => undefined,
  };
});
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: never[]) => void, ...args: never[]) => fn(...args),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  jest.requireActual('@/shared/ui/testing/mock-reanimated-swipeable'),
);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// Jest lays nothing out: the keyboard test states the geometry itself.
jest.mock('@/shared/ui/form-scroll-geometry');
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const MockModal = ({ visible, children }: { readonly visible?: boolean; readonly children?: React.ReactNode }) =>
    visible ? React.createElement(View, null, children) : null;
  return { __esModule: true, default: MockModal };
});

const BUSINESS = testBusiness.id;
const service = (id: string, name: string, extra: Partial<Service> = {}): Service => ({
  id,
  businessId: BUSINESS,
  name,
  type: 'SERVICE',
  price: 40,
  phases: [{ id: `${id}-phase`, name, durationMinutes: 45, requiresStaff: true }],
  active: true,
  ...extra,
});
const category = (id: string, name: string, position: number): ServiceCategory => ({
  id,
  businessId: BUSINESS,
  name,
  position,
});

const CATEGORIES = [
  category('cat-gel', 'Extensions et poses en gel', 0),
  category('cat-feet', 'Beauté des pieds', 1),
  category('cat-art', 'Nail art et modèles', 2),
];
const SERVICES = [
  service('gel-set', 'Pose complète gel', { categoryId: 'cat-gel' }),
  service('infill', 'Remplissage gel', { categoryId: 'cat-gel' }),
  service('old', 'Ancienne pose', { categoryId: 'cat-gel', active: false }),
  service('feet', 'Semi-permanent pieds', { categoryId: 'cat-feet' }),
  service('repair', 'Réparation d’un ongle'),
];

const seed = (categories: readonly ServiceCategory[]) => (): FirstRunSeed => ({
  clients: [],
  services: SERVICES,
  serviceCategories: categories,
  products: [],
  appointments: [],
  sales: [],
});

const session: { current?: ServiceCatalogSessionValue } = {};
function SessionProbe() {
  const value = useServiceCatalog();
  useEffect(() => {
    session.current = value;
  });
  return <Text testID="probe-categories">{value.categories.map((entry) => entry.name).join('|')}</Text>;
}

function renderScreen(categories: readonly ServiceCategory[] = CATEGORIES, startCreating = false) {
  return render(
    <TestPersistenceProvider business={{ ...testBusiness, activityType: 'NAILS' }} createSeed={seed(categories)}>
      <ServiceCatalogProvider>
        <ServiceCategoriesScreen startCreating={startCreating} />
        <SessionProbe />
      </ServiceCatalogProvider>
    </TestPersistenceProvider>,
  );
}

const press = (element: Parameters<typeof fireEvent.press>[0]) =>
  act(async () => {
    fireEvent.press(element);
  });
const type = (element: Parameters<typeof fireEvent.changeText>[0], text: string) =>
  act(async () => {
    fireEvent.changeText(element, text);
  });
const order = (view: Awaited<ReturnType<typeof renderScreen>>) => view.getByTestId('probe-categories').props.children;

/** Drives the shared reorder handle of one category row: long-press pan, then release. */
function dragCategory(categoryId: string, translationY: number) {
  fireGestureHandler<PanGesture>(getByGestureTestId(`reorder-${categoryId}`), [
    { state: State.BEGAN },
    { state: State.ACTIVE, translationY },
    { translationY },
    { state: State.END, translationY },
  ]);
}

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  mockDragStart.mockClear();
  mockDragEnd.mockClear();
  mockWarning.mockClear();
  mockSuccess.mockClear();
  session.current = undefined;
});

describe('Catégories screen', () => {
  it('lists the categories as one grouped list with the shared drag handle and swipe-to-delete, no arrows', async () => {
    const view = await renderScreen();
    // Inactive prestations count too: they keep their category.
    expect(view.getByLabelText('Extensions et poses en gel, 3 prestations')).toBeTruthy();
    expect(view.getByLabelText('Beauté des pieds, 1 prestation')).toBeTruthy();
    expect(view.getByLabelText('Nail art et modèles, Aucune prestation')).toBeTruthy();
    for (const entry of CATEGORIES) {
      expect(view.getByLabelText(`Déplacer ${entry.name}`)).toBeTruthy();
      expect(view.getByLabelText(`Supprimer la catégorie ${entry.name}`)).toBeTruthy();
      expect(view.getByTestId(`service-category-icon-${entry.id}`, { includeHiddenElements: true })).toBeTruthy();
    }
    expect(view.queryByLabelText(/^Monter /)).toBeNull();
    expect(view.queryByLabelText(/^Descendre /)).toBeNull();
    expect(view.queryByTestId('service-category-up-cat-gel')).toBeNull();
  });

  it('reorders by drag and drop with the drag haptics, and persists only through the session', async () => {
    const view = await renderScreen();
    await act(async () => {
      dragCategory('cat-art', -100);
    });
    expect(order(view)).toBe('Nail art et modèles|Extensions et poses en gel|Beauté des pieds');
    expect(session.current!.categories.map((entry) => [entry.id, entry.position])).toEqual([
      ['cat-art', 0],
      ['cat-gel', 1],
      ['cat-feet', 2],
    ]);
    expect(mockDragStart).toHaveBeenCalledTimes(1);
    expect(mockDragEnd).toHaveBeenCalledTimes(1);

    await act(async () => {
      dragCategory('cat-art', 100);
    });
    expect(order(view)).toBe('Extensions et poses en gel|Beauté des pieds|Nail art et modèles');
    // Services keep their category id whatever the order.
    expect(session.current!.getServiceById('feet')?.categoryId).toBe('cat-feet');
  });

  it('moves a category one place with the handle’s accessibility actions', async () => {
    const view = await renderScreen();
    const handle = view.getByLabelText('Déplacer Beauté des pieds');
    expect(handle.props.accessibilityRole).toBe('adjustable');
    await act(async () => {
      fireEvent(handle, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    });
    expect(order(view)).toBe('Beauté des pieds|Extensions et poses en gel|Nail art et modèles');
    await act(async () => {
      fireEvent(view.getByLabelText('Déplacer Beauté des pieds'), 'accessibilityAction', {
        nativeEvent: { actionName: 'decrement' },
      });
    });
    // Already first: nothing moves.
    expect(order(view)).toBe('Beauté des pieds|Extensions et poses en gel|Nail art et modèles');
  });

  it('a swipe asks first, says the prestations become « Sans catégorie », and deletes none', async () => {
    const view = await renderScreen();
    await press(view.getByTestId('service-category-row-cat-gel-swipe-full'));
    expect(view.getByText('Supprimer « Extensions et poses en gel » ?')).toBeTruthy();
    expect(view.getByText(/Ses 3 prestations deviendront « Sans catégorie »/)).toBeTruthy();
    // The row closed again: nothing is deleted before the confirmation.
    expect(view.getByTestId('service-category-row-cat-gel-closed').props.children).toBe('1');
    expect(session.current!.categories).toHaveLength(3);

    await press(view.getByTestId('cancel-service-category-deletion'));
    expect(session.current!.categories).toHaveLength(3);
    expect(mockWarning).not.toHaveBeenCalled();

    await press(view.getByTestId('service-category-row-cat-gel-swipe-partial'));
    await press(view.getByTestId('delete-service-category-cat-gel'));
    await press(view.getByTestId('confirm-service-category-deletion'));
    expect(order(view)).toBe('Beauté des pieds|Nail art et modèles');
    expect(session.current!.services).toHaveLength(SERVICES.length);
    for (const id of ['gel-set', 'infill', 'old']) expect(session.current!.getServiceById(id)).not.toHaveProperty('categoryId');
    expect(session.current!.getServiceById('feet')?.categoryId).toBe('cat-feet');
    expect(mockWarning).toHaveBeenCalledTimes(1);
  });

  it('an empty category is deleted with a confirmation that says nothing else changes', async () => {
    const view = await renderScreen();
    await press(view.getByTestId('service-category-row-cat-art-swipe-full'));
    expect(view.getByText('Elle ne contient aucune prestation. Rien d’autre ne change.')).toBeTruthy();
    await press(view.getByTestId('confirm-service-category-deletion'));
    expect(order(view)).toBe('Extensions et poses en gel|Beauté des pieds');
  });

  it('edits a category in place with explicit labels; while editing the list neither drags nor swipes', async () => {
    const view = await renderScreen();
    await press(view.getByTestId('service-category-cat-gel'));
    expect(view.getByText('Nom de la catégorie')).toBeTruthy();
    expect(view.getByText('Description de la catégorie (facultative)')).toBeTruthy();
    expect(view.queryByText('Description (facultative)')).toBeNull();
    expect(view.queryByLabelText(/^Déplacer /)).toBeNull();
    expect(view.queryByTestId('service-category-row-cat-feet-swipe-full')).toBeNull();

    await type(view.getByTestId('service-category-edit-name'), 'Poses en gel');
    await type(view.getByTestId('service-category-edit-description'), 'Avec ou sans rallongement.');
    await press(view.getByTestId('service-category-save'));
    expect(order(view)).toBe('Poses en gel|Beauté des pieds|Nail art et modèles');
    expect(session.current!.getCategoryById('cat-gel')?.description).toBe('Avec ou sans rallongement.');
    expect(session.current!.getServiceById('gel-set')?.categoryId).toBe('cat-gel');
    expect(view.getByLabelText('Déplacer Poses en gel')).toBeTruthy();

    // The edit card keeps a gesture-free way to delete.
    await press(view.getByTestId('service-category-cat-feet'));
    await press(view.getByTestId('service-category-delete'));
    await press(view.getByTestId('confirm-service-category-deletion'));
    expect(order(view)).toBe('Poses en gel|Nail art et modèles');
  });

  it('the « + » opens the « Nouvelle catégorie » card directly: no menu, no « Nouvelle prestation »', async () => {
    const view = await renderScreen();
    await settleFloatingReveal();
    expect(view.queryByTestId('service-category-new')).toBeNull();
    expect(view.getByTestId('service-categories-add').props.accessibilityLabel).toBe('Nouvelle catégorie');

    await press(view.getByTestId('service-categories-add'));
    expect(view.queryByTestId('service-categories-add-menu')).toBeNull();
    expect(view.queryByText('Nouvelle prestation')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    expect(view.getAllByTestId('service-category-new')).toHaveLength(1);
    expect(view.getByTestId('service-category-new-name').props.placeholder).toBe('Ex. Extensions et poses en gel');
    expect(view.getByText('Description de la catégorie (facultative)')).toBeTruthy();

    // Pressing « + » again keeps the card and what was typed: never a second card.
    await type(view.getByTestId('service-category-new-name'), 'Remp');
    await press(view.getByTestId('service-categories-add'));
    expect(view.getAllByTestId('service-category-new')).toHaveLength(1);
    expect(view.getByTestId('service-category-new-name').props.value).toBe('Remp');

    await press(view.getByTestId('service-category-new-save'));
    expect(view.queryByText('Indiquez un nom de catégorie.')).toBeNull();
    expect(order(view)).toBe('Extensions et poses en gel|Beauté des pieds|Nail art et modèles|Remp');
    expect(view.queryByTestId('service-category-new')).toBeNull();
  });

  it('validates and creates a described category from the card', async () => {
    const view = await renderScreen();
    await settleFloatingReveal();
    await press(view.getByTestId('service-categories-add'));
    await press(view.getByTestId('service-category-new-save'));
    expect(view.getByText('Indiquez un nom de catégorie.')).toBeTruthy();
    await type(view.getByTestId('service-category-new-name'), 'Remplissages');
    await type(view.getByTestId('service-category-new-description'), 'Toutes les 3 semaines.');
    await press(view.getByTestId('service-category-new-save'));
    expect(order(view)).toBe('Extensions et poses en gel|Beauté des pieds|Nail art et modèles|Remplissages');
    expect(view.getByLabelText('Remplissages, Aucune prestation')).toBeTruthy();
    expect(session.current!.categories.at(-1)?.description).toBe('Toutes les 3 semaines.');
    expect(mockSuccess).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('service-category-new')).toBeNull();
  });

  it('arrives from Prestations & tarifs with the card open; cancelling stays on a coherent list', async () => {
    const view = await renderScreen(CATEGORIES, true);
    expect(view.getAllByTestId('service-category-new')).toHaveLength(1);
    // While creating, the list neither drags nor swipes.
    expect(view.queryByLabelText(/^Déplacer /)).toBeNull();

    await type(view.getByTestId('service-category-new-name'), 'Brouillon');
    await press(view.getByTestId('service-category-new-cancel'));
    expect(view.queryByTestId('service-category-new')).toBeNull();
    expect(order(view)).toBe('Extensions et poses en gel|Beauté des pieds|Nail art et modèles');
    expect(view.getByLabelText('Déplacer Beauté des pieds')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    // Reopening starts from an empty card.
    await settleFloatingReveal();
    await press(view.getByTestId('service-categories-add'));
    expect(view.getByTestId('service-category-new-name').props.value).toBe('');
  });

  it('arrives with the card open even when no category exists yet, and cancelling shows the empty state', async () => {
    const view = await renderScreen([], true);
    expect(view.getByTestId('service-category-new')).toBeTruthy();
    expect(view.queryByTestId('service-categories-empty')).toBeNull();
    await press(view.getByTestId('service-category-new-cancel'));
    expect(view.getByTestId('service-categories-empty')).toBeTruthy();
  });

  it('starts empty for an existing Business: no category is ever imposed', async () => {
    const view = await renderScreen([]);
    expect(view.getByTestId('service-categories-empty')).toBeTruthy();
    expect(
      view.getByText('Créez votre première catégorie avec le bouton +, par exemple « Extensions et poses en gel ».'),
    ).toBeTruthy();
    expect(view.queryByTestId('service-categories-list')).toBeNull();
  });
});

describe('Catégories screen — keyboard', () => {
  it('keeps the inline category name visible above the keyboard; « + » still brings the card into view', async () => {
    const keyboard = captureKeyboardEvents();
    scrollToMock().mockClear();
    const view = await renderScreen();
    await settleFloatingReveal();
    await press(view.getByTestId('service-categories-add'));
    // The card sits at the top of the list: the screen scrolls there through the form's ref.
    expect(scrollToMock()).toHaveBeenCalledWith({ y: 0, animated: true });
    scrollToMock().mockClear();

    // A page without a keyboard-avoiding shell: the scroll runs to the window
    // bottom (820) and the test keyboard top is at 500 → 320 pt covered.
    const staged = stageFocusedInput({ viewport: { top: 120, height: 700 }, input: { top: 620, height: 44 } });
    await act(async () => fireEvent(view.getByTestId('service-category-new-name'), 'focus'));
    await keyboard.show();
    await settleFormScroll();

    expect(view.getByTestId('form-scroll-keyboard-spacer')).toHaveStyle({ height: 320 });
    expect(scrollToMock()).toHaveBeenCalledWith({ y: 664 + FORM_SCROLL_REVEAL_MARGIN - 380, animated: true });
    await type(view.getByTestId('service-category-new-name'), 'Remplissages');
    expect(view.getByTestId('service-category-new-name').props.value).toBe('Remplissages');

    await keyboard.hide();
    expect(view.queryByTestId('form-scroll-keyboard-spacer')).toBeNull();
    staged.restore();
    keyboard.restore();
  });
});
