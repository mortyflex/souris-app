import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Service } from '@/domain/appointments';
import { semanticColors, serviceCategoryColors } from '@/shared/ui/theme';

import { formatCreationPrice } from '../../presentation';
import { ServiceCatalogPicker } from '../ServiceCatalogPicker';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

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
