import { act, fireEvent, render } from '@testing-library/react-native';

import { haptics } from '@/shared/lib/haptics';

import { FloatingCreateButton } from '../FloatingCreateButton';
import { settleSheetTransition } from '../testing/sheet-transitions';
import { floatingAction } from '../theme';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

// Focus lifecycle under test control: the mock runs the focus effect on mount
// and exposes it so a test can blur (run the cleanup) and refocus.
const mockFocus: {
  effect?: () => void | (() => void);
  cleanup?: void | (() => void);
} = {};

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(() => {
      mockFocus.effect = effect;
      mockFocus.cleanup = effect();
      return () => {
        mockFocus.cleanup?.();
        mockFocus.cleanup = undefined;
      };
    }, [effect]);
  },
}));

const selectionHaptic = jest.spyOn(haptics, 'selection').mockImplementation();

async function blur() {
  await act(async () => {
    mockFocus.cleanup?.();
    mockFocus.cleanup = undefined;
  });
}

async function refocus() {
  await act(async () => {
    mockFocus.cleanup = mockFocus.effect?.();
  });
}

/** Lets the reveal delay and animation complete. */
async function settleReveal() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, floatingAction.revealDelay + 220));
  });
}

describe('FloatingCreateButton', () => {
  beforeEach(() => selectionHaptic.mockClear());

  it('starts hidden and unavailable, then reveals shortly after focus', async () => {
    const onPress = jest.fn();
    const view = await render(
      <FloatingCreateButton accessibilityLabel="Ajouter une cliente" onPress={onPress} testID="create" />,
    );

    // Hidden: no touches reach it and assistive tech does not announce it.
    expect(view.getByTestId('create-anchor').props.pointerEvents).toBe('none');
    expect(view.queryByLabelText('Ajouter une cliente')).toBeNull();
    fireEvent.press(view.getByTestId('create', { includeHiddenElements: true }));
    expect(onPress).not.toHaveBeenCalled();

    await settleReveal();

    expect(view.getByTestId('create-anchor').props.pointerEvents).toBe('box-none');
    const button = view.getByLabelText('Ajouter une cliente');
    expect(button.props.accessibilityRole).toBe('button');
    await act(async () => fireEvent.press(button));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(selectionHaptic).toHaveBeenCalledTimes(1);
  });

  it('hides at once on blur and reveals again on the next focus', async () => {
    const view = await render(
      <FloatingCreateButton accessibilityLabel="Ajouter une cliente" onPress={jest.fn()} testID="create" />,
    );
    await settleReveal();
    expect(view.getByTestId('create-anchor').props.pointerEvents).toBe('box-none');

    await blur();
    expect(view.getByTestId('create-anchor').props.pointerEvents).toBe('none');
    expect(view.queryByLabelText('Ajouter une cliente')).toBeNull();

    await refocus();
    expect(view.getByTestId('create-anchor').props.pointerEvents).toBe('none');
    await settleReveal();
    expect(view.getByTestId('create-anchor').props.pointerEvents).toBe('box-none');
    expect(view.getByLabelText('Ajouter une cliente')).toBeTruthy();
  });

  it('expands several actions into an anchored menu, runs the chosen one and closes', async () => {
    const sale = jest.fn();
    const product = jest.fn();
    const view = await render(
      <FloatingCreateButton
        accessibilityLabel="Créer"
        actions={[
          { icon: { ios: 'bag', android: 'shopping_bag' }, label: 'Nouvelle vente', onPress: sale, testID: 'sale' },
          { icon: { ios: 'shippingbox', android: 'inventory_2' }, label: 'Ajouter un produit', onPress: product, testID: 'product' },
        ]}
        testID="create"
      />,
    );
    await settleReveal();

    expect(view.queryByTestId('create-menu')).toBeNull();
    expect(view.getByTestId('create').props.accessibilityState).toMatchObject({ expanded: false });

    await act(async () => fireEvent.press(view.getByTestId('create')));
    expect(view.getByTestId('create-menu')).toBeTruthy();
    expect(view.getByTestId('create').props.accessibilityState).toMatchObject({ expanded: true });
    expect(view.getByLabelText('Nouvelle vente')).toBeTruthy();
    expect(view.getByLabelText('Ajouter un produit')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('product')));
    expect(product).toHaveBeenCalledTimes(1);
    expect(sale).not.toHaveBeenCalled();
    await settleSheetTransition();
    expect(view.queryByTestId('create-menu')).toBeNull();
  });

  it('closes on an outside tap and on a second press of the button', async () => {
    const view = await render(
      <FloatingCreateButton
        accessibilityLabel="Créer"
        actions={[{ icon: { ios: 'bag', android: 'shopping_bag' }, label: 'Nouvelle vente', onPress: jest.fn() }]}
        testID="create"
      />,
    );
    await settleReveal();

    await act(async () => fireEvent.press(view.getByTestId('create')));
    await act(async () => fireEvent.press(view.getByTestId('create-dismiss')));
    await settleSheetTransition();
    expect(view.queryByTestId('create-menu')).toBeNull();

    await act(async () => fireEvent.press(view.getByTestId('create')));
    expect(view.getByTestId('create-menu')).toBeTruthy();
    await act(async () => fireEvent.press(view.getByTestId('create')));
    await settleSheetTransition();
    expect(view.queryByTestId('create-menu')).toBeNull();
  });

  it('closes an open menu on blur and comes back as the plain + after the next reveal', async () => {
    const view = await render(
      <FloatingCreateButton
        accessibilityLabel="Créer"
        actions={[{ icon: { ios: 'bag', android: 'shopping_bag' }, label: 'Nouvelle vente', onPress: jest.fn() }]}
        testID="create"
      />,
    );
    await settleReveal();
    await act(async () => fireEvent.press(view.getByTestId('create')));
    expect(view.getByTestId('create-menu')).toBeTruthy();

    await blur();
    await settleSheetTransition();
    expect(view.queryByTestId('create-menu')).toBeNull();

    await refocus();
    await settleReveal();
    expect(view.queryByTestId('create-menu')).toBeNull();
    expect(view.getByTestId('create').props.accessibilityState).toMatchObject({ expanded: false });
  });

  it('lets a screen control the menu and asks it to close on blur', async () => {
    const onMenuOpenChange = jest.fn();
    const view = await render(
      <FloatingCreateButton
        accessibilityLabel="Créer"
        actions={[{ icon: { ios: 'bag', android: 'shopping_bag' }, label: 'Nouvelle vente', onPress: jest.fn() }]}
        menuOpen={false}
        onMenuOpenChange={onMenuOpenChange}
        testID="create"
      />,
    );
    await settleReveal();

    await act(async () => fireEvent.press(view.getByTestId('create')));
    expect(onMenuOpenChange).toHaveBeenCalledWith(true);
    expect(view.queryByTestId('create-menu')).toBeNull();

    await blur();
    expect(onMenuOpenChange).toHaveBeenLastCalledWith(false);
  });
});
