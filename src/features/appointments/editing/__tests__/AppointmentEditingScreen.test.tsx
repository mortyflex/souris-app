import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Alert, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { createAppointmentItemSnapshot } from '@/domain/appointments';
import { AppointmentSessionProvider, useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider, useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { ServiceCatalogProvider, useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { haptics } from '@/shared/lib/haptics';
import { semanticColors, serviceCategoryColors } from '@/shared/ui/theme';

import { AppointmentEditingScreen } from '../AppointmentEditingScreen';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import { insertAppointmentDeposit } from '@/persistence/stores/appointment-deposits';
import { loadAppointments } from '@/persistence/stores/appointments';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';
import { settleWheelOn, wheelRowKeys, wheelValue } from '@/shared/ui/testing/wheels';

const mockBack = jest.fn();
const mockSuccessHaptic = jest.spyOn(haptics, 'success').mockImplementation();
const mockDestructiveHaptic = jest.spyOn(haptics, 'destructive').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: jest.fn(),
}));

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

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    DateTimePicker: (props: {
      readonly onValueChange?: (event: unknown, date: Date) => void;
      readonly value: Date;
    }) =>
      React.createElement(
        Pressable,
        {
          testID: 'mock-date-picker',
          onPress: () => {
            const nextDate = new Date(props.value);
            nextDate.setDate(nextDate.getDate() + 1);
            props.onValueChange?.({}, nextDate);
          },
        },
      ),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View: NativeView } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(NativeView, props, children),
  };
});

function SessionProbe() {
  const { getAppointmentById, updateAppointment, addAppointment } = useAppointmentSession();
  const { getServiceById, setServiceActive } = useServiceCatalog();
  const { archiveClient, updateClient } = useClientSession();
  const entry = getAppointmentById('agenda-sofia');
  const items = entry?.appointment.items ?? [];
  const catalogEntry = getAppointmentById('catalog-edit-appointment');
  const catalogItems = catalogEntry?.appointment.items ?? [];
  const duplicateEntry = getAppointmentById('duplicate-service-appointment');
  const duplicateItems = duplicateEntry?.appointment.items ?? [];
  const brushing = getServiceById('service-brushing-brushing-1');
  return (
    <>
      <Text testID="session-items">
        {items
          .map(
            (item) =>
              `${item.id}:${item.serviceName}:${item.price}:${item.phases
                .map((phase) => `${phase.id}=${phase.durationMinutes}`)
                .join(',')}`,
          )
          .join('|')}
      </Text>
      <Text testID="session-discount">{JSON.stringify(entry?.appointment.discount ?? null)}</Text>
      <Text testID="session-catalog-edit-discount">
        {JSON.stringify(catalogEntry?.appointment.discount ?? null)}
      </Text>
      <Text testID="session-start-at">{entry?.appointment.startAt.getTime() ?? ''}</Text>
      <Text testID="session-client-id">{entry?.appointment.clientId ?? ''}</Text>
      <Text testID="session-catalog-edit-items">
        {catalogItems
          .map(
            (item) =>
              `${item.id}:${item.serviceName}:${item.price}:${item.phases
                .map((phase) => `${phase.id}=${phase.durationMinutes}`)
                .join(',')}`,
          )
          .join('|')}
      </Text>
      <Text testID="session-duplicate-items">
        {duplicateItems
          .map(
            (item) =>
              `${item.id}:${item.serviceName}:${item.price}:${item.phases
                .map((phase) => `${phase.id}=${phase.durationMinutes}`)
                .join(',')}`,
          )
          .join('|')}
      </Text>
      <Text testID="catalog-brushing-1">
        {brushing
          ? `${brushing.price}:${brushing.phases
              .map((phase) => phase.durationMinutes)
              .join(',')}:${brushing.active}`
          : 'missing'}
      </Text>
      <Pressable
        testID="add-catalog-backed-appointment"
        onPress={() => {
          if (!brushing) return;
          const item = createAppointmentItemSnapshot({
            id: 'catalog-edit-item',
            order: 0,
            service: brushing,
            price: 81,
          });
          addAppointment({
            appointment: {
              id: 'catalog-edit-appointment',
              businessId: 'fixture-business',
              clientId: 'client-agenda-sofia',
              staffMemberId: 'staff-amelie',
              startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
              status: 'SCHEDULED',
              items: [item],
            },
          });
        }}
      />
      <Pressable
        testID="add-duplicate-service-appointment"
        onPress={() => {
          if (!brushing) return;
          const itemA = createAppointmentItemSnapshot({
            id: 'dup-item-a',
            order: 0,
            service: brushing,
            price: 20,
          });
          const itemB = createAppointmentItemSnapshot({
            id: 'dup-item-b',
            order: 1,
            service: brushing,
            price: 25,
          });
          addAppointment({
            appointment: {
              id: 'duplicate-service-appointment',
              businessId: 'fixture-business',
              clientId: 'client-agenda-sofia',
              staffMemberId: 'staff-amelie',
              startAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
              status: 'SCHEDULED',
              items: [itemA, itemB],
            },
          });
        }}
      />
      <Pressable
        testID="add-discounted-appointment"
        onPress={() => {
          if (!brushing) return;
          addAppointment({
            appointment: {
              id: 'catalog-edit-appointment',
              businessId: 'fixture-business',
              clientId: 'client-agenda-sofia',
              staffMemberId: 'staff-amelie',
              startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
              status: 'SCHEDULED',
              items: [
                createAppointmentItemSnapshot({
                  id: 'catalog-edit-item',
                  order: 0,
                  service: brushing,
                  price: 100,
                }),
              ],
              discount: { type: 'PERCENT', percent: 20 },
            },
          });
        }}
      />
      <Pressable testID="archive-lea" onPress={() => archiveClient('client-agenda-lea')} />
      <Pressable
        testID="give-sofia-appointment-day-birthday"
        onPress={() => {
          if (!entry) return;
          // Sofia's birthday = the local day of HER Appointment (agenda-sofia).
          updateClient({
            id: 'client-agenda-sofia',
            firstName: 'Sofia',
            lastName: 'Petit',
            birthday: {
              month: entry.appointment.startAt.getMonth() + 1,
              day: entry.appointment.startAt.getDate(),
            },
          });
        }}
      />
      <Pressable
        testID="deactivate-brushing"
        onPress={() => setServiceActive('service-brushing-brushing-1', false)}
      />
      <Pressable
        testID="complete-edited-appointment"
        onPress={() => {
          if (!entry) return;
          updateAppointment({
            appointment: { ...entry.appointment, status: 'COMPLETED' },
          });
        }}
      />
    </>
  );
}

function editorTree(appointmentId: string) {
  return (
    <TestPersistenceProvider>
      <ClientSessionProvider>
      <ServiceCatalogProvider>
        <AppointmentSessionProvider>
          <CalendarBlockSessionProvider>
            <AppointmentEditingScreen key={appointmentId} appointmentId={appointmentId} />
            <SessionProbe />
          </CalendarBlockSessionProvider>
        </AppointmentSessionProvider>
      </ServiceCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>
  );
}

function renderEditor(appointmentId = 'agenda-sofia') {
  return render(editorTree(appointmentId));
}

function backgroundOf(element: { readonly props: { readonly style?: unknown } }) {
  return StyleSheet.flatten(element.props.style as StyleProp<ViewStyle>)?.backgroundColor;
}

function borderOf(element: { readonly props: { readonly style?: unknown } }) {
  return StyleSheet.flatten(element.props.style as StyleProp<ViewStyle>)?.borderColor;
}

describe('AppointmentEditingScreen', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  beforeEach(() => {
    mockBack.mockClear();
    mockSuccessHaptic.mockClear();
    mockDestructiveHaptic.mockClear();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('initializes from the existing Appointment snapshot and keeps the final service', async () => {
    const view = await renderEditor();

    expect(view.getByText('RENDEZ-VOUS')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Modifier le rendez-vous' })).toBeTruthy();
    expect(within(view.getByTestId('appointment-selected-services')).getByText('95,00 €')).toBeTruthy();
    expect(view.queryByLabelText('Prix de Balayage')).toBeNull();
    expect(view.getByText('1 h + 55 min de pose')).toBeTruthy();
    expect(view.queryByLabelText('Retirer Balayage')).toBeNull();
    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(true);
  });

  it('edits price and processing on the snapshot, then updates the shared session on save', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage'), '90');
    });
    // Timing uses the shared ±5 stepper: no minute TextInput, no keyboard.
    expect(view.queryByLabelText('Durée de Temps de pose')).toBeNull();
    for (let index = 0; index < 3; index += 1) {
      await act(async () => {
        fireEvent.press(view.getByLabelText('Réduire le temps de pose de 5 minutes'));
      });
    }

    expect(view.getByTestId('phase-duration-sofia-processing-value').props.children).toBe('40 min');
    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(false);
    expect(mockSuccessHaptic).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    expect(view.getByTestId('session-items').props.children).toContain(
      'item-sofia:Balayage:90:sofia-application=30,sofia-processing=40,sofia-finish=30',
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
  });

  it('appends catalog services immediately without any add confirmation', async () => {
    const view = await renderEditor();

    // Same compact grouped picker as Creation, directly on this screen.
    expect(view.getByText('Services')).toBeTruthy();
    expect(view.getByText('Techniques')).toBeTruthy();
    expect(view.queryByTestId('confirm-add-services')).toBeNull();

    await act(async () => {
      fireEvent.changeText(
        view.getByPlaceholderText('Rechercher une prestation'),
        'coupe brushing 1',
      );
    });
    await act(async () => {
      fireEvent.press(view.getByText('Coupe Brushing 1'));
    });

    // The draft is appended IMMEDIATELY; no intermediate CTA.
    expect(view.queryByText('Ajouter la prestation')).toBeNull();
    expect(view.queryByText(/Ajouter \d+ prestations/)).toBeNull();
    expect(view.getByLabelText('Développer Coupe Brushing 1')).toBeTruthy();

    // Catalog remains untouched before Save.
    expect(view.getByTestId('catalog-brushing-1').props.children).toBe('20:30:true');

    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    const sessionItems = view.getByTestId('session-items').props.children as string;
    expect(sessionItems).toContain('item-sofia:Balayage:95:sofia-application=30,sofia-processing=55,sofia-finish=30');
    expect(sessionItems).toMatch(
      /agenda-sofia-item-new-\d+-\d+:Coupe Brushing 1:40:technique-coupe-coupe-brushing-1-active=50/,
    );
    expect(sessionItems).toContain('agenda-sofia-item-new-');
  });

  it('adds several services immediately, without scroll jumps or duplicates', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une prestation'), 'coupe');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Coupe Brushing 1'));
    });
    await act(async () => {
      fireEvent.press(view.getByText('Coupe Femme / Homme'));
    });

    // Both drafts are already in the ordered stack, reorderable.
    expect(view.getByLabelText('Développer Coupe Brushing 1')).toBeTruthy();
    expect(view.getByLabelText('Développer Coupe Femme / Homme')).toBeTruthy();
    expect(view.getAllByLabelText(/^Déplacer /)).toHaveLength(3);

    // A second tap on an already-added catalog Service creates no duplicate.
    await act(async () => {
      fireEvent.press(view.getByLabelText(/^Coupe Brushing 1, 50 min, .*, Service$/));
    });
    expect(view.getAllByLabelText(/^Développer Coupe Brushing 1$/)).toHaveLength(1);
  });

  it('makes a catalog Service available again after removing its Appointment item', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une prestation'), 'coupe brushing 1');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Coupe Brushing 1'));
    });
    expect(view.getAllByLabelText(/^Développer Coupe Brushing 1$/)).toHaveLength(1);

    // Remove the newly-added draft through its swipe action (the trash).
    await act(async () => {
      fireEvent.press(view.getByLabelText('Retirer Coupe Brushing 1 du rendez-vous'));
    });
    expect(view.queryByLabelText(/^Développer Coupe Brushing 1$/)).toBeNull();

    // The catalog card is available again: tapping it re-adds the Service.
    await act(async () => {
      fireEvent.press(view.getByText('Coupe Brushing 1'));
    });
    expect(view.getAllByLabelText(/^Développer Coupe Brushing 1$/)).toHaveLength(1);
  });

  it('discards unsaved changes from Annuler through the shared dialog without changing session state', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage'), '90');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('cancel-appointment-edit'));
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.getByTestId('discard-appointment-edit-dialog')).toBeTruthy();
    expect(view.getByText('Abandonner les modifications ?')).toBeTruthy();
    expect(view.getByText('Les modifications non enregistrées seront perdues.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(view.getByTestId('keep-editing-appointment'));
    });
    expect(view.queryByTestId('discard-appointment-edit-dialog')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(view.getByTestId('cancel-appointment-edit'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('discard-appointment-edit'));
    });

    expect(view.getByTestId('session-items').props.children).toContain('item-sofia:Balayage:95:');
    expect(mockBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('stops editing when the appointment reaches a terminal outcome', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByTestId('complete-edited-appointment'));
    });

    expect(view.getByText('Modification indisponible')).toBeTruthy();
    expect(view.queryByTestId('save-appointment-edit')).toBeNull();
  });

  it('keeps existing Appointment edits snapshot-only and never rewrites the catalog', async () => {
    const view = await renderEditor();

    // Seed an Appointment whose snapshot originates from a real catalog
    // Service (Brushing 1, 20 € / 30 min) but was booked at 80 €.
    await act(async () => {
      fireEvent.press(view.getByTestId('add-catalog-backed-appointment'));
    });
    await act(async () => {
      view.rerender(editorTree('catalog-edit-appointment'));
    });

    expect(within(view.getByTestId('appointment-selected-services')).getByText('81,00 €')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Brushing 1'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Brushing 1'), '85');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    // The Appointment snapshot is updated…
    expect(view.getByTestId('session-catalog-edit-items').props.children).toContain(
      'catalog-edit-item:Brushing 1:85:service-brushing-brushing-1-phase=30',
    );
    // …while the canonical catalog keeps its defaults.
    expect(view.getByTestId('catalog-brushing-1').props.children).toBe('20:30:true');
  });

  it('keeps duplicate retained snapshots independent and never merges them', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByTestId('add-duplicate-service-appointment'));
    });
    await act(async () => {
      view.rerender(editorTree('duplicate-service-appointment'));
    });

    // Two retained AppointmentItems share one serviceId but stay two drafts.
    const expandLabels = view.getAllByLabelText(/^Développer Brushing 1$/);
    expect(expandLabels).toHaveLength(2);
    expect(view.getAllByLabelText('Déplacer Brushing 1')).toHaveLength(2);

    await act(async () => {
      fireEvent.press(expandLabels[0]);
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Brushing 1'), '30');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    const duplicateItems = view.getByTestId('session-duplicate-items').props.children as string;
    expect(duplicateItems).toContain('dup-item-a:Brushing 1:30:');
    expect(duplicateItems).toContain('dup-item-b:Brushing 1:25:');
  });

  describe('swipe-to-remove a Service', () => {
    /** Opens the editor on the two-item Appointment (dup-item-a 20 € · dup-item-b 25 €). */
    async function renderTwoServiceEditor() {
      const view = await renderEditor();
      await act(async () => {
        fireEvent.press(view.getByTestId('add-duplicate-service-appointment'));
      });
      await act(async () => {
        view.rerender(editorTree('duplicate-service-appointment'));
      });
      expect(view.getAllByLabelText(/^Développer Brushing 1$/)).toHaveLength(2);
      return view;
    }

    function persistedItemIds(view: Awaited<ReturnType<typeof renderEditor>>): string[] {
      return (view.getByTestId('session-duplicate-items').props.children as string)
        .split('|')
        .filter(Boolean)
        .map((entry) => entry.split(':')[0]!);
    }

    it('shows no visible Retirer control; each removable Service exposes the swipe action instead', async () => {
      const view = await renderTwoServiceEditor();

      expect(view.queryByText('Retirer')).toBeNull();
      expect(view.getAllByLabelText('Retirer Brushing 1 du rendez-vous')).toHaveLength(2);
      expect(view.getByTestId('appointment-draft-dup-item-a')).toBeTruthy();
      expect(view.getByTestId('appointment-draft-dup-item-b')).toBeTruthy();
      // Tap still expands the timing accordion; the price field and steppers are reachable.
      await act(async () => {
        fireEvent.press(view.getAllByLabelText(/^Développer Brushing 1$/)[0]);
      });
      expect(view.getByLabelText('Prix de Brushing 1')).toBeTruthy();
      expect(view.getAllByLabelText('Retirer Brushing 1 du rendez-vous')).toHaveLength(2);
    });

    it('keeps the expansion state of an editor card through a swipe: only a tap toggles it', async () => {
      const view = await renderTwoServiceEditor();
      const content = view.getByTestId('appointment-draft-dup-item-b-content');
      const touch = (pageX: number, pageY: number) => ({ nativeEvent: { pageX, pageY } });

      // Same shared guard as every swipe-to-delete row: sideways = swipe, never a tap.
      expect(content.props.onStartShouldSetResponderCapture(touch(80, 200))).toBe(false);
      expect(content.props.onMoveShouldSetResponderCapture(touch(82, 260))).toBe(false);
      expect(content.props.onMoveShouldSetResponderCapture(touch(92, 203))).toBe(true);

      // Collapsed → partial swipe → both cards still collapsed.
      await act(async () => {
        fireEvent.press(view.getByTestId('appointment-draft-dup-item-b-swipe-partial'));
      });
      expect(view.getAllByLabelText(/^Développer Brushing 1$/)).toHaveLength(2);
      expect(view.queryByLabelText(/^Réduire Brushing 1$/)).toBeNull();

      // A tap expands one card; a partial swipe on it leaves it expanded.
      await act(async () => {
        fireEvent.press(view.getAllByLabelText(/^Développer Brushing 1$/)[1]);
      });
      expect(view.getAllByLabelText(/^Réduire Brushing 1$/)).toHaveLength(1);
      await act(async () => {
        fireEvent.press(view.getByTestId('appointment-draft-dup-item-b-swipe-partial'));
      });
      expect(view.getAllByLabelText(/^Réduire Brushing 1$/)).toHaveLength(1);
      expect(view.getAllByLabelText(/^Développer Brushing 1$/)).toHaveLength(1);
    });

    it('removes the Service from the draft only, then persists it with the existing save', async () => {
      const view = await renderTwoServiceEditor();
      const catalogBefore = view.getByTestId('catalog-brushing-1').props.children;

      await act(async () => {
        fireEvent.press(view.getByTestId('appointment-draft-dup-item-b-swipe-partial'));
      });
      // Partial swipe: the Service is still in the draft until the trash is tapped.
      expect(view.getAllByLabelText(/^Développer Brushing 1$/)).toHaveLength(2);
      await act(async () => {
        fireEvent.press(view.getByTestId('remove-appointment-draft-dup-item-b'));
      });

      // Draft: one Service. Canonical Appointment (session + SQLite): still two.
      expect(view.getAllByLabelText(/^Développer Brushing 1$/)).toHaveLength(1);
      expect(view.queryByTestId('appointment-draft-dup-item-b')).toBeNull();
      expect(persistedItemIds(view)).toEqual(['dup-item-a', 'dup-item-b']);
      expect(mockDestructiveHaptic).toHaveBeenCalledTimes(1);
      expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(false);

      await act(async () => {
        fireEvent.press(view.getByTestId('save-appointment-edit'));
      });

      expect(persistedItemIds(view)).toEqual(['dup-item-a']);
      expect(view.getByTestId('catalog-brushing-1').props.children).toBe(catalogBefore);
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    });

    it('commits a full swipe exactly once to the draft', async () => {
      const view = await renderTwoServiceEditor();

      await act(async () => {
        fireEvent.press(view.getByTestId('appointment-draft-dup-item-a-swipe-full'));
      });

      expect(view.getAllByLabelText(/^Développer Brushing 1$/)).toHaveLength(1);
      expect(view.queryByTestId('appointment-draft-dup-item-a')).toBeNull();
      expect(mockDestructiveHaptic).toHaveBeenCalledTimes(1);
      expect(persistedItemIds(view)).toEqual(['dup-item-a', 'dup-item-b']);

      await act(async () => {
        fireEvent.press(view.getByTestId('save-appointment-edit'));
      });
      expect(persistedItemIds(view)).toEqual(['dup-item-b']);
    });

    it('never removes the final Service: a lone Service has no swipe action', async () => {
      const view = await renderTwoServiceEditor();
      await act(async () => {
        fireEvent.press(view.getByTestId('appointment-draft-dup-item-b-swipe-full'));
      });

      expect(view.queryByLabelText('Retirer Brushing 1 du rendez-vous')).toBeNull();
      expect(view.queryByTestId('appointment-draft-dup-item-a')).toBeNull();
      expect(view.getAllByLabelText(/^Développer Brushing 1$/)).toHaveLength(1);
    });

    it('leaves the persisted Appointment untouched when the edit is discarded after a swipe removal', async () => {
      const view = await renderTwoServiceEditor();
      await act(async () => {
        fireEvent.press(view.getByTestId('appointment-draft-dup-item-b-swipe-full'));
      });
      expect(view.getAllByLabelText(/^Développer Brushing 1$/)).toHaveLength(1);

      await act(async () => {
        fireEvent.press(view.getByTestId('cancel-appointment-edit'));
      });
      await act(async () => {
        fireEvent.press(view.getByTestId('discard-appointment-edit'));
      });
      await settleSheetTransition();

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(persistedItemIds(view)).toEqual(['dup-item-a', 'dup-item-b']);
      expect(mockSuccessHaptic).not.toHaveBeenCalled();

      // Reopening the editor hydrates both Services again from the persisted snapshot.
      await act(async () => {
        view.rerender(editorTree('duplicate-service-appointment-reopened'));
      });
      await act(async () => {
        view.rerender(editorTree('duplicate-service-appointment'));
      });
      expect(view.getAllByLabelText(/^Développer Brushing 1$/)).toHaveLength(2);
    });

    it('plays the swipe hint once on the first removable Service only, after the screen settles', async () => {
      const view = await renderTwoServiceEditor();
      expect(view.queryByTestId('appointment-draft-dup-item-a-hint')).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(view.getByTestId('appointment-draft-dup-item-a-hint')).toBeTruthy();
      expect(view.queryByTestId('appointment-draft-dup-item-b-hint')).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(view.queryByTestId('appointment-draft-dup-item-a-hint')).toBeNull();

      // A later mount of a row (removal promotes dup-item-b) never replays it.
      await act(async () => {
        fireEvent.press(view.getByTestId('appointment-draft-dup-item-a-swipe-full'));
      });
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(view.queryByTestId('appointment-draft-dup-item-b-hint')).toBeNull();
    });

    it('offers no swipe removal during creation-style lists where removal is disabled', async () => {
      // The single-Service Appointment: the final Service can never be removed.
      const view = await renderEditor();
      expect(view.queryByLabelText('Retirer Balayage du rendez-vous')).toBeNull();
      expect(view.queryByTestId('appointment-draft-item-sofia')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(1500);
      });
      expect(view.queryByTestId('appointment-draft-item-sofia-hint')).toBeNull();
    });
  });

  it('keeps a retained item editable when its catalog Service becomes inactive', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByTestId('add-catalog-backed-appointment'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('deactivate-brushing'));
    });
    await act(async () => {
      view.rerender(editorTree('catalog-edit-appointment'));
    });

    // The retained snapshot keeps its old price and stays editable.
    expect(within(view.getByTestId('appointment-selected-services')).getByText('81,00 €')).toBeTruthy();
    expect(view.getByTestId('catalog-brushing-1').props.children).toBe('20:30:false');

    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Brushing 1'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Brushing 1'), '85');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    expect(view.getByTestId('session-catalog-edit-items').props.children).toContain(
      'catalog-edit-item:Brushing 1:85:',
    );
  });

  it('edits the appointment time and saves the new startAt with items intact', async () => {
    const view = await renderEditor();
    const before = Number(view.getByTestId('session-start-at').props.children);

    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(view.getByTestId('edit-time'));
    });
    // Same wheels as Creation, opened on the Appointment's own start time; an
    // existing Appointment may sit anywhere in its day (00 → 23).
    const start = new Date(before);
    expect(wheelValue(view, 'start-time-wheel-hour')).toBe(`${start.getHours()} heures`);
    expect(wheelValue(view, 'start-time-wheel-minute')).toBe(`${start.getMinutes()} minutes`);
    expect(wheelRowKeys(view, 'start-time-wheel-hour')).toEqual(
      Array.from({ length: 24 }, (_, index) => String(index)),
    );

    await settleWheelOn(view, 'start-time-wheel-hour', '23');
    await settleWheelOn(view, 'start-time-wheel-minute', '40');
    await act(async () => {
      fireEvent.press(view.getByLabelText("Terminer la modification de l'heure"));
    });

    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(false);

    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    // Same local date, the chosen time of day.
    const after = new Date(Number(view.getByTestId('session-start-at').props.children));
    expect([after.getFullYear(), after.getMonth(), after.getDate()]).toEqual([
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    ]);
    expect([after.getHours(), after.getMinutes()]).toEqual([23, 40]);
    expect(view.getByTestId('session-items').props.children).toContain('item-sofia:Balayage:95:');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('changes the date keeping the local time of day, and discarding leaves the Appointment unchanged', async () => {
    const view = await renderEditor();
    const before = Number(view.getByTestId('session-start-at').props.children);

    await act(async () => {
      fireEvent.press(view.getByTestId('edit-date'));
    });
    expect(view.getByText('Date du rendez-vous')).toBeTruthy();
    // The canonical editing header: « Annuler » leading, ONE title, no eyebrow.
    const dateSheetTitle = view
      .getAllByTestId('sheet-editing-header-title')
      .find((layer) => within(layer).queryByText('Date du rendez-vous') !== null)!;
    const dateSheetHeader = dateSheetTitle.parent!;
    const dateSheetLeading = within(dateSheetHeader).getByTestId('sheet-editing-header-leading');
    expect(within(dateSheetTitle).getByRole('header', { name: 'Date du rendez-vous' })).toBeTruthy();
    expect(dateSheetHeader.children.indexOf(dateSheetLeading)).toBeLessThan(
      dateSheetHeader.children.indexOf(dateSheetTitle),
    );
    expect(within(dateSheetLeading).getByTestId('cancel-date').props.accessibilityLabel).toBe('Annuler');
    expect(within(dateSheetHeader).queryByText('RENDEZ-VOUS')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('mock-date-picker'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('confirm-date'));
    });

    // Dirty after the date change; discard keeps the session untouched.
    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(false);
    await act(async () => {
      fireEvent.press(view.getByTestId('cancel-appointment-edit'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('discard-appointment-edit'));
    });

    expect(Number(view.getByTestId('session-start-at').props.children)).toBe(before);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('the leading « Annuler » of the date sheet closes it and keeps the date', async () => {
    const view = await renderEditor();
    const before = view.getByTestId('session-start-at').props.children;

    await act(async () => {
      fireEvent.press(view.getByTestId('edit-date'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('mock-date-picker'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('cancel-date'));
    });
    await settleSheetTransition();

    expect(view.queryByText('Date du rendez-vous')).toBeNull();
    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(true);
    expect(view.getByTestId('session-start-at').props.children).toBe(before);
  });

  it('saves a changed date with the local time of day preserved', async () => {
    const view = await renderEditor();
    const before = new Date(Number(view.getByTestId('session-start-at').props.children));

    await act(async () => {
      fireEvent.press(view.getByTestId('edit-date'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('mock-date-picker'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('confirm-date'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    // The mock picker moves one local calendar day while preserving 14:00.
    const expected = new Date(before);
    expected.setDate(expected.getDate() + 1);
    const after = Number(view.getByTestId('session-start-at').props.children);
    expect(after).toBe(expected.getTime());
    expect(view.getByTestId('session-items').props.children).toContain('item-sofia:Balayage:95:');
  });

  it('changes the Appointment client through the shared picker, with save/discard semantics', async () => {
    const view = await renderEditor();

    // Initial client: Sofia Petit (fixture agenda-sofia).
    expect(view.getByText('Sofia Petit')).toBeTruthy();
    expect(view.getByTestId('session-client-id').props.children).toBe('client-agenda-sofia');

    // Open the focused picker and choose Léa Martin.
    await act(async () => {
      fireEvent.press(view.getByTestId('edit-client'));
    });
    expect(view.getByText('Choisir un client')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'léa');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Léa Martin'));
    });
    await settleSheetTransition();

    // The editor shows the new client and becomes dirty; the session is untouched.
    expect(view.getByText('Léa Martin')).toBeTruthy();
    expect(view.getByTestId('session-client-id').props.children).toBe('client-agenda-sofia');
    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(false);

    // Save writes the new clientId through the Appointment update boundary.
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });
    expect(view.getByTestId('session-client-id').props.children).toBe('client-agenda-lea');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('discarding an edit preserves the original client', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByTestId('edit-client'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'léa');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Léa Martin'));
    });
    await settleSheetTransition();
    await act(async () => {
      fireEvent.press(view.getByTestId('cancel-appointment-edit'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('discard-appointment-edit'));
    });

    expect(view.getByTestId('session-client-id').props.children).toBe('client-agenda-sofia');
  });

  it('shows Client, Date and Heure as whole tappable rows without link labels', async () => {
    const view = await renderEditor();

    const clientRow = view.getByTestId('edit-client');
    expect(clientRow.props.accessibilityRole).toBe('button');
    expect(clientRow.props.accessibilityHint).toBe('Modifier le client');
    expect(view.getByTestId('edit-client-value').props.children).toBe('Sofia Petit');
    expect(view.getByTestId('edit-date').props.accessibilityHint).toBe('Changer la date');
    expect(view.getByTestId('edit-date').props.accessibilityLabel).toMatch(/^Date, /);
    expect(view.getByTestId('edit-time').props.accessibilityHint).toBe("Changer l'heure");
    expect(view.getByLabelText(/^Heure, \d{2}:\d{2}$/)).toBeTruthy();
    expect(view.queryByText('Modifier le client')).toBeNull();
    expect(view.queryByText('Changer la date')).toBeNull();
    expect(view.queryByText("Changer l'heure")).toBeNull();
    expect(view.queryByText('Modifier')).toBeNull();
  });

  it('never offers an archived Client for reassignment while the current Client keeps resolving', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('edit-client'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'léa martin');
    });

    expect(view.queryByText('Léa Martin')).toBeNull();
    expect(view.getByText('Aucun client trouvé')).toBeTruthy();
    expect(view.getByText('Sofia Petit')).toBeTruthy();
  });

  it('steps every phase by five down to zero and saves the snapshot only', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage'));
    });
    // Every duration control is a stepper; no number-pad input remains.
    expect(
      view.container.queryAll(
        (node) => node.type === 'TextInput' && node.props.keyboardType === 'number-pad',
      ),
    ).toHaveLength(0);
    expect(view.getByTestId('phase-duration-sofia-application-value').props.children).toBe('30 min');

    // 55 → 0 in eleven steps; the minus control then disables (never negative).
    for (let index = 0; index < 12; index += 1) {
      await act(async () => {
        fireEvent.press(view.getByTestId('phase-duration-sofia-processing-decrement'));
      });
    }
    expect(view.getByTestId('phase-duration-sofia-processing-value').props.children).toBe('0 min');
    expect(
      view.getByTestId('phase-duration-sofia-processing-decrement').props.accessibilityState.disabled,
    ).toBe(true);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Augmenter Application de 5 minutes'));
    });
    expect(view.getByTestId('phase-duration-sofia-application-value').props.children).toBe('35 min');
    expect(view.getAllByText('1 h 5 min').length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    // Zero persists explicitly and the phase is kept; the catalog is untouched.
    expect(view.getByTestId('session-items').props.children).toContain(
      'item-sofia:Balayage:95:sofia-application=35,sofia-processing=0,sofia-finish=30',
    );
    expect(view.getByTestId('catalog-brushing-1').props.children).toBe('20:30:true');
  });

  it('adds a discount as a draft: nothing is saved until « Enregistrer », then the Appointment carries it and its prices are untouched', async () => {
    const view = await renderEditor();
    const itemsBefore = view.getByTestId('session-items').props.children;

    expect(view.getByTestId('appointment-discount-summary').props.children).toBe('Aucune');
    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(view.getByTestId('appointment-discount-toggle'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Réduction de 20 pour cent'));
    });

    // Draft only: the session is unchanged, the form is dirty.
    expect(view.getByTestId('session-discount').props.children).toBe('null');
    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(false);

    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    expect(view.getByTestId('session-discount').props.children).toBe('{"type":"PERCENT","percent":20}');
    expect(view.getByTestId('session-items').props.children).toBe(itemsBefore);
    expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
  });

  it('hydrates an existing discount, lets it change to a fixed amount, and saves the change', async () => {
    const view = await renderEditor();
    await act(async () => {
      fireEvent.press(view.getByTestId('add-discounted-appointment'));
    });
    await act(async () => {
      view.rerender(editorTree('catalog-edit-appointment'));
    });

    // Opens expanded on the stored discount; an untouched form is not dirty.
    expect(view.getByTestId('appointment-discount-preset-PERCENT-20').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(view.getByLabelText('Réduction en euros'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Réduction de 15 euros'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    expect(view.getByTestId('session-catalog-edit-discount').props.children).toBe(
      '{"type":"FIXED","amountCents":1500}',
    );
  });

  it('removes an existing discount with « Aucune réduction » and saves the removal', async () => {
    const view = await renderEditor();
    await act(async () => {
      fireEvent.press(view.getByTestId('add-discounted-appointment'));
    });
    await act(async () => {
      view.rerender(editorTree('catalog-edit-appointment'));
    });

    await act(async () => {
      fireEvent.press(view.getByLabelText('Supprimer la réduction'));
    });
    expect(view.getByTestId('session-catalog-edit-discount').props.children).toBe('{"type":"PERCENT","percent":20}');
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    expect(view.getByTestId('session-catalog-edit-discount').props.children).toBe('null');
  });

  describe('birthday discount suggestion', () => {
    async function renderBirthdayEditor() {
      const view = await renderEditor();
      await act(async () => {
        fireEvent.press(view.getByTestId('give-sofia-appointment-day-birthday'));
      });
      return view;
    }

    it('suggests a discount when the Appointment date is the Client birthday', async () => {
      const view = await renderEditor();
      expect(view.queryByTestId('appointment-birthday-notice')).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByTestId('give-sofia-appointment-day-birthday'));
      });

      expect(view.getByTestId('appointment-birthday-notice')).toBeTruthy();
      expect(view.getByText('Anniversaire du client')).toBeTruthy();
      expect(view.getByRole('button', { name: 'Appliquer une réduction' })).toBeTruthy();
      // The reminder alone never dirties the form.
      expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(true);
    });

    it('removes the suggestion at once when the Appointment moves to another day', async () => {
      const view = await renderBirthdayEditor();
      expect(view.getByTestId('appointment-birthday-notice')).toBeTruthy();

      await act(async () => {
        fireEvent.press(view.getByTestId('edit-date'));
      });
      await act(async () => {
        fireEvent.press(view.getByTestId('mock-date-picker'));
      });
      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-date'));
      });

      expect(view.queryByTestId('appointment-birthday-notice')).toBeNull();
      expect(view.queryByText('Appliquer une réduction')).toBeNull();
    });

    it('removes the suggestion at once when another Client is chosen', async () => {
      const view = await renderBirthdayEditor();

      await act(async () => {
        fireEvent.press(view.getByTestId('edit-client'));
      });
      await act(async () => {
        fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'léa');
      });
      await act(async () => {
        fireEvent.press(view.getByText('Léa Martin'));
      });
      await settleSheetTransition();

      expect(view.getByText('Léa Martin')).toBeTruthy();
      expect(view.queryByTestId('appointment-birthday-notice')).toBeNull();
    });

    it('« Appliquer une réduction » opens the existing editor without choosing or saving anything', async () => {
      const view = await renderBirthdayEditor();
      expect(view.queryByTestId('appointment-discount-presets')).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByTestId('apply-birthday-discount'));
      });

      expect(view.getByTestId('appointment-discount-toggle').props.accessibilityState.expanded).toBe(true);
      const presets = within(view.getByTestId('appointment-discount-presets')).getAllByRole('button');
      expect(presets).toHaveLength(10);
      for (const preset of presets) {
        expect(preset.props.accessibilityState.selected).toBe(false);
      }
      expect(view.getByTestId('appointment-discount-summary').props.children).toBe('Aucune');
      // Still nothing to save, nothing written.
      expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(true);
      expect(view.getByTestId('session-discount').props.children).toBe('null');
      expect(view.queryByTestId('apply-birthday-discount')).toBeNull();
    });

    it('states an existing discount instead of prompting, and saves a plain generic discount', async () => {
      const view = await renderBirthdayEditor();
      const itemsBefore = view.getByTestId('session-items').props.children;
      await act(async () => {
        fireEvent.press(view.getByTestId('apply-birthday-discount'));
      });
      await act(async () => {
        fireEvent.press(view.getByLabelText('Réduction de 20 pour cent'));
      });

      expect(view.getByText('Une réduction est déjà appliquée à ce rendez-vous.')).toBeTruthy();
      expect(view.queryByTestId('apply-birthday-discount')).toBeNull();
      expect(view.queryByText(/réduction anniversaire appliquée/i)).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByTestId('save-appointment-edit'));
      });

      // Exactly the generic discount — no origin, reason or birthday marker — and untouched prices.
      expect(view.getByTestId('session-discount').props.children).toBe('{"type":"PERCENT","percent":20}');
      expect(view.getByTestId('session-items').props.children).toBe(itemsBefore);
    });

    it('offers no birthday discount action once the Appointment is completed', async () => {
      const view = await renderBirthdayEditor();
      await act(async () => {
        fireEvent.press(view.getByTestId('complete-edited-appointment'));
      });

      expect(view.getByText('Modification indisponible')).toBeTruthy();
      expect(view.queryByTestId('appointment-birthday-notice')).toBeNull();
      expect(view.queryByText('Appliquer une réduction')).toBeNull();
      expect(view.queryByTestId('appointment-discount')).toBeNull();
    });
  });

  describe('redesigned editing workspace', () => {
    it('keeps ONE vertical scroll, the header Annuler, and no footer Annuler', async () => {
      const view = await renderEditor();

      const scrolls = view.container.queryAll(
        (node) => node.type === 'RCTScrollView' && node.props.horizontal !== true,
      );
      expect(scrolls).toHaveLength(1);
      expect(view.getAllByText('Annuler')).toHaveLength(1);
      expect(
        within(view.getByTestId('appointment-edit-footer')).queryByText('Annuler'),
      ).toBeNull();
      expect(view.getByText('Prestations sélectionnées')).toBeTruthy();
      expect(view.getByText('Options')).toBeTruthy();
      expect(view.getByText('Ajouter des prestations')).toBeTruthy();
    });

    it('marks each selected prestation with its category, never by colour alone', async () => {
      const view = await renderEditor();

      const dot = view.getByTestId('draft-category-TECHNIQUE');
      expect(backgroundOf(dot)).toBe(serviceCategoryColors.TECHNIQUE.accent);
      expect(view.getByLabelText('Développer Balayage').props.accessibilityHint).toBe('Technique');
    });

    it('switches Services / Techniques with distinct category colours and selected state', async () => {
      const view = await renderEditor();

      const services = view.getByTestId('catalog-category-SERVICE');
      const techniques = view.getByTestId('catalog-category-TECHNIQUE');
      expect(services.props.accessibilityRole).toBe('tab');
      expect(services.props.accessibilityState).toEqual({ selected: true });
      expect(techniques.props.accessibilityState).toEqual({ selected: false });
      expect(backgroundOf(services)).toBe(serviceCategoryColors.SERVICE.strong);
      expect(backgroundOf(techniques)).not.toBe(serviceCategoryColors.TECHNIQUE.strong);
      expect(view.getByTestId('catalog-list-SERVICE')).toBeTruthy();
      expect(view.queryByText('Balayage 2')).toBeNull();

      await act(async () => {
        fireEvent.press(techniques);
      });

      expect(view.getByTestId('catalog-category-TECHNIQUE').props.accessibilityState).toEqual({
        selected: true,
      });
      expect(backgroundOf(view.getByTestId('catalog-category-TECHNIQUE'))).toBe(
        serviceCategoryColors.TECHNIQUE.strong,
      );
      expect(backgroundOf(view.getByTestId('catalog-category-SERVICE'))).not.toBe(
        serviceCategoryColors.SERVICE.strong,
      );
      expect(serviceCategoryColors.TECHNIQUE.strong).not.toBe(serviceCategoryColors.SERVICE.strong);
      expect(view.getByTestId('catalog-list-TECHNIQUE')).toBeTruthy();
      expect(view.getByText('Balayage 2')).toBeTruthy();
      expect(view.queryByText('Brushing 1')).toBeNull();
    });

    it('selects a Technique with the azure check and a Service with the violet one', async () => {
      const view = await renderEditor();

      // The catalogue is the shared card grid, not the former option rows.
      const brushingCard = view.getByTestId('service-card-service-brushing-brushing-1');
      expect(borderOf(brushingCard)).toBe(serviceCategoryColors.SERVICE.border);
      expect(view.container.queryAll((node) => /^service-row-/.test(String(node.props.testID)))).toEqual([]);

      await act(async () => {
        fireEvent.press(view.getByText('Brushing 1'));
      });
      const brushingCheck = view.getByTestId('service-card-service-brushing-brushing-1-check');
      expect(backgroundOf(brushingCheck)).toBe(serviceCategoryColors.SERVICE.accent);
      const selectedBrushing = view.getByTestId('service-card-service-brushing-brushing-1');
      expect(selectedBrushing.props.accessibilityState).toEqual({ selected: true });
      expect(backgroundOf(selectedBrushing)).toBe(serviceCategoryColors.SERVICE.tint);
      expect(borderOf(selectedBrushing)).toBe(serviceCategoryColors.SERVICE.accent);

      await act(async () => {
        fireEvent.press(view.getByTestId('catalog-category-TECHNIQUE'));
      });
      const balayage = view.getByLabelText(/^Balayage 2, /);
      expect(balayage.props.accessibilityState).toEqual({ selected: false });
      await act(async () => {
        fireEvent.press(balayage);
      });

      expect(view.getByLabelText(/^Balayage 2, /).props.accessibilityState).toEqual({
        selected: true,
      });
      const [techniqueCheck] = view.container.queryAll(
        (node) =>
          typeof node.props.testID === 'string' &&
          /^service-card-.*balayage-2-check$/.test(node.props.testID),
      );
      expect(backgroundOf(techniqueCheck)).toBe(serviceCategoryColors.TECHNIQUE.accent);
      expect(borderOf(view.getByLabelText(/^Balayage 2, /))).toBe(
        serviceCategoryColors.TECHNIQUE.accent,
      );
      expect(view.getByLabelText('Développer Balayage 2')).toBeTruthy();
    });

    it('searches inside each category and offers the other one when it holds the matches', async () => {
      const view = await renderEditor();

      await act(async () => {
        fireEvent.changeText(view.getByPlaceholderText('Rechercher une prestation'), 'balayage');
      });
      expect(view.getByText('Aucune prestation trouvée')).toBeTruthy();
      expect(view.getByText(/^Voir \d+ résultats? dans Techniques$/)).toBeTruthy();

      await act(async () => {
        fireEvent.press(view.getByTestId('catalog-show-other-category'));
      });
      expect(view.getByTestId('catalog-category-TECHNIQUE').props.accessibilityState).toEqual({
        selected: true,
      });
      expect(view.getByText('Balayage 2')).toBeTruthy();

      await act(async () => {
        fireEvent.changeText(view.getByPlaceholderText('Rechercher une prestation'), 'zzz');
      });
      expect(view.getByText('Aucune prestation trouvée')).toBeTruthy();
      expect(view.getByText('Essayez un autre nom.')).toBeTruthy();
    });

    it('updates the sticky summary live and keeps the save CTA violet', async () => {
      const view = await renderEditor();

      expect(view.getByTestId('appointment-edit-summary-label').props.children).toBe(
        '1 prestation · 1 h 55 min',
      );
      expect(view.getByTestId('appointment-edit-summary-total').props.children).toMatch(/^95,00\s€$/);
      expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(true);

      await act(async () => {
        fireEvent.press(view.getByTestId('catalog-category-TECHNIQUE'));
      });
      await act(async () => {
        fireEvent.press(view.getByTestId('catalog-category-SERVICE'));
      });
      await act(async () => {
        fireEvent.press(view.getByText('Brushing 1'));
      });

      expect(view.getByTestId('appointment-edit-summary-label').props.children).toBe(
        '2 prestations · 2 h 25 min',
      );
      expect(view.getByTestId('appointment-edit-summary-total').props.children).toMatch(/^115,00\s€$/);
      const save = view.getByTestId('save-appointment-edit');
      expect(save.props.accessibilityState.disabled).toBe(false);
      expect(backgroundOf(save)).toBe(semanticColors.accent);
    });
  });
});

describe('AppointmentEditingScreen — deposits', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('explains and refuses an edit that would take the total below the deposits; a covered edit saves', async () => {
    const database = openTestDatabase();
    bootstrapPersistence(database, () => createDevelopmentSeed(new Date()));
    // agenda-sofia: Balayage 95 €; 60 € already paid ahead.
    insertAppointmentDeposit(database, {
      id: 'deposit-sofia',
      businessId: 'business-test',
      appointmentId: 'agenda-sofia',
      amountCents: 6000,
      paymentMethod: 'CARD',
      paidAt: new Date(),
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    const view = await render(
      <TestPersistenceProvider database={database}>
        <ClientSessionProvider>
          <ServiceCatalogProvider>
            <AppointmentSessionProvider>
              <CalendarBlockSessionProvider>
                <AppointmentEditingScreen appointmentId="agenda-sofia" />
              </CalendarBlockSessionProvider>
            </AppointmentSessionProvider>
          </ServiceCatalogProvider>
        </ClientSessionProvider>
      </TestPersistenceProvider>,
    );
    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage'));
    });

    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage'), '50');
    });
    expect(view.getByTestId('appointment-edit-deposit-shortfall')).toBeTruthy();
    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage'), '60');
    });
    expect(view.queryByTestId('appointment-edit-deposit-shortfall')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });
    expect(loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia')?.items[0]?.price).toBe(60);
  });
});
