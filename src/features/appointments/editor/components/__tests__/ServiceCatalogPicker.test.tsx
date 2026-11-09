import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Service } from '@/domain/appointments';
import { semanticColors, serviceCategoryColors } from '@/shared/ui/theme';

import { formatCreationPrice } from '../../presentation';
import { ServiceCatalogPicker } from '../ServiceCatalogPicker';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// The quantity badge pulses with Reanimated, which cannot load under Jest.
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

const cut: Service = {
  id: 'cut',
  businessId: 'business-test',
  name: 'Coupe',
  type: 'SERVICE',
  price: 30,
  phases: [{ id: 'cut-phase', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
  active: true,
};

const blowDry: Service = {
  id: 'blow-dry',
  businessId: 'business-test',
  name: 'Brushing',
  type: 'SERVICE',
  price: 20,
  phases: [{ id: 'blow-dry-phase', name: 'Brushing', durationMinutes: 30, requiresStaff: true }],
  active: true,
};

const color: Service = {
  id: 'color',
  businessId: 'business-test',
  name: 'Couleur',
  type: 'TECHNIQUE',
  price: 60,
  phases: [
    { id: 'color-application', name: 'Application', durationMinutes: 30, requiresStaff: true },
    { id: 'color-processing', name: 'Pose', durationMinutes: 30, requiresStaff: false },
  ],
  active: true,
};

async function renderPicker(selectedServiceIds: readonly string[]) {
  const onSelectService = jest.fn();
  const view = await render(
    <ServiceCatalogPicker
      services={[cut, blowDry, color]}
      selectedServiceIds={selectedServiceIds}
      onSelectService={onSelectService}
    />,
  );
  return { view, onSelectService };
}

async function showTechniques(view: Awaited<ReturnType<typeof renderPicker>>['view']) {
  await act(async () => {
    fireEvent.press(view.getByTestId('catalog-category-TECHNIQUE'));
  });
}

const styleOf = (view: Awaited<ReturnType<typeof renderPicker>>['view'], testID: string) =>
  StyleSheet.flatten(view.getByTestId(testID).props.style);

describe('ServiceCatalogPicker — shared card catalogue', () => {
  it('lays the chosen category out as cards, two per row', async () => {
    const { view } = await renderPicker([]);

    const grid = view.getByTestId('catalog-list-SERVICE');
    const [firstRow] = grid.props.children as readonly { props: { children: unknown[] } }[];
    expect(firstRow.props.children).toHaveLength(2);
    expect(view.getByTestId('service-card-cut')).toBeTruthy();
    expect(view.getByTestId('service-card-blow-dry')).toBeTruthy();
    expect(view.queryByTestId('service-card-color')).toBeNull();
  });

  it('paints an idle card neutral with its category hairline, violet for Services, azure for Techniques', async () => {
    const { view } = await renderPicker([]);

    expect(styleOf(view, 'service-card-cut')).toMatchObject({
      backgroundColor: semanticColors.surfaceElevated,
      borderColor: serviceCategoryColors.SERVICE.border,
    });
    expect(view.getByTestId('service-card-cut').props.accessibilityState).toEqual({ selected: false });
    expect(view.queryByTestId('service-card-cut-check')).toBeNull();

    await showTechniques(view);
    expect(styleOf(view, 'service-card-color')).toMatchObject({
      backgroundColor: semanticColors.surfaceElevated,
      borderColor: serviceCategoryColors.TECHNIQUE.border,
    });
  });

  it('marks a selected card with its category tint, border and check — never colour alone', async () => {
    const { view } = await renderPicker(['cut', 'color']);

    expect(styleOf(view, 'service-card-cut')).toMatchObject({
      backgroundColor: serviceCategoryColors.SERVICE.tint,
      borderColor: serviceCategoryColors.SERVICE.accent,
    });
    expect(styleOf(view, 'service-card-cut-check')).toMatchObject({
      backgroundColor: serviceCategoryColors.SERVICE.accent,
    });
    expect(view.getByTestId('service-card-cut').props.accessibilityState).toEqual({ selected: true });

    await showTechniques(view);
    expect(styleOf(view, 'service-card-color')).toMatchObject({
      backgroundColor: serviceCategoryColors.TECHNIQUE.tint,
      borderColor: serviceCategoryColors.TECHNIQUE.accent,
    });
    expect(styleOf(view, 'service-card-color-check')).toMatchObject({
      backgroundColor: serviceCategoryColors.TECHNIQUE.accent,
    });
  });

  it('states duration, pose, price and category for assistive technologies', async () => {
    const { view } = await renderPicker([]);

    expect(view.getByTestId('service-card-cut').props.accessibilityLabel).toBe(
      `Coupe, 30 min, ${formatCreationPrice(30)}, Service`,
    );
    await showTechniques(view);
    expect(view.getByText('1 h · dont 30 min de pose')).toBeTruthy();
    expect(view.getByTestId('service-card-color').props.accessibilityLabel).toBe(
      `Couleur, 1 h dont 30 min de pose, ${formatCreationPrice(60)}, Technique`,
    );
  });

  it('keeps the card geometry identical across category and selection', async () => {
    const { view } = await renderPicker(['cut']);
    const geometry = (testID: string) => {
      const { backgroundColor, borderColor, ...rest } = styleOf(view, testID);
      void backgroundColor;
      void borderColor;
      return rest;
    };

    expect(geometry('service-card-cut')).toEqual(geometry('service-card-blow-dry'));
  });

  it('hands the pressed Service to the caller', async () => {
    const { view, onSelectService } = await renderPicker([]);

    await act(async () => fireEvent.press(view.getByTestId('service-card-cut')));

    expect(onSelectService).toHaveBeenCalledWith(cut);
  });
});

describe('ServiceCatalogPicker — quantity mode (appointment creation and editing, estimations)', () => {
  async function renderQuantityPicker(
    selectedServiceIds: readonly string[],
    { decrementDisabled = false }: { readonly decrementDisabled?: boolean } = {},
  ) {
    const onSelectService = jest.fn();
    const onDecrementService = jest.fn();
    const view = await render(
      <ServiceCatalogPicker
        decrementDisabled={decrementDisabled}
        onDecrementService={onDecrementService}
        onSelectService={onSelectService}
        selectedServiceIds={selectedServiceIds}
        services={[cut, blowDry, color]}
      />,
    );
    return { view, onSelectService, onDecrementService };
  }

  it('keeps an idle card idle: no badge, no controls, a tap selects', async () => {
    const { view, onSelectService } = await renderQuantityPicker([]);

    expect(view.queryByTestId('service-card-cut-quantity')).toBeNull();
    expect(view.queryByTestId('service-card-cut-check')).toBeNull();
    expect(view.queryByTestId('service-card-cut-increment')).toBeNull();
    expect(view.queryByTestId('service-card-cut-decrement')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByTestId('service-card-cut'));
    });
    expect(onSelectService).toHaveBeenCalledWith(cut);
  });

  it('counts every occurrence: the check becomes a « ×2 » badge in the category accent', async () => {
    const { view } = await renderQuantityPicker(['cut', 'blow-dry', 'cut']);

    expect(view.queryByTestId('service-card-cut-check')).toBeNull();
    expect(styleOf(view, 'service-card-cut-quantity')).toMatchObject({
      backgroundColor: serviceCategoryColors.SERVICE.accent,
    });
    expect(view.getByText('×2')).toBeTruthy();
    expect(view.getByText('×1')).toBeTruthy();
    expect(styleOf(view, 'service-card-cut')).toMatchObject({
      backgroundColor: serviceCategoryColors.SERVICE.tint,
      borderColor: serviceCategoryColors.SERVICE.accent,
    });
    expect(view.getByTestId('service-card-cut').props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId('service-card-cut').props.accessibilityLabel).toMatch(/, quantité 2$/);
  });

  it('[+] and [−] act once each and never reach the card underneath', async () => {
    const { view, onSelectService, onDecrementService } = await renderQuantityPicker(['cut']);

    await act(async () => {
      fireEvent.press(view.getByTestId('service-card-cut-increment'));
    });
    expect(onSelectService).toHaveBeenCalledTimes(1);
    expect(onDecrementService).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(view.getByTestId('service-card-cut-decrement'));
    });
    expect(onDecrementService).toHaveBeenCalledTimes(1);
    expect(onDecrementService).toHaveBeenCalledWith(cut);
    expect(onSelectService).toHaveBeenCalledTimes(1);

    // The card itself still adds one more.
    await act(async () => {
      fireEvent.press(view.getByTestId('service-card-cut'));
    });
    expect(onSelectService).toHaveBeenCalledTimes(2);
  });

  it('labels the icon-only controls for screen readers and offers them as card actions', async () => {
    const { view, onSelectService, onDecrementService } = await renderQuantityPicker(['cut']);

    expect(view.getByLabelText('Retirer une fois Coupe')).toBeTruthy();
    expect(view.getByLabelText('Ajouter une fois de plus Coupe')).toBeTruthy();
    const card = view.getByTestId('service-card-cut');
    expect(card.props.accessibilityActions).toEqual([
      { name: 'increment', label: 'Ajouter une fois de plus' },
      { name: 'decrement', label: 'Retirer une fois' },
    ]);

    await act(async () => {
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    });
    expect(onDecrementService).toHaveBeenCalledWith(cut);
    await act(async () => {
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    });
    expect(onSelectService).toHaveBeenCalledWith(cut);
  });

  it('a disabled [−] swallows the tap: nothing removed, nothing added', async () => {
    const { view, onSelectService, onDecrementService } = await renderQuantityPicker(['cut'], {
      decrementDisabled: true,
    });

    const decrement = view.getByTestId('service-card-cut-decrement');
    expect(decrement.props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent.press(decrement);
    });
    expect(onDecrementService).not.toHaveBeenCalled();
    expect(onSelectService).not.toHaveBeenCalled();
    expect(
      view.getByTestId('service-card-cut').props.accessibilityActions.map(
        (action: { name: string }) => action.name,
      ),
    ).toEqual(['increment']);
  });

  it('gives [−] and [+] 44 × 44 pt touch areas that meet without overlapping, inside the card', async () => {
    const described: Service = { ...cut, description: 'Shampoing compris.' };
    const view = await render(
      <ServiceCatalogPicker
        onDecrementService={jest.fn()}
        onSelectService={jest.fn()}
        selectedServiceIds={['cut']}
        services={[described, blowDry]}
      />,
    );
    const decrement = view.getByTestId('service-card-cut-decrement');
    const increment = view.getByTestId('service-card-cut-increment');
    const box = (element: typeof decrement) => StyleSheet.flatten(element.props.style);
    const slop = (element: typeof decrement) =>
      element.props.hitSlop as { top: number; bottom: number; left: number; right: number };

    // The visual size is unchanged: two 28 pt discs.
    for (const button of [decrement, increment]) {
      expect(box(button)).toMatchObject({ width: 28, height: 28 });
      const { top, bottom, left, right } = slop(button);
      expect(box(button).width + left + right).toBeGreaterThanOrEqual(44);
      expect(box(button).height + top + bottom).toBeGreaterThanOrEqual(44);
    }

    // Between the two discs, the areas meet exactly: never an overlap.
    const stepper = StyleSheet.flatten(view.getByTestId('service-card-cut-decrement').parent?.props.style);
    const between = (stepper as { gap: number }).gap;
    expect(slop(decrement).right + slop(increment).left).toBeLessThanOrEqual(between);

    // [+] reaches at most the card's inner border: content padding + the
    // stepper's inset from the content edge.
    const card = StyleSheet.flatten(view.getByTestId('service-card-cut').props.style);
    const cardPadding = (card as { padding: number }).padding;
    const inset = (stepper as { marginRight: number }).marginRight;
    expect(slop(increment).right).toBeLessThanOrEqual(cardPadding + inset);
    // Vertically inside the card's padding too.
    expect(slop(increment).bottom).toBeLessThanOrEqual(cardPadding);

    // [−] never reaches into the « i » button's area.
    const info = view.getByTestId('service-card-cut-description', { includeHiddenElements: true });
    const infoRight = (info.props.hitSlop as { right: number }).right;
    const trailingGap = 4;
    const afterInfo = (stepper as { marginLeft?: number }).marginLeft ?? 0;
    expect(infoRight + slop(decrement).left).toBeLessThanOrEqual(trailingGap + afterInfo);
  });

  it('keeps the check badge and no controls without quantity mode', async () => {
    const { view } = await renderPicker(['cut']);

    expect(view.getByTestId('service-card-cut-check')).toBeTruthy();
    expect(view.queryByTestId('service-card-cut-quantity')).toBeNull();
    expect(view.queryByTestId('service-card-cut-increment')).toBeNull();
    expect(view.getByTestId('service-card-cut').props.accessibilityLabel).not.toMatch(/quantité/);
  });
});
