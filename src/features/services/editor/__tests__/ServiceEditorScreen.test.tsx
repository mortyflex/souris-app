import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, Text } from 'react-native';

import { ServiceCatalogProvider, useServiceCatalog } from '../../session/ServiceCatalogProvider';
import { ServiceEditorScreen } from '../ServiceEditorScreen';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const AnimatedView = (props: { readonly children?: React.ReactNode }) =>
    React.createElement(View, props);

  return {
    __esModule: true,
    default: Object.assign(AnimatedView, {
      View: AnimatedView,
      createAnimatedComponent: (component: unknown) => component,
    }),
    useSharedValue: (initial: unknown) => {
      let value = initial;
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
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: never[]) => void, ...args: never[]) => fn(...args),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

function CatalogProbe() {
  const { services } = useServiceCatalog();
  const managed =
    services.find((service) => service.name === 'Coupe enfant') ??
    services.find((service) => service.name === 'Balayage test') ??
    services.find((service) => service.id === 'service-brushing-brushing-1');
  const brushing = services.find(
    (service) => service.id === 'service-brushing-brushing-1',
  );

  return (
    <>
      <Text testID="managed-service">
        {managed
          ? `${managed.id}:${managed.name}:${managed.type}:${managed.price}:${managed.phases
              .map(
                (phase) =>
                  `${phase.id},${phase.name},${phase.durationMinutes},${phase.requiresStaff}`,
              )
              .join('|')}`
          : ''}
      </Text>
      <Text testID="brushing-active">
        {brushing ? String(brushing.active) : 'gone'}
      </Text>
    </>
  );
}

function renderEditor(screen: React.ReactNode) {
  return render(
    <ServiceCatalogProvider>
      {screen}
      <CatalogProbe />
    </ServiceCatalogProvider>,
  );
}

describe('ServiceEditorScreen', () => {
  beforeEach(() => mockBack.mockClear());

  it('creates a simple Service from the professional-facing fields', async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByText('Prestation simple'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom de la prestation'), 'Coupe enfant');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de la prestation'), '25');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de la prestation'), '30');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('save-service'));
    });

    const stored = view.getByTestId('managed-service').props.children as string;
    expect(stored).toContain(':Coupe enfant:SERVICE:25:');
    expect(stored).toContain(',Coupe enfant,30,true');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('creates an arbitrary ordered TECHNIQUE with explicit processing semantics', async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByText('Prestation technique'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom de la prestation'), 'Balayage test');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de la prestation'), '95');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom de la phase 1'), 'Application');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de la phase 1'), '30');
    });

    await act(async () => {
      fireEvent.press(view.getByText('Ajouter une phase'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de la phase 2'), '45');
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Phase 2, temps de pose'));
    });
    // A processing phase has one canonical identity: no custom name input.
    expect(view.queryByLabelText('Nom de la phase 2')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByText('Ajouter une phase'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom de la phase 3'), 'Finition');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de la phase 3'), '30');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('save-service'));
    });

    const stored = view.getByTestId('managed-service').props.children as string;
    expect(stored).toContain(':Balayage test:TECHNIQUE:95:');
    expect(stored).toContain(',Application,30,true|');
    expect(stored).toContain(',Temps de pose,45,false|');
    expect(stored).toContain(',Finition,30,true');
  });

  it('keeps read-only Service details concise for active and processing phases', async () => {
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="technique-balayage-balayage-1"
      />,
    );

    // Balayage 1: active phase + Temps de pose processing phase.
    expect(view.getAllByText('Balayage 1').length).toBeGreaterThanOrEqual(1);
    expect(view.getByText('Temps actif')).toBeTruthy();
    expect(view.getAllByText('Temps de pose').length).toBeGreaterThanOrEqual(1);
    // Read-only surfaces never repeat "professionnelle occupée/disponible".
    expect(view.queryByText(/professionnelle/i)).toBeNull();
  });

  it('keeps only one phase expanded and preserves values across collapse', async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByText('Prestation technique'));
    });
    // Phase 1 starts expanded.
    expect(view.getByLabelText('Nom de la phase 1')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom de la phase 1'), 'Application');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de la phase 1'), '30');
    });

    // Adding a phase collapses the current one and expands the new one.
    await act(async () => {
      fireEvent.press(view.getByText('Ajouter une phase'));
    });
    expect(view.queryByLabelText('Nom de la phase 1')).toBeNull();
    expect(view.getByLabelText('Nom de la phase 2')).toBeTruthy();
    // The collapsed card keeps its identity, semantic type, and drag handle.
    expect(view.getByLabelText('Développer la phase 1')).toBeTruthy();
    expect(view.getAllByText('Temps actif').length).toBeGreaterThan(0);
    expect(view.getByLabelText('Déplacer la phase 1')).toBeTruthy();

    // Expanding a collapsed phase collapses the previous one; values survive.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer la phase 1'));
    });
    expect(view.getByLabelText('Nom de la phase 1')).toBeTruthy();
    expect(view.queryByLabelText('Nom de la phase 2')).toBeNull();
    expect(view.getByDisplayValue('Application')).toBeTruthy();
    expect(view.getByDisplayValue('30')).toBeTruthy();

    // A third phase keeps the accordion rule.
    await act(async () => {
      fireEvent.press(view.getByText('Ajouter une phase'));
    });
    expect(view.queryByLabelText('Nom de la phase 1')).toBeNull();
    expect(view.getByLabelText('Nom de la phase 3')).toBeTruthy();
  });

  it('restores the draft active name when switching back from processing', async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByText('Prestation technique'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom de la phase 1'), 'Rinçage');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de la phase 1'), '10');
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Phase 1, temps de pose'));
    });
    expect(view.queryByLabelText('Nom de la phase 1')).toBeNull();

    // Back to active: the previous draft name is restored.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Phase 1, temps actif'));
    });
    expect(view.getByLabelText('Nom de la phase 1')).toBeTruthy();
    expect(view.getByDisplayValue('Rinçage')).toBeTruthy();
  });

  it('requires a real name for an active phase switched from processing', async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByText('Prestation technique'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de la phase 1'), '20');
    });
    // Unnamed active phase → processing → back to active: no silent
    // "Temps de pose" save; the form requires a name.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Phase 1, temps de pose'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Phase 1, temps actif'));
    });
    expect(view.getByLabelText('Nom de la phase 1').props.value).toBe('');
    expect(view.getByTestId('save-service').props.accessibilityState?.disabled).toBe(
      true,
    );
  });

  it('shows a Nouvelle phase placeholder for unnamed active phases without weakening validation', async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByText('Prestation technique'));
    });

    // Unnamed active phase: soft placeholder title, empty draft name.
    expect(view.getByText('Nouvelle phase')).toBeTruthy();
    expect(view.getByLabelText('Nom de la phase 1').props.value).toBe('');
    expect(view.getByTestId('save-service').props.accessibilityState?.disabled).toBe(
      true,
    );

    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom de la prestation'), 'Balayage');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de la prestation'), '95');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de la phase 1'), '30');
    });

    // Still unnamed: the placeholder remains and validation keeps failing.
    expect(view.getByText('Nouvelle phase')).toBeTruthy();
    expect(view.getByTestId('save-service').props.accessibilityState?.disabled).toBe(
      true,
    );

    // A real name replaces the placeholder and unlocks saving.
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom de la phase 1'), 'Application');
    });
    expect(view.queryByText('Nouvelle phase')).toBeNull();
    expect(view.getByText('Application')).toBeTruthy();
    expect(view.getByTestId('save-service').props.accessibilityState?.disabled).toBe(
      false,
    );
  });

  it('collapses an unnamed phase into the placeholder and never stores it', async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByText('Prestation technique'));
    });
    await act(async () => {
      fireEvent.press(view.getByText('Ajouter une phase'));
    });

    // Phase 1 collapsed unnamed + phase 2 expanded unnamed: both show the
    // placeholder while the draft names stay empty.
    expect(view.getAllByText('Nouvelle phase').length).toBe(2);
    expect(view.queryByLabelText('Nom de la phase 1')).toBeNull();
    expect(view.getByLabelText('Nom de la phase 2').props.value).toBe('');
    expect(view.getByTestId('save-service').props.accessibilityState?.disabled).toBe(
      true,
    );

    // Switching phase 2 to processing shows the canonical Temps de pose title.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Phase 2, temps de pose'));
    });
    expect(view.getAllByText('Temps de pose').length).toBeGreaterThanOrEqual(1);
    expect(view.getAllByText('Nouvelle phase').length).toBe(1);
  });

  it('hydrates an existing Service and edits it without changing stable identity', async () => {
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="service-brushing-brushing-1"
      />,
    );

    await act(async () => {
      fireEvent.press(view.getByTestId('edit-service'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de la prestation'), '28');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de la prestation'), '35');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('save-service'));
    });

    expect(view.getByTestId('managed-service').props.children).toBe(
      'service-brushing-brushing-1:Brushing 1:SERVICE:28:service-brushing-brushing-1-phase,Brushing 1,35,true',
    );
    expect(view.getByText('28,00 €')).toBeTruthy();
    expect(view.getByText('35 min')).toBeTruthy();
  });

  it('deletes only after explicit confirmation and closes the details', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="service-brushing-brushing-1"
      />,
    );

    await act(async () => {
      fireEvent.press(
        view.getByLabelText('Supprimer définitivement cette prestation'),
      );
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Supprimer définitivement cette prestation ?',
      expect.stringContaining('Les rendez-vous existants'),
      expect.anything(),
    );

    // Cancel does nothing.
    const cancel = alertSpy.mock.calls[0][2]?.find(
      (button) => button.text === 'Annuler',
    );
    await act(async () => {
      cancel?.onPress?.();
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByTestId('managed-service').props.children).toContain('Brushing 1');

    // Confirming removes the catalog record and closes the sheet.
    await act(async () => {
      fireEvent.press(
        view.getByLabelText('Supprimer définitivement cette prestation'),
      );
    });
    const confirm = alertSpy.mock.calls[1][2]?.find(
      (button) => button.text === 'Supprimer définitivement',
    );
    expect(confirm).toBeTruthy();
    await act(async () => {
      confirm?.onPress?.();
    });

    expect(view.getByTestId('managed-service').props.children).toBe('');
    expect(view.getByTestId('brushing-active').props.children).toBe('gone');
    expect(mockBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('deactivation closes the details and reactivation does the same', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="service-brushing-brushing-1"
      />,
    );

    await act(async () => {
      fireEvent.press(view.getByText('Désactiver'));
    });
    const deactivate = alertSpy.mock.calls[0][2]?.find(
      (button) => button.text === 'Désactiver',
    );
    expect(deactivate).toBeTruthy();
    await act(async () => {
      deactivate?.onPress?.();
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('brushing-active').props.children).toBe('false');

    await act(async () => {
      fireEvent.press(view.getByText('Réactiver'));
    });

    expect(mockBack).toHaveBeenCalledTimes(2);
    expect(view.getByTestId('brushing-active').props.children).toBe('true');
    alertSpy.mockRestore();
  });
});
