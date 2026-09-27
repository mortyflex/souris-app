// Souris — SMS fidélisation Settings screen (SMS pivot Phase 2)
//
// The real screen against the fake gateway: both automations OFF by
// default with the V1 knobs displayed read-only, each switch persisted
// server-side BEFORE the UI claims it, the disable independence, the
// failure copy and the offline fail-safe (disabled, untouchable controls).

import { act, fireEvent, render } from '@testing-library/react-native';

import { CommunicationsGatewayProvider } from '@/features/communications/session/CommunicationsGatewayProvider';
import {
  createFakeCommunicationsGateway,
  DEFAULT_LIFECYCLE_SMS_PREFERENCES,
  type FakeCommunicationsGateway,
} from '@/features/communications/testing/fake-communications-gateway';
import { haptics } from '@/shared/lib/haptics';
import { testBusiness, TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { LifecycleSmsSettingsScreen } from '../LifecycleSmsSettingsScreen';

jest.spyOn(haptics, 'success').mockImplementation();
jest.spyOn(haptics, 'warning').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    SymbolView: () => React.createElement(React.Fragment, null),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

async function renderSettings(gateway: FakeCommunicationsGateway | undefined) {
  const view = await render(
    <TestPersistenceProvider>
      <CommunicationsGatewayProvider gateway={gateway}>
        <LifecycleSmsSettingsScreen />
      </CommunicationsGatewayProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
}

const toggle = (
  view: Awaited<ReturnType<typeof renderSettings>>,
  testID: string,
  value: boolean,
) =>
  act(async () => {
    fireEvent(view.getByTestId(`${testID}-switch`), 'valueChange', value);
  });

describe('LifecycleSmsSettingsScreen', () => {
  it('reads both automations OFF by default with the V1 knobs', async () => {
    const view = await renderSettings(createFakeCommunicationsGateway());

    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.value).toBe(false);
    expect(view.getByTestId('lifecycle-winback-toggle-switch').props.value).toBe(false);
    expect(view.getByText('Anniversaires')).toBeTruthy();
    expect(view.getByText('Clientes inactives')).toBeTruthy();
    expect(view.getByText('15 %')).toBeTruthy();
    expect(view.getByText('10 %')).toBeTruthy();
    expect(view.getByText('60 jours')).toBeTruthy();
    expect(view.getAllByText('7 jours')).toHaveLength(2);
  });

  it('enabling the birthday automation persists server-side before the UI claims it', async () => {
    const gateway = createFakeCommunicationsGateway();
    const view = await renderSettings(gateway);

    await toggle(view, 'lifecycle-birthday-toggle', true);

    expect(gateway.lifecycleUpdates).toEqual([
      {
        businessId: testBusiness.id,
        preferences: { ...DEFAULT_LIFECYCLE_SMS_PREFERENCES, birthdaySmsEnabled: true },
      },
    ]);
    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.value).toBe(true);
    expect(view.getByTestId('lifecycle-winback-toggle-switch').props.value).toBe(false);
  });

  it('disabling one automation never touches the other', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedLifecycleSmsPreferences(testBusiness.id, {
      ...DEFAULT_LIFECYCLE_SMS_PREFERENCES,
      birthdaySmsEnabled: true,
      winbackSmsEnabled: true,
    });
    const view = await renderSettings(gateway);

    await toggle(view, 'lifecycle-winback-toggle', false);

    expect(gateway.lifecycleUpdates.at(-1)?.preferences).toEqual({
      ...DEFAULT_LIFECYCLE_SMS_PREFERENCES,
      birthdaySmsEnabled: true,
      winbackSmsEnabled: false,
    });
    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.value).toBe(true);
    expect(view.getByTestId('lifecycle-winback-toggle-switch').props.value).toBe(false);
  });

  it('a failing update keeps the last known state and explains', async () => {
    const gateway = createFakeCommunicationsGateway();
    const view = await renderSettings(gateway);
    gateway.failNext('NETWORK');

    await toggle(view, 'lifecycle-birthday-toggle', true);

    expect(view.getByText(/Impossible d’enregistrer le réglage/)).toBeTruthy();
    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.value).toBe(false);
  });

  it('offline fails safe: disabled switches, untouchable controls, the offline notice', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.failNext('NETWORK');
    const view = await renderSettings(gateway);

    expect(view.getByText(/Connexion indisponible/)).toBeTruthy();
    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.value).toBe(false);
    await toggle(view, 'lifecycle-birthday-toggle', true);
    expect(gateway.calls.updateLifecycle).toBe(0);
  });

  it('without a configured gateway everything reads disabled', async () => {
    const view = await renderSettings(undefined);

    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.value).toBe(false);
    expect(view.getByTestId('lifecycle-winback-toggle-switch').props.value).toBe(false);
    expect(view.getByText(/Connexion indisponible/)).toBeTruthy();
  });
});
