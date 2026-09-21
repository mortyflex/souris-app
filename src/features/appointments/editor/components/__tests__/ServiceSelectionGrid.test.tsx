import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Service } from '@/domain/appointments';

import { getServiceCardPalette } from '../../service-card-palette';
import { ServiceSelectionGrid } from '../ServiceSelectionGrid';

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

const color: Service = {
  id: 'color',
  businessId: 'business-test',
  name: 'Couleur',
  type: 'TECHNIQUE',
  price: 60,
  phases: [
    { id: 'color-application', name: 'Application', durationMinutes: 20, requiresStaff: true },
    { id: 'color-processing', name: 'Pose', durationMinutes: 30, requiresStaff: false },
  ],
  active: true,
};

async function renderGrid(selectedServiceIds: readonly string[]) {
  const onToggleService = jest.fn();
  const view = await render(
    <ServiceSelectionGrid
      services={[cut, color]}
      selectedServiceIds={selectedServiceIds}
      onToggleService={onToggleService}
    />,
  );
  return { view, onToggleService };
}

describe('ServiceSelectionGrid — service type colours', () => {
  it('paints each idle card with the palette of its service type', async () => {
    const { view } = await renderGrid([]);

    for (const service of [cut, color]) {
      const card = view.getByTestId(`service-card-${service.id}`);
      const palette = getServiceCardPalette(service.type, false);

      expect(StyleSheet.flatten(card.props.style)).toMatchObject({
        backgroundColor: palette.background,
        borderColor: palette.border,
      });
      expect(card.props.accessibilityState).toMatchObject({ selected: false });
    }
  });

  it('keeps each selected card in its own family', async () => {
    const { view } = await renderGrid(['cut', 'color']);

    for (const service of [cut, color]) {
      const card = view.getByTestId(`service-card-${service.id}`);
      const palette = getServiceCardPalette(service.type, true);

      expect(StyleSheet.flatten(card.props.style)).toMatchObject({
        backgroundColor: palette.background,
        borderColor: palette.border,
      });
      expect(card.props.accessibilityState).toMatchObject({ selected: true });
    }
  });

  it('keeps the card geometry identical across type and selection', async () => {
    // One selected simple card next to one idle technique card.
    const { view } = await renderGrid(['cut']);
    const geometry = (testID: string) => {
      const { backgroundColor, borderColor, ...rest } = StyleSheet.flatten(
        view.getByTestId(testID).props.style,
      );
      void backgroundColor;
      void borderColor;
      return rest;
    };

    expect(geometry('service-card-cut')).toEqual(geometry('service-card-color'));
  });

  it('still toggles the pressed Service', async () => {
    const { view, onToggleService } = await renderGrid([]);

    await act(async () => fireEvent.press(view.getByTestId('service-card-cut')));

    expect(onToggleService).toHaveBeenCalledWith(cut);
  });
});
