import { act, fireEvent, render } from '@testing-library/react-native';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { settleFloatingReveal } from '@/shared/ui/testing/sheet-transitions';

import { AgendaScreen } from '../AgendaScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush }),
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

function renderAgenda() {
  return render(
    <TestPersistenceProvider>
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AgendaScreen />
        </AppointmentSessionProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

describe('AgendaScreen', () => {
  beforeEach(() => mockPush.mockClear());

  it('anchors the decorative calendar watermark to the title block, hidden from accessibility', async () => {
    const view = await renderAgenda();

    expect(view.getByRole('header')).toBeTruthy();
    expect(view.queryByTestId('screen-watermark-agenda')).toBeNull();
    const watermark = view.getByTestId('screen-watermark-agenda', { includeHiddenElements: true });
    expect(watermark.props.pointerEvents).toBe('none');
    expect(watermark.props.accessibilityElementsHidden).toBe(true);
    expect(watermark.props.importantForAccessibility).toBe('no-hide-descendants');
    // The watermark shares the title block, never the device edge.
    expect(watermark.parent).toBe(view.getByRole('header').parent);
    // The contextual date eyebrow and the title both remain.
    expect(view.getByRole('header', { name: "Aujourd'hui" })).toBeTruthy();
  });

  it('lets the day timeline scroll above the native tab bar through the system content inset', async () => {
    const view = await renderAgenda();
    const timelines = view.container.queryAll((node) => node.type === 'RCTScrollView');
    expect(timelines).toHaveLength(1);
    expect(timelines[0].props.contentInsetAdjustmentBehavior).toBe('automatic');
  });

  it('opens the existing Appointment creation flow from the floating +', async () => {
    const view = await renderAgenda();
    await settleFloatingReveal();

    await act(async () => fireEvent.press(view.getByTestId('agenda-create-appointment')));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const [destination] = mockPush.mock.calls[0] as [{ pathname: string; params: { startAt: string } }];
    expect(destination.pathname).toBe('/appointments/new');
    expect(new Date(destination.params.startAt).getHours()).toBe(8);
  });
});
