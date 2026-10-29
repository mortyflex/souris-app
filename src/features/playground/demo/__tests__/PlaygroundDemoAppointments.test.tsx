// BeautIzzy — multi-profession Step 4: the real appointment screens in each profession's demo
//
// « Nouveau rendez-vous », « Modifier le rendez-vous » and the Details of an
// appointment, rendered inside the Playground demo runtime on the profession's
// in-memory database. Nails and esthetics pick prestations by the
// professional's categories and read « Temps d’attente », never the internal
// Service / Technique type; hairdressing keeps its segment and « Temps de
// pose ». Totals come from the domain rules, snapshots survive a catalogue
// change, and every write stays in the demo database. The modules the demo
// must never touch throw on load. Step 5 adds the catalogue and the prestation
// editor of the same demos.

import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { getAppointmentServicesTotal, type Appointment, type Service } from '@/domain/appointments';
import { AppointmentCreationScreen } from '@/features/appointments/creation/AppointmentCreationScreen';
import { AppointmentDetailsScreen } from '@/features/appointments/details/AppointmentDetailsScreen';
import { AppointmentEditingScreen } from '@/features/appointments/editing/AppointmentEditingScreen';
import { formatCreationPrice } from '@/features/appointments/editor/presentation';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { AuthProvider, useAuth, type AuthState } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import { ServiceCatalogScreen } from '@/features/services/catalog/ServiceCatalogScreen';
import { ServiceEditorScreen } from '@/features/services/editor/ServiceEditorScreen';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import type { SourisDatabase } from '@/persistence/database';
import { loadAppointments } from '@/persistence/stores/appointments';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { formatEuroCents } from '@/shared/lib/money';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

import { PlaygroundDemoRuntime } from '../PlaygroundDemoRuntime';
import { createPlaygroundDemoScenario, type PlaygroundDemoScenario } from '../scenarios';
import { PlaygroundDemoSessionProvider, usePlaygroundDemoSession } from '../session';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockFocusEffects = new Set<() => void>();

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text: RNText } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { readonly href: string }) => React.createElement(RNText, { testID: 'redirect' }, href),
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        mockFocusEffects.add(effect as () => void);
        const cleanup = effect();
        return () => {
          mockFocusEffects.delete(effect as () => void);
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]);
    },
    useRouter: () => ({ push: mockPush, back: mockBack, dismissTo: jest.fn() }),
    useNavigation: () => ({ dispatch: jest.fn() }),
    useIsFocused: () => true,
  };
});
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});
jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { DateTimePicker: () => React.createElement(View, null) };
});
jest.mock('@/shared/ui/BarcodeScannerModal', () => ({ BarcodeScannerModal: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
jest.mock('@/shared/lib/image-pixel-size', () => ({ fitImageToPixelSize: jest.fn(async () => undefined) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));
// The editors' reorder handles and swipe rows need the gesture-ready double.
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View: NativeView } = jest.requireActual('react-native') as typeof import('react-native');

  const AnimatedView = (props: { readonly children?: React.ReactNode }) =>
    React.createElement(NativeView, props);
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
    FadeIn: createAnimationBuilder(),
    FadeOut: createAnimationBuilder(),
    LinearTransition: createAnimationBuilder(),
    Easing: { bezier: () => () => 0 },
    Extrapolation: { CLAMP: 'clamp' },
    SlideOutRight: createAnimationBuilder(),
    interpolate: (value: number, input: number[], output: number[]) =>
      value <= input[0] ? output[0] : output[output.length - 1],
    useAnimatedStyle: (style: () => object) => style(),
    // Runs the reaction on every render with the current shared values.
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (value: unknown, previous: unknown) => void,
    ) => react(prepare(), null),
    useEvent: () => () => undefined,
    useReducedMotion: () => false,
    // Stable across renders, like the real hook.
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
    withSpring: (value: unknown) => value,
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
jest.mock('../../availability', () => ({ isPlaygroundAvailable: jest.fn(() => true) }));

// Isolation boundary: none of these may be loaded by the demo or the screens it mounts.
jest.mock('@/infrastructure/supabase', () => {
  throw new Error('the Playground demo must never load the Supabase gateways');
});
jest.mock('@/infrastructure/revenuecat', () => {
  throw new Error('the Playground demo must never load RevenueCat');
});
jest.mock('@/persistence/expo-database', () => {
  throw new Error('the Playground demo must never open the device database');
});
jest.mock('@/providers/CloudSyncRunner', () => {
  throw new Error('the Playground demo must never mount the cloud sync runner');
});

type Profession = 'HAIRDRESSING' | 'NAILS' | 'ESTHETICS';

// A Wednesday afternoon far from the real clock: the fixtures are relative to it.
const NOW = new Date(2027, 2, 10, 15, 30);

interface Probe {
  readonly appointments: readonly Appointment[];
  readonly services: readonly Service[];
  readonly getServiceById: (serviceId: string) => Service | undefined;
  readonly updateService: (service: Service) => void;
}

const probe: { current?: Probe } = {};
const auth: { current?: AuthState } = {};

function DemoProbe() {
  const { appointments } = useAppointmentSession();
  const { services, getServiceById, updateService } = useServiceCatalog();
  useEffect(() => {
    probe.current = {
      appointments: appointments.map((entry) => entry.appointment),
      services,
      getServiceById,
      updateService,
    };
  });
  return null;
}

function AutoStart({ activityType }: { readonly activityType: Profession }) {
  const { start, scenario } = usePlaygroundDemoSession();
  const { state } = useAuth();
  useEffect(() => {
    auth.current = state;
  });
  useEffect(() => {
    if (scenario === null) start(activityType);
  }, [activityType, scenario, start]);
  return null;
}

function Tree({
  activityType,
  databases,
  children,
}: {
  readonly activityType: Profession;
  readonly databases: SourisDatabase[];
  readonly children: ReactNode;
}) {
  const [gateway] = useState(createFakeAuthGateway);
  const [openDatabase] = useState(() => () => {
    const database = openTestDatabase();
    databases.push(database);
    return database;
  });
  return (
    <AuthProvider gateway={gateway}>
      <PlaygroundDemoSessionProvider>
        <AutoStart activityType={activityType} />
        <PlaygroundDemoRuntime now={() => NOW} openDatabase={openDatabase}>
          {children}
          <DemoProbe />
        </PlaygroundDemoRuntime>
      </PlaygroundDemoSessionProvider>
    </AuthProvider>
  );
}

async function renderDemo(activityType: Profession, screen: (scenario: PlaygroundDemoScenario) => ReactNode) {
  const databases: SourisDatabase[] = [];
  const scenario = createPlaygroundDemoScenario(activityType, NOW);
  const view = await render(
    <Tree activityType={activityType} databases={databases}>
      {screen(scenario)}
    </Tree>,
  );
  await waitFor(() => expect(probe.current).toBeDefined());
  return { view, databases, scenario };
}

type View = Awaited<ReturnType<typeof renderDemo>>['view'];

const press = (view: View, testID: string) => act(async () => fireEvent.press(view.getByTestId(testID)));
const pressText = (view: View, text: string) => act(async () => fireEvent.press(view.getByText(text)));
const serviceId = (scenario: PlaygroundDemoScenario, key: string) => `${scenario.business.id}-service-${key}`;
const appointmentId = (scenario: PlaygroundDemoScenario, key: string) => `${scenario.business.id}-appointment-${key}`;
const findAppointment = (id: string) => probe.current!.appointments.find((entry) => entry.id === id)!;
const categoryNames = (scenario: PlaygroundDemoScenario) => (scenario.seed.serviceCategories ?? []).map((category) => category.name);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  jest.setSystemTime(NOW);
  probe.current = undefined;
  auth.current = undefined;
  mockPush.mockClear();
  mockBack.mockClear();
  mockFocusEffects.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Playground Step 4 — nails: « Nouveau rendez-vous »', () => {
  it('picks prestations by category, totals them and saves their snapshots in the demo database only', async () => {
    const startAt = new Date(2027, 2, 13, 14, 0);
    const { view, databases, scenario } = await renderDemo('NAILS', (data) => (
      <AppointmentCreationScreen initialClientId={`${data.business.id}-client-manon`} startAt={startAt} />
    ));
    await pressText(view, 'Continuer');

    // The professional's categories, never the internal type.
    expect(view.queryByTestId('catalog-category')).toBeNull();
    for (const name of ['Ongles naturels', 'Remplissages', 'Sans catégorie']) {
      expect(view.getByText(name)).toBeTruthy();
    }
    expect(categoryNames(scenario)).toContain('Remplissages');
    expect(view.queryByText(/Technique|de pose/)).toBeNull();

    const infill = serviceId(scenario, 'gel-infill');
    const nailArt = serviceId(scenario, 'nail-art');
    await press(view, `service-card-${infill}`);
    await press(view, `service-card-${nailArt}`);

    // A description is one tap away and never selects anything.
    await act(async () => {
      fireEvent.press(view.getByTestId(`service-card-${nailArt}-description`, { includeHiddenElements: true }));
    });
    expect(view.getByTestId('service-description-text').props.children).toBe(
      probe.current!.getServiceById(nailArt)!.description,
    );
    await press(view, 'service-description-close');
    await settleSheetTransition();
    expect(view.getByTestId(`service-card-${infill}`).props.accessibilityState).toEqual({ selected: true });

    await pressText(view, 'Continuer');
    // Single-duration prestations: no waiting-time breakdown, the domain total.
    expect(view.queryByTestId('creation-time-breakdown')).toBeNull();
    expect(view.getByTestId('creation-total').props.children).toBe(formatCreationPrice(42 + 10));
    expect(view.queryByTestId('draft-category-SERVICE')).toBeNull();

    await pressText(view, 'Créer le rendez-vous');
    const created = probe.current!.appointments.find(
      (entry) => entry.startAt.getTime() === startAt.getTime() && entry.clientId === `${scenario.business.id}-client-manon`,
    )!;
    expect(created.businessId).toBe(scenario.business.id);
    expect(created.items.map((item) => [item.serviceName, item.price, item.serviceType])).toEqual([
      ['Remplissage gel', 42, 'SERVICE'],
      ['Nail art', 10, 'SERVICE'],
    ]);
    expect(getAppointmentServicesTotal(created).netCents).toBe(5200);
    expect(databases).toHaveLength(1);
    expect(loadAppointments(databases[0]).map((entry) => entry.id)).toContain(created.id);
    expect(auth.current?.status).toBe('unauthenticated');
  });
});

describe('Playground Step 4 — esthetics: « Modifier le rendez-vous » and Details', () => {
  it('reads « d’attente », adds a prestation by category and keeps the facial snapshot through a catalogue change', async () => {
    const { view, scenario } = await renderDemo('ESTHETICS', (data) => (
      <AppointmentEditingScreen appointmentId={`${data.business.id}-appointment-f2`} />
    ));
    const id = appointmentId(scenario, 'f2');
    const original = findAppointment(id);
    const [facialItem] = original.items;
    expect(facialItem.serviceType).toBe('TECHNIQUE');

    // The catalogue changes after booking: the appointment keeps its snapshot.
    const facial = probe.current!.getServiceById(serviceId(scenario, 'facial'))!;
    await act(async () => {
      probe.current!.updateService({ ...facial, price: 99, name: 'Soin visage signature' });
    });

    expect(view.getByText('45 min + 15 min d’attente')).toBeTruthy();
    expect(view.queryByText(/de pose/)).toBeNull();
    expect(view.queryByTestId('draft-category-TECHNIQUE')).toBeNull();
    expect(view.queryByTestId('catalog-category')).toBeNull();
    expect(view.getByText('Épilations')).toBeTruthy();

    await press(view, `service-card-${serviceId(scenario, 'brow-wax')}`);
    expect(view.getByTestId('appointment-edit-summary-total').props.children).toBe(formatEuroCents((65 + 12) * 100));
    await press(view, 'save-appointment-edit');

    const saved = findAppointment(id);
    expect(saved.items[0]).toEqual(facialItem);
    expect(saved.items[0].price).toBe(65);
    expect(saved.items.map((item) => item.serviceName)).toEqual(['Soin du visage avec masque', 'Épilation sourcils']);
    const browWax = probe.current!.getServiceById(serviceId(scenario, 'brow-wax'))!;
    expect(saved.items[1]).toMatchObject({ serviceId: browWax.id, serviceName: browWax.name, price: 12, serviceType: 'SERVICE', order: 1 });
    expect(saved.items[1].phases.map((phase) => [phase.name, phase.durationMinutes, phase.requiresStaff])).toEqual(
      browWax.phases.map((phase) => [phase.name, phase.durationMinutes, phase.requiresStaff]),
    );
    expect(getAppointmentServicesTotal(saved).netCents).toBe(7700);
  });

  it('the Résumé of a facial splits « Temps actif » and « Temps d’attente »', async () => {
    const { view, scenario } = await renderDemo('ESTHETICS', (data) => (
      <AppointmentCreationScreen
        initialClientId={`${data.business.id}-client-jade`}
        startAt={new Date(2027, 2, 16, 14, 0)}
      />
    ));
    await pressText(view, 'Continuer');
    await press(view, `service-card-${serviceId(scenario, 'facial')}`);
    expect(view.getByText('1 h · dont 15 min d’attente')).toBeTruthy();
    await pressText(view, 'Continuer');

    expect(view.getByTestId('creation-time-breakdown')).toBeTruthy();
    expect(view.getByText('Temps actif')).toBeTruthy();
    expect(view.getByText('Temps d’attente')).toBeTruthy();
    expect(view.queryByText('Temps de pose')).toBeNull();
    expect(view.getByText('45 min + 15 min d’attente')).toBeTruthy();
    expect(view.getByTestId('creation-total').props.children).toBe(formatCreationPrice(65));
  });

  it('Details shows and speaks the facial’s waiting phase as « Temps d’attente », exactly as stored', async () => {
    const { view, scenario } = await renderDemo('ESTHETICS', (data) => (
      <AppointmentDetailsScreen appointmentId={`${data.business.id}-appointment-f2`} />
    ));
    const [facialItem] = findAppointment(appointmentId(scenario, 'f2')).items;
    await act(async () => {
      fireEvent.press(view.getByLabelText(/^Soin du visage avec masque, commence à/));
    });
    expect(view.getByText('Temps d’attente')).toBeTruthy();
    expect(view.queryByText('Temps de pose')).toBeNull();
    expect(view.getByLabelText('le temps d’attente : 15 min')).toBeTruthy();
    expect(view.queryByLabelText(/le temps de pose/)).toBeNull();
    // The demo facial comes from the esthetics starter base, so its snapshot carries
    // the new default name — shown as stored, nothing rewritten.
    expect(facialItem.phases.map((phase) => [phase.name, phase.requiresStaff])).toEqual([
      ['Nettoyage et pose du masque', true],
      ['Temps d’attente', false],
      ['Retrait du masque et finition', true],
    ]);
  });
});

describe('Playground Step 4 — hairdressing keeps its established vocabulary', () => {
  it('« Modifier le rendez-vous » keeps the Services / Techniques segment, the type dot and « de pose »', async () => {
    const { view } = await renderDemo('HAIRDRESSING', (data) => (
      <AppointmentEditingScreen appointmentId={`${data.business.id}-appointment-f3`} />
    ));
    expect(view.getByTestId('catalog-category')).toBeTruthy();
    expect(view.getByText('Techniques')).toBeTruthy();
    expect(view.getByTestId('draft-category-TECHNIQUE')).toBeTruthy();
    expect(view.getByText(/\+ .* de pose$/)).toBeTruthy();
    expect(view.queryByText(/d’attente/)).toBeNull();
  });
});

// Multi-profession Step 5: the catalogue and the prestation editor say what the appointment
// screens say — « Temps d’attente » in nails and esthetics, « Temps de pose » in hairdressing.
describe('Playground Step 5 — waiting-phase terminology in the catalogue and the editor', () => {
  const typeText = (view: View, label: string, text: string) =>
    act(async () => fireEvent.changeText(view.getByLabelText(label), text));

  it('hairdressing: an existing colour keeps « Temps de pose » in its Details, as stored', async () => {
    const { view, scenario } = await renderDemo('HAIRDRESSING', (data) => (
      <ServiceEditorScreen mode="existing" serviceId={`${data.business.id}-service-color`} />
    ));
    expect(view.getAllByText('Temps de pose').length).toBeGreaterThanOrEqual(2);
    expect(view.queryByText('Temps d’attente')).toBeNull();
    expect(probe.current!.getServiceById(serviceId(scenario, 'color'))!.phases[1]!.name).toBe('Temps de pose');
  });

  it('nails: a standard prestation stays one duration; a new phased one reads and stores « Temps d’attente »', async () => {
    const { view } = await renderDemo('NAILS', () => <ServiceEditorScreen mode="create" />);
    // Standard: one duration, no phases, no internal vocabulary.
    expect(view.getByLabelText('Durée de la prestation')).toBeTruthy();
    expect(view.queryByText('Phases')).toBeNull();
    expect(view.queryByText(/Technique|Service\b|de pose/)).toBeNull();

    await typeText(view, 'Nom de la prestation', 'Pose gel avec séchage à l’air');
    await typeText(view, 'Prix de la prestation', '60');
    await typeText(view, 'Durée de la prestation', '45');
    await act(async () => {
      fireEvent(view.getByTestId('service-form-phased-switch'), 'valueChange', true);
    });
    await act(async () => fireEvent.press(view.getByLabelText('Développer la phase 1')));
    await typeText(view, 'Nom de la phase 1', 'Pose du gel');
    await act(async () => fireEvent.press(view.getByLabelText('Développer la phase 2')));
    await typeText(view, 'Durée de la phase 2', '10');
    expect(view.getByLabelText('Phase 2, temps d’attente')).toBeTruthy();
    expect(view.queryByText(/Technique|de pose|Temps de pose/)).toBeNull();
    await press(view, 'save-service');

    const created = probe.current!.services.find((entry) => entry.name === 'Pose gel avec séchage à l’air')!;
    // The prestation name is the professional's — never read as a waiting phase.
    expect(created.phases.map((phase) => [phase.name, phase.durationMinutes, phase.requiresStaff])).toEqual([
      ['Pose du gel', 45, true],
      ['Temps d’attente', 10, false],
    ]);
    expect(auth.current?.status).toBe('unauthenticated');
  });

  it('esthetics: the facial reads « dont 15 min d’attente » in Prestations & tarifs', async () => {
    const { view } = await renderDemo('ESTHETICS', () => <ServiceCatalogScreen />);
    expect(view.getByText('1 h · dont 15 min d’attente')).toBeTruthy();
    expect(view.queryByText(/de pose/)).toBeNull();
  });

  it('esthetics: the facial’s Details show « Temps d’attente », like its appointment Details', async () => {
    const { view } = await renderDemo('ESTHETICS', (data) => (
      <ServiceEditorScreen mode="existing" serviceId={`${data.business.id}-service-facial`} />
    ));
    expect(view.getByTestId('service-processing')).toBeTruthy();
    expect(view.getAllByText('Temps d’attente').length).toBeGreaterThanOrEqual(3);
    expect(view.queryByText(/Temps de pose|Technique/)).toBeNull();
  });
});

// Final UX: long prestation names wrap instead of being cut, while the time, the price and
// the chevron keep their place; the nails soak-off example is booked today.
describe('Playground — long prestation names in appointment Details', () => {
  it('nails: « Dépose par dissolution » and its phases wrap on two lines; time and price never shrink', async () => {
    const { view, scenario } = await renderDemo('NAILS', (data) => (
      <AppointmentDetailsScreen appointmentId={`${data.business.id}-appointment-t6`} />
    ));
    const [soakOff, semi] = findAppointment(appointmentId(scenario, 't6')).items;
    expect([soakOff!.serviceName, semi!.serviceName]).toEqual(['Dépose par dissolution', 'Semi-permanent mains']);

    const section = within(view.getByTestId(`service-section-${soakOff!.id}`));
    expect(section.getByText('Dépose par dissolution').props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(section.getByText('12:00').props.style).flexShrink).toBe(0);
    expect(StyleSheet.flatten(section.getByText(/€/).props.style).flexShrink).toBe(0);
    expect(section.getByText('35 min · 3 phases')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText(/^Dépose par dissolution, commence à/));
    });
    expect(section.getByText('Préparation et pose des papillotes').props.numberOfLines).toBe(2);
    expect(section.getByText('Temps d’attente')).toBeTruthy();
    expect(section.getByText('Retrait et finition')).toBeTruthy();
  });
});
