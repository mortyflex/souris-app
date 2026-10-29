// BeautIzzy — multi-profession Step 4: how the appointment flows word a prestation
//
// Hairdressing (and every stored activity with the Services / Techniques
// organisation) keeps « de pose », the type colours and the spoken type; the
// unified catalogue of nails and esthetics reads « d’attente », one palette
// and no internal type. A catalogue description is offered from the picker
// card without changing what a tap on the card does.

import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Service } from '@/domain/appointments';
import { BUSINESS_ACTIVITY_TYPES } from '@/domain/business';
import {
  getAppointmentWording,
  getCataloguePresentation,
  getPhaseDisplayName,
  getWaitingPhaseName,
} from '@/features/services/catalogue-presentation';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';
import { serviceCategoryColors } from '@/shared/ui/theme';

import { createSelectedServiceDraft } from '../../draft';
import { formatCreationDuration, formatCreationPrice } from '../../presentation';
import { AppointmentServiceEditorCard } from '../AppointmentServiceEditorCard';
import { getPhaseTimingSubject } from '../AppointmentPhaseTimingEditor';
import { ServiceCatalogPicker } from '../ServiceCatalogPicker';
import { ServiceSelectionCard } from '../ServiceSelectionCard';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const AnimatedView = (props: { readonly children?: React.ReactNode }) => React.createElement(View, props);
  const createAnimationBuilder = () => {
    const builder = { duration: () => builder, easing: () => builder };
    return builder;
  };
  return {
    __esModule: true,
    default: Object.assign(AnimatedView, {
      View: AnimatedView,
      createAnimatedComponent: (component: unknown) => component,
    }),
    useSharedValue: (init: unknown) => ({ value: init, get: () => init, set: () => undefined }),
    useAnimatedStyle: (style: () => object) => style(),
    useReducedMotion: () => true,
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
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
    initialWindowMetrics: null,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  class MockModal extends React.Component<{ visible?: boolean; onDismiss?: () => void; children?: React.ReactNode }> {
    componentDidUpdate(previous: { visible?: boolean }) {
      if (previous.visible && !this.props.visible) this.props.onDismiss?.();
    }
    render() {
      return this.props.visible ? React.createElement(View, null, this.props.children) : null;
    }
  }
  return { __esModule: true, default: MockModal };
});

/** The « i » is touch only (VoiceOver uses the card action), so it is hidden from accessibility queries. */
const HIDDEN = { includeHiddenElements: true } as const;

const facial: Service = {
  id: 'facial',
  businessId: 'business-test',
  name: 'Soin du visage',
  type: 'TECHNIQUE',
  price: 65,
  phases: [
    { id: 'facial-application', name: 'Application', durationMinutes: 30, requiresStaff: true },
    { id: 'facial-processing', name: 'Temps de pose', durationMinutes: 15, requiresStaff: false },
    { id: 'facial-finishing', name: 'Finition', durationMinutes: 15, requiresStaff: true },
  ],
  active: true,
  description: 'Nettoyage, gommage et masque.\nVenir sans maquillage.',
};

const gelSet: Service = {
  id: 'gel-set',
  businessId: 'business-test',
  name: 'Pose complète gel',
  type: 'SERVICE',
  price: 55,
  phases: [{ id: 'gel-set-phase', name: 'Pose complète gel', durationMinutes: 90, requiresStaff: true }],
  active: true,
};

describe('getAppointmentWording', () => {
  it('keeps « Temps de pose » and the Service / Technique distinction for hairdressing', () => {
    const wording = getAppointmentWording(getCataloguePresentation('HAIRDRESSING').organization);
    expect(wording).toEqual({
      distinguishesTypes: true,
      waitingTimeLabel: 'Temps de pose',
      waitingTimeSuffix: 'de pose',
      waitingTimeSubject: 'le temps de pose',
    });
  });

  it.each(['NAILS', 'ESTHETICS'] as const)('reads « Temps d’attente » without the internal type for %s', (activity) => {
    const wording = getAppointmentWording(getCataloguePresentation(activity).organization);
    expect(wording).toEqual({
      distinguishesTypes: false,
      waitingTimeLabel: 'Temps d’attente',
      waitingTimeSuffix: 'd’attente',
      waitingTimeSubject: 'le temps d’attente',
    });
  });

  it('leaves every other stored activity on the established wording', () => {
    for (const activity of BUSINESS_ACTIVITY_TYPES.filter((entry) => entry !== 'NAILS' && entry !== 'ESTHETICS')) {
      expect(getAppointmentWording(getCataloguePresentation(activity).organization).waitingTimeLabel).toBe('Temps de pose');
    }
  });

  it('speaks an unattended phase stepper with the profession’s words, a worked phase by its own name', () => {
    const waiting = { name: 'Temps de pose', requiresStaff: false };
    expect(getPhaseTimingSubject(waiting)).toBe('le temps de pose');
    expect(getPhaseTimingSubject(waiting, undefined, 'CATEGORIES')).toBe('le temps d’attente');
    expect(getPhaseTimingSubject({ name: 'Application', requiresStaff: true }, undefined, 'CATEGORIES')).toBe('Application');
    expect(getPhaseTimingSubject(waiting, 'Brushing', 'CATEGORIES')).toBe('la durée de Brushing');
  });
});

describe('ServiceSelectionCard — profession wording', () => {
  it('hairdressing: « dont … de pose », the Technique palette and the spoken type', async () => {
    const view = await render(<ServiceSelectionCard onPress={jest.fn()} selected={false} service={facial} />);
    expect(view.getByText('1 h · dont 15 min de pose')).toBeTruthy();
    expect(view.getByRole('button', { name: `Soin du visage, 1 h dont 15 min de pose, ${formatCreationPrice(65)}, Technique` })).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('service-card-facial').props.style).borderColor).toBe(
      serviceCategoryColors.TECHNIQUE.border,
    );
  });

  it('unified catalogue: « dont … d’attente », one palette, no internal type', async () => {
    const view = await render(
      <ServiceSelectionCard onPress={jest.fn()} organization="CATEGORIES" selected service={facial} />,
    );
    expect(view.getByText('1 h · dont 15 min d’attente')).toBeTruthy();
    expect(view.queryByText(/de pose/)).toBeNull();
    const card = view.getByRole('button', { name: `Soin du visage, 1 h dont 15 min d’attente, ${formatCreationPrice(65)}` });
    expect(card.props.accessibilityState).toEqual({ selected: true });
    expect(StyleSheet.flatten(view.getByTestId('service-card-facial').props.style).borderColor).toBe(
      serviceCategoryColors.SERVICE.accent,
    );
  });

  it('a single-duration prestation reads its duration alone', async () => {
    const view = await render(
      <ServiceSelectionCard onPress={jest.fn()} organization="CATEGORIES" selected={false} service={gelSet} />,
    );
    expect(view.getByRole('button', { name: `Pose complète gel, ${formatCreationDuration(90)}, ${formatCreationPrice(55)}` })).toBeTruthy();
  });
});

describe('ServiceCatalogPicker — the prestation description', () => {
  async function renderPicker(organization: 'SERVICE_TYPES' | 'CATEGORIES') {
    const onSelectService = jest.fn();
    const view = await render(
      <ServiceCatalogPicker
        onSelectService={onSelectService}
        organization={organization}
        selectedServiceIds={[]}
        services={[gelSet, facial]}
      />,
    );
    return { view, onSelectService };
  }

  it('offers « i » only on a prestation that has a description', async () => {
    const { view } = await renderPicker('CATEGORIES');
    expect(view.getByTestId('service-card-facial-description', HIDDEN)).toBeTruthy();
    expect(view.queryByTestId('service-card-gel-set-description', HIDDEN)).toBeNull();
    expect(view.getByTestId('service-card-gel-set').props.accessibilityActions).toBeUndefined();
  });

  it('opens the description in its own sheet without selecting, and a card tap still selects', async () => {
    const { view, onSelectService } = await renderPicker('CATEGORIES');
    expect(view.queryByTestId('service-description-sheet')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByTestId('service-card-facial-description', HIDDEN));
    });
    expect(onSelectService).not.toHaveBeenCalled();
    expect(view.getByText('DESCRIPTION DE LA PRESTATION')).toBeTruthy();
    expect(view.getByTestId('service-description-text').props.children).toBe(facial.description);
    expect(view.getByText(`1 h · ${formatCreationPrice(65)}`)).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('service-description-close'));
    });
    await settleSheetTransition();
    expect(view.queryByTestId('service-description-sheet')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByTestId('service-card-facial'));
    });
    expect(onSelectService).toHaveBeenCalledTimes(1);
    expect(onSelectService).toHaveBeenCalledWith(facial);
  });

  it('offers the description to VoiceOver as a card action', async () => {
    const { view, onSelectService } = await renderPicker('CATEGORIES');
    const card = view.getByTestId('service-card-facial');
    expect(card.props.accessibilityActions).toEqual([{ name: 'showDescription', label: 'Voir la description' }]);

    await act(async () => {
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'showDescription' } });
    });
    expect(view.getByTestId('service-description-text').props.children).toBe(facial.description);
    expect(onSelectService).not.toHaveBeenCalled();
  });

  it('works the same in the hairdressing segment', async () => {
    const { view } = await renderPicker('SERVICE_TYPES');
    await act(async () => {
      fireEvent.press(view.getByTestId('catalog-category-TECHNIQUE'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('service-card-facial-description', HIDDEN));
    });
    expect(view.getByTestId('service-description-text').props.children).toBe(facial.description);
  });
});

describe('AppointmentServiceEditorCard — profession wording', () => {
  const props = {
    expanded: false,
    onToggleExpanded: jest.fn(),
    onUpdatePrice: jest.fn(),
    onUpdatePhaseDuration: jest.fn(),
    grouped: true,
  };

  it('hairdressing: the type dot, the spoken type and « + … de pose »', async () => {
    const draft = createSelectedServiceDraft(facial);
    const view = await render(<AppointmentServiceEditorCard {...props} draft={draft} />);
    expect(view.getByText('45 min + 15 min de pose')).toBeTruthy();
    expect(view.getByTestId('draft-category-TECHNIQUE')).toBeTruthy();
    expect(view.getByLabelText('Développer Soin du visage').props.accessibilityHint).toBe('Technique');
  });

  it('unified catalogue: no dot, no spoken type, « + … d’attente »', async () => {
    const draft = createSelectedServiceDraft(facial);
    const view = await render(
      <AppointmentServiceEditorCard {...props} draft={draft} expanded organization="CATEGORIES" />,
    );
    expect(view.getByText('45 min + 15 min d’attente')).toBeTruthy();
    expect(view.queryByTestId('draft-category-TECHNIQUE')).toBeNull();
    expect(view.getByLabelText('Réduire Soin du visage').props.accessibilityHint).toBeUndefined();
    // The snapshot's default « Temps de pose » reads « Temps d’attente »; the snapshot is untouched.
    expect(view.getByText('Temps d’attente')).toBeTruthy();
    expect(view.queryByText('Temps de pose')).toBeNull();
    expect(draft.phases[1]?.name).toBe('Temps de pose');
    expect(view.getByLabelText('le temps d’attente : 15 min')).toBeTruthy();
  });
});

// Multi-profession Step 5: the name of an unattended phase.
describe('waiting-phase names', () => {
  it('gives a new unattended phase « Temps de pose », « Temps d’attente » in the unified catalogue', () => {
    for (const activity of BUSINESS_ACTIVITY_TYPES) {
      const expected = activity === 'NAILS' || activity === 'ESTHETICS' ? 'Temps d’attente' : 'Temps de pose';
      expect(getWaitingPhaseName(getCataloguePresentation(activity).organization)).toBe(expected);
    }
  });

  it('hairdressing shows every stored name exactly as stored', () => {
    for (const phase of [
      { name: 'Temps de pose', requiresStaff: false },
      { name: 'Temps d’attente', requiresStaff: false },
      { name: 'Séchage sous casque', requiresStaff: false },
      { name: 'Application', requiresStaff: true },
    ]) {
      expect(getPhaseDisplayName(phase, 'SERVICE_TYPES')).toBe(phase.name);
    }
  });

  it('the unified catalogue reads only the app’s own default « Temps de pose » as « Temps d’attente »', () => {
    expect(getPhaseDisplayName({ name: 'Temps de pose', requiresStaff: false }, 'CATEGORIES')).toBe('Temps d’attente');
    expect(getPhaseDisplayName({ name: 'Temps d’attente', requiresStaff: false }, 'CATEGORIES')).toBe('Temps d’attente');
    // A different unattended name is the professional's: kept exactly.
    expect(getPhaseDisplayName({ name: 'Repos du masque', requiresStaff: false }, 'CATEGORIES')).toBe('Repos du masque');
    expect(getPhaseDisplayName({ name: 'temps de pose', requiresStaff: false }, 'CATEGORIES')).toBe('temps de pose');
    // A worked phase is never reinterpreted, whatever its words.
    expect(getPhaseDisplayName({ name: 'Temps de pose', requiresStaff: true }, 'CATEGORIES')).toBe('Temps de pose');
    expect(getPhaseDisplayName({ name: 'Pose complète gel', requiresStaff: true }, 'CATEGORIES')).toBe('Pose complète gel');
  });
});

// Final UX: a long prestation name wraps on two lines in the Résumé / Modifier card; its
// duration, price and chevron keep their width, and the timing rows wrap the same way.
describe('AppointmentServiceEditorCard — long names', () => {
  it('wraps the name and the phase names on two lines, the price never shrinks', async () => {
    const long: Service = {
      ...facial,
      name: 'Soin du visage avec masque hydratant, modelage relaxant et finition éclat sur mesure',
      phases: [
        { id: 'long-a', name: 'Nettoyage, gommage et pose du masque hydratant', durationMinutes: 20, requiresStaff: true },
        { id: 'long-w', name: 'Temps d’attente', durationMinutes: 15, requiresStaff: false },
        { id: 'long-f', name: 'Retrait du masque et finition', durationMinutes: 25, requiresStaff: true },
      ],
    };
    const draft = createSelectedServiceDraft(long);
    const view = await render(
      <AppointmentServiceEditorCard
        draft={draft}
        expanded
        grouped
        onToggleExpanded={jest.fn()}
        onUpdatePhaseDuration={jest.fn()}
        onUpdatePrice={jest.fn()}
        organization="CATEGORIES"
      />,
    );
    expect(view.getByText(long.name).props.numberOfLines).toBe(2);
    expect(view.getByText('45 min + 15 min d’attente')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByText(formatCreationPrice(65)).props.style).flexShrink).toBe(0);
    expect(view.getByText('Nettoyage, gommage et pose du masque hydratant').props.numberOfLines).toBe(2);
    // The total stays the snapshot's: 20 + 15 + 25.
    expect(draft.phases.reduce((total, phase) => total + phase.durationMinutes, 0)).toBe(60);
  });
});
