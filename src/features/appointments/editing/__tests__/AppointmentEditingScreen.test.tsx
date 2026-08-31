import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, Pressable, Text } from 'react-native';

import { createAppointmentItemSnapshot } from '@/domain/appointments';
import { AppointmentSessionProvider, useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ServiceCatalogProvider, useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { haptics } from '@/shared/lib/haptics';

import { AppointmentEditingScreen } from '../AppointmentEditingScreen';

const mockBack = jest.fn();
const mockSuccessHaptic = jest.spyOn(haptics, 'success').mockImplementation();

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
    useAnimatedStyle: (style: () => object) => style(),
    useEvent: () => () => undefined,
    useReducedMotion: () => false,
    useSharedValue: (init: unknown) => {
      let value = init;
      return {
        get: () => value,
        set: (next: unknown) => {
          value = next;
        },
      };
    },
    withTiming: (value: unknown) => value,
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: never[]) => void, ...args: never[]) => fn(...args),
}));

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    DateTimePicker: (props: {
      readonly onValueChange?: (event: unknown, date: Date) => void;
    }) =>
      React.createElement(
        Pressable,
        {
          testID: 'mock-date-picker',
          onPress: () => props.onValueChange?.({}, new Date(2026, 8, 1, 12, 0)),
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
    <ClientSessionProvider>
      <ServiceCatalogProvider>
        <AppointmentSessionProvider>
          <AppointmentEditingScreen key={appointmentId} appointmentId={appointmentId} />
          <SessionProbe />
        </AppointmentSessionProvider>
      </ServiceCatalogProvider>
    </ClientSessionProvider>
  );
}

function renderEditor(appointmentId = 'agenda-sofia') {
  return render(editorTree(appointmentId));
}

describe('AppointmentEditingScreen', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockSuccessHaptic.mockClear();
  });

  it('initializes from the existing Appointment snapshot and keeps the final service', async () => {
    const view = await renderEditor();

    expect(view.getByText('MODIFIER LE RENDEZ-VOUS')).toBeTruthy();
    expect(view.queryByText('Modifier le rendez-vous')).toBeNull();
    expect(view.getByText('95,00 €')).toBeTruthy();
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
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de Temps de pose'), '40');
    });

    expect(view.getByLabelText('Durée de Temps de pose').props.value).toBe('40');
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
      fireEvent.press(view.getByLabelText('Coupe Brushing 1, 50 min, 40,00 €'));
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

    // Expand and remove the newly-added draft.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Coupe Brushing 1'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Retirer Coupe Brushing 1'));
    });
    expect(view.queryByLabelText(/^Développer Coupe Brushing 1$/)).toBeNull();

    // The catalog card is available again: tapping it re-adds the Service.
    await act(async () => {
      fireEvent.press(view.getByText('Coupe Brushing 1'));
    });
    expect(view.getAllByLabelText(/^Développer Coupe Brushing 1$/)).toHaveLength(1);
  });

  it('discards unsaved changes from Annuler without changing session state', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Abandonner')?.onPress?.();
    });
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

    expect(view.getByTestId('session-items').props.children).toContain('item-sofia:Balayage:95:');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Abandonner les modifications ?',
      'Les modifications non enregistrées seront perdues.',
      expect.any(Array),
    );
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

    expect(view.getByText('81,00 €')).toBeTruthy();
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
    expect(view.getByText('81,00 €')).toBeTruthy();
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
      fireEvent.press(view.getByLabelText("Changer l'heure"));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Avancer de 5 minutes'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText("Terminer la modification de l'heure"));
    });

    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(false);

    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    const after = Number(view.getByTestId('session-start-at').props.children);
    expect(after - before).toBe(5 * 60 * 1000);
    expect(view.getByTestId('session-items').props.children).toContain('item-sofia:Balayage:95:');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('changes the date keeping the local time of day, and discarding leaves the Appointment unchanged', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Abandonner')?.onPress?.();
    });
    const view = await renderEditor();
    const before = Number(view.getByTestId('session-start-at').props.children);

    await act(async () => {
      fireEvent.press(view.getByLabelText('Changer la date'));
    });
    expect(view.getByText('Date du rendez-vous')).toBeTruthy();
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

    expect(Number(view.getByTestId('session-start-at').props.children)).toBe(before);
    expect(mockBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('saves a changed date with the local time of day preserved', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Changer la date'));
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

    // agenda-sofia starts at 14:00 on the fixture day; the mock picker moves
    // the date to 1 September 2026 while keeping 14:00 local.
    const after = Number(view.getByTestId('session-start-at').props.children);
    expect(after).toBe(new Date(2026, 8, 1, 14, 0).getTime());
    expect(view.getByTestId('session-items').props.children).toContain('item-sofia:Balayage:95:');
  });

  it('changes the Appointment client through the shared picker, with save/discard semantics', async () => {
    const view = await renderEditor();

    // Initial client: Sofia Petit (fixture agenda-sofia).
    expect(view.getByText('Sofia Petit')).toBeTruthy();
    expect(view.getByTestId('session-client-id').props.children).toBe('client-agenda-sofia');

    // Open the focused picker and choose Léa Martin.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Modifier la cliente'));
    });
    expect(view.getByText('Choisir la cliente')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'léa');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Léa Martin'));
    });

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
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Abandonner')?.onPress?.();
    });
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Modifier la cliente'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'léa');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Léa Martin'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('cancel-appointment-edit'));
    });

    expect(view.getByTestId('session-client-id').props.children).toBe('client-agenda-sofia');
    alertSpy.mockRestore();
  });

  it('shows the explicit context actions instead of generic wording', async () => {
    const view = await renderEditor();

    expect(view.getByLabelText('Modifier la cliente')).toBeTruthy();
    expect(view.getByLabelText('Changer la date')).toBeTruthy();
    expect(view.getByLabelText("Changer l'heure")).toBeTruthy();
    expect(view.queryByText('Modifier')).toBeNull();
  });
});
