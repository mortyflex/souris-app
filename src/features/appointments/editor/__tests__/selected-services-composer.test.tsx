// Souris — Selected services composer overflow behavior
//
// The sticky composer collapses as soon as more than two services are
// selected: the first two cards stay visible and a "+N autre(s)
// prestation(s)" overflow row gives access to the rest. Expanding reveals
// every card; collapsing returns to the first two cards + overflow count.

import { act, fireEvent, render } from '@testing-library/react-native';

import type { Service } from '@/domain/appointments';

import { SelectedServicesComposer } from '../components/SelectedServicesComposer';
import type { SortableDraftEntry } from '../components/SortableDraftList';
import { createSelectedServiceDraft } from '../draft';

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

  const AnimatedView = (props: { readonly children?: React.ReactNode }) =>
    React.createElement(View, props);
  const createAnimationBuilder = () => {
    const builder = {
      duration: () => builder,
      easing: () => builder,
    };
    return builder;
  };

  return {
    __esModule: true,
    default: Object.assign(AnimatedView, {
      View: AnimatedView,
      createAnimatedComponent: (component: unknown) => component,
    }),
    useSharedValue: (init: unknown) => {
      let value = init;
      return {
        get: () => value,
        set: (next: unknown) => {
          value = next;
        },
      };
    },
    useAnimatedStyle: (style: () => object) => style(),
    useReducedMotion: () => false,
    useEvent: () => () => undefined,
    withTiming: (value: unknown) => value,
    FadeIn: createAnimationBuilder(),
    FadeOut: createAnimationBuilder(),
    LinearTransition: createAnimationBuilder(),
    Easing: { bezier: () => () => 0 },
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: never[]) => void, ...args: never[]) => fn(...args),
}));

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    SymbolView: () => React.createElement(React.Fragment, null),
  };
});

function makeService(index: number): Service {
  return {
    id: `service-${index}`,
    businessId: 'business-test',
    name: `Prestation ${index}`,
    type: 'SERVICE',
    price: 40,
    phases: [
      {
        id: `phase-${index}`,
        name: `Prestation ${index}`,
        durationMinutes: 30,
        requiresStaff: true,
      },
    ],
    active: true,
  };
}

function makeEntries(count: number): readonly SortableDraftEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    draft: createSelectedServiceDraft(makeService(index + 1)),
  }));
}

function renderComposer(count: number) {
  return render(
    <SelectedServicesComposer
      canRemove
      entries={makeEntries(count)}
      expandedDraftId={null}
      onReorder={() => {}}
      onRemove={() => {}}
      onToggleExpanded={() => {}}
      onUpdatePhaseDuration={() => {}}
      onUpdatePrice={() => {}}
    />,
  );
}

describe('SelectedServicesComposer overflow', () => {
  it('shows one full card and no overflow row for a single service', async () => {
    const view = await renderComposer(1);

    expect(view.getByText('Prestation 1')).toBeTruthy();
    expect(view.queryByText('Tout afficher')).toBeNull();
    expect(view.queryByText('+1 autre prestation')).toBeNull();
  });

  it('shows two full cards and no overflow row for two services', async () => {
    const view = await renderComposer(2);

    expect(view.getByText('Prestation 1')).toBeTruthy();
    expect(view.getByText('Prestation 2')).toBeTruthy();
    expect(view.queryByText('Tout afficher')).toBeNull();
    expect(view.queryByText('+1 autre prestation')).toBeNull();
  });

  it('collapses from the third service with a singular overflow row', async () => {
    const view = await renderComposer(3);

    expect(view.getByText('Prestation 1')).toBeTruthy();
    expect(view.getByText('Prestation 2')).toBeTruthy();
    expect(view.queryByText('Prestation 3')).toBeNull();
    expect(view.getByText('+1 autre prestation')).toBeTruthy();
    expect(view.getByText('Tout afficher')).toBeTruthy();
  });

  it('collapses from the fourth service with a plural overflow row', async () => {
    const view = await renderComposer(4);

    expect(view.getByText('Prestation 1')).toBeTruthy();
    expect(view.getByText('Prestation 2')).toBeTruthy();
    expect(view.queryByText('Prestation 3')).toBeNull();
    expect(view.queryByText('Prestation 4')).toBeNull();
    expect(view.getByText('+2 autres prestations')).toBeTruthy();
  });

  it('expansion reveals every card, collapse returns to the first two', async () => {
    const view = await renderComposer(4);

    await act(async () => {
      fireEvent.press(view.getByText('Tout afficher'));
    });

    expect(view.getByText('Prestation 1')).toBeTruthy();
    expect(view.getByText('Prestation 2')).toBeTruthy();
    expect(view.getByText('Prestation 3')).toBeTruthy();
    expect(view.getByText('Prestation 4')).toBeTruthy();
    expect(view.queryByText('+2 autres prestations')).toBeNull();
    expect(view.getByText('Réduire')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByText('Réduire'));
    });

    expect(view.getByText('Prestation 1')).toBeTruthy();
    expect(view.getByText('Prestation 2')).toBeTruthy();
    expect(view.queryByText('Prestation 3')).toBeNull();
    expect(view.queryByText('Prestation 4')).toBeNull();
    expect(view.getByText('+2 autres prestations')).toBeTruthy();
    expect(view.queryByText('Réduire')).toBeNull();
  });
});
