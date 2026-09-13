import { render } from '@testing-library/react-native';

import { StyleSheet } from 'react-native';

import { ScreenWatermarkIcon, screenWatermarkOptics, screenWatermarkSymbols } from '../ScreenWatermarkIcon';
import { watermark } from '../theme';

const mockSymbolView = jest.fn((_props: unknown) => null);
jest.mock('expo-symbols', () => ({
  SymbolView: (props: unknown) => mockSymbolView(props),
}));

describe('ScreenWatermarkIcon', () => {
  beforeEach(() => mockSymbolView.mockClear());

  it.each([
    ['agenda', { ios: 'calendar', android: 'calendar_month' }],
    ['clients', { ios: 'person.2', android: 'group' }],
    ['products', { ios: 'shippingbox', android: 'inventory_2' }],
    ['settings', { ios: 'gearshape', android: 'settings' }],
  ] as const)('maps %s to its canonical semantic symbol', async (kind, name) => {
    const view = await render(<ScreenWatermarkIcon kind={kind} />);

    // Hidden from accessibility by design: only an explicit hidden-element query finds it.
    expect(view.queryByTestId(`screen-watermark-${kind}`)).toBeNull();
    expect(view.getByTestId(`screen-watermark-${kind}`, { includeHiddenElements: true })).toBeTruthy();
    expect(screenWatermarkSymbols[kind]).toEqual(name);
    expect(mockSymbolView).toHaveBeenCalledWith(expect.objectContaining({ name }));
  });

  it('is decoration only: hidden from accessibility, pointer-transparent, absolutely positioned', async () => {
    const view = await render(<ScreenWatermarkIcon kind="agenda" />);
    const anchor = view.getByTestId('screen-watermark-agenda', { includeHiddenElements: true });

    expect(anchor.props.accessibilityElementsHidden).toBe(true);
    expect(anchor.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(anchor.props.pointerEvents).toBe('none');
    expect(anchor.props.accessibilityRole).toBeUndefined();
    expect(anchor.props.onPress).toBeUndefined();
    const style = Array.isArray(anchor.props.style) ? Object.assign({}, ...anchor.props.style) : anchor.props.style;
    expect(style.position).toBe('absolute');
    expect(style.opacity).toBeLessThan(0.2);
  });

  it('keeps the reference geometry for Produits, Agenda and Plus and applies the people optics to Clientes', async () => {
    const products = await render(<ScreenWatermarkIcon kind="products" />);
    const productsTop = StyleSheet.flatten(
      products.getByTestId('screen-watermark-products', { includeHiddenElements: true }).props.style,
    ).top as number;
    expect(mockSymbolView).toHaveBeenLastCalledWith(expect.objectContaining({ size: watermark.size }));
    expect(productsTop).toBe(-watermark.size * watermark.cropTop);
    expect(screenWatermarkOptics.agenda).toEqual(screenWatermarkOptics.products);
    expect(screenWatermarkOptics.settings).toEqual(screenWatermarkOptics.products);

    const clients = await render(<ScreenWatermarkIcon kind="clients" />);
    const anchor = clients.getByTestId('screen-watermark-clients', { includeHiddenElements: true });
    const style = StyleSheet.flatten(anchor.props.style);
    expect(mockSymbolView).toHaveBeenLastCalledWith(
      expect.objectContaining({ size: watermark.size * screenWatermarkOptics.clients.scale }),
    );
    expect(style.top).toBeLessThan(productsTop);
    // Same right-edge relationship and opacity as every other screen.
    expect(style.right).toBe(-watermark.size * watermark.cropRight);
    expect(style.opacity).toBe(watermark.opacity);
  });
});
