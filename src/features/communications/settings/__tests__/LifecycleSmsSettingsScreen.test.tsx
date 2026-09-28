// Souris — SMS fidélisation Settings screen (SMS pivot Phase 2)
//
// The real screen against the fake gateway: both automations OFF by
// default with the server-returned knobs, each switch persisted server-side
// BEFORE the UI claims it, the disable independence, the numeric steppers
// (ranges, single-knob writes, optimistic value with rollback, the
// INVALID_VALUE refusal), the failure copy and the offline fail-safe
// (disabled, untouchable controls, no local fallback values).

import { act, fireEvent, render } from '@testing-library/react-native';

import type { UpdateLifecycleSmsPreferencesResult } from '@/features/communications/gateway';

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
const selectionHaptic = jest.spyOn(haptics, 'selection').mockImplementation();
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

const press = (view: Awaited<ReturnType<typeof renderSettings>>, testID: string) =>
  act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });

const valueOf = (view: Awaited<ReturnType<typeof renderSettings>>, stepper: string) =>
  view.getByTestId(`${stepper}-value`).props.children as string;

const isDisabled = (view: Awaited<ReturnType<typeof renderSettings>>, testID: string) =>
  view.getByTestId(testID).props.accessibilityState?.disabled === true;

const STEPPERS = [
  'lifecycle-birthday-discount',
  'lifecycle-birthday-validity',
  'lifecycle-winback-after',
  'lifecycle-winback-discount',
  'lifecycle-winback-validity',
] as const;

beforeEach(() => {
  selectionHaptic.mockClear();
});

describe('LifecycleSmsSettingsScreen', () => {
  it('reads both automations OFF with the knobs the server returns', async () => {
    const view = await renderSettings(createFakeCommunicationsGateway());

    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.value).toBe(false);
    expect(view.getByTestId('lifecycle-winback-toggle-switch').props.value).toBe(false);
    expect(view.getByText('Anniversaires')).toBeTruthy();
    expect(view.getByText('Clientes inactives')).toBeTruthy();
    expect(valueOf(view, 'lifecycle-birthday-discount')).toBe('15 %');
    expect(valueOf(view, 'lifecycle-birthday-validity')).toBe('7 jours');
    expect(valueOf(view, 'lifecycle-winback-after')).toBe('60 jours');
    expect(valueOf(view, 'lifecycle-winback-discount')).toBe('10 %');
    expect(valueOf(view, 'lifecycle-winback-validity')).toBe('7 jours');
  });

  it('shows the stored values, not the historical defaults', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedLifecycleSmsPreferences(testBusiness.id, {
      ...DEFAULT_LIFECYCLE_SMS_PREFERENCES,
      birthdayDiscountPercent: 25,
      birthdayValidityDays: 1,
      winbackAfterDays: 90,
    });
    const view = await renderSettings(gateway);

    expect(valueOf(view, 'lifecycle-birthday-discount')).toBe('25 %');
    expect(valueOf(view, 'lifecycle-birthday-validity')).toBe('1 jour');
    expect(valueOf(view, 'lifecycle-winback-after')).toBe('90 jours');
    expect(view.queryByText('15 %')).toBeNull();
  });

  it('birthday discount: plus 15 → 20, minus 20 → 15, each step sending only that knob', async () => {
    const gateway = createFakeCommunicationsGateway();
    const update = jest.spyOn(gateway, 'updateLifecycleSmsPreferences');
    const view = await renderSettings(gateway);

    await press(view, 'lifecycle-birthday-discount-increment');
    expect(valueOf(view, 'lifecycle-birthday-discount')).toBe('20 %');
    expect(update).toHaveBeenLastCalledWith(testBusiness.id, {
      birthdaySmsEnabled: false,
      winbackSmsEnabled: false,
      birthdayDiscountPercent: 20,
    });

    await press(view, 'lifecycle-birthday-discount-decrement');
    expect(valueOf(view, 'lifecycle-birthday-discount')).toBe('15 %');
    expect(update).toHaveBeenLastCalledWith(testBusiness.id, {
      birthdaySmsEnabled: false,
      winbackSmsEnabled: false,
      birthdayDiscountPercent: 15,
    });
    expect(selectionHaptic).toHaveBeenCalledTimes(2);
  });

  it('a knob change keeps the switches and every other knob', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedLifecycleSmsPreferences(testBusiness.id, {
      ...DEFAULT_LIFECYCLE_SMS_PREFERENCES,
      birthdaySmsEnabled: true,
      winbackDiscountPercent: 30,
    });
    const view = await renderSettings(gateway);

    await press(view, 'lifecycle-winback-validity-increment');

    expect(gateway.lifecycleUpdates.at(-1)?.preferences).toEqual({
      ...DEFAULT_LIFECYCLE_SMS_PREFERENCES,
      birthdaySmsEnabled: true,
      winbackDiscountPercent: 30,
      winbackValidityDays: 8,
    });
    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.value).toBe(true);
    expect(view.getByTestId('lifecycle-winback-toggle-switch').props.value).toBe(false);
  });

  it('discount bounds: minus disabled at 5 %, plus disabled at 50 %, no write and no tick', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedLifecycleSmsPreferences(testBusiness.id, {
      ...DEFAULT_LIFECYCLE_SMS_PREFERENCES,
      birthdayDiscountPercent: 5,
      winbackDiscountPercent: 50,
    });
    const view = await renderSettings(gateway);

    expect(isDisabled(view, 'lifecycle-birthday-discount-decrement')).toBe(true);
    expect(isDisabled(view, 'lifecycle-birthday-discount-increment')).toBe(false);
    expect(isDisabled(view, 'lifecycle-winback-discount-increment')).toBe(true);
    expect(isDisabled(view, 'lifecycle-winback-discount-decrement')).toBe(false);

    await press(view, 'lifecycle-birthday-discount-decrement');
    await press(view, 'lifecycle-winback-discount-increment');
    expect(gateway.calls.updateLifecycle).toBe(0);
    expect(selectionHaptic).not.toHaveBeenCalled();
    expect(valueOf(view, 'lifecycle-birthday-discount')).toBe('5 %');
    expect(valueOf(view, 'lifecycle-winback-discount')).toBe('50 %');
  });

  it('validity: 7 → plus 8 → minus 7', async () => {
    const gateway = createFakeCommunicationsGateway();
    const view = await renderSettings(gateway);

    await press(view, 'lifecycle-birthday-validity-increment');
    expect(valueOf(view, 'lifecycle-birthday-validity')).toBe('8 jours');
    await press(view, 'lifecycle-birthday-validity-decrement');
    expect(valueOf(view, 'lifecycle-birthday-validity')).toBe('7 jours');
    expect(gateway.lifecycleUpdates.map((u) => u.preferences.birthdayValidityDays)).toEqual([8, 7]);
  });

  it('win-back inactivity: 60 → plus 75 → minus 60', async () => {
    const gateway = createFakeCommunicationsGateway();
    const update = jest.spyOn(gateway, 'updateLifecycleSmsPreferences');
    const view = await renderSettings(gateway);

    await press(view, 'lifecycle-winback-after-increment');
    expect(valueOf(view, 'lifecycle-winback-after')).toBe('75 jours');
    expect(update).toHaveBeenLastCalledWith(testBusiness.id, {
      birthdaySmsEnabled: false,
      winbackSmsEnabled: false,
      winbackAfterDays: 75,
    });
    await press(view, 'lifecycle-winback-after-decrement');
    expect(valueOf(view, 'lifecycle-winback-after')).toBe('60 jours');
    expect(gateway.lifecycleUpdates.at(-1)?.preferences.winbackAfterDays).toBe(60);
  });

  it('a pending step disables only its own stepper; the rest keeps its look but takes no touch', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedLifecycleSmsPreferences(testBusiness.id, {
      ...DEFAULT_LIFECYCLE_SMS_PREFERENCES,
      birthdaySmsEnabled: true,
      winbackSmsEnabled: true,
    });
    let answer: (result: UpdateLifecycleSmsPreferencesResult) => void = () => {};
    const update = jest.spyOn(gateway, 'updateLifecycleSmsPreferences').mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const view = await renderSettings(gateway);

    await press(view, 'lifecycle-birthday-discount-increment');

    // The step shows at once; only its own stepper looks pending.
    expect(valueOf(view, 'lifecycle-birthday-discount')).toBe('20 %');
    expect(isDisabled(view, 'lifecycle-birthday-discount-increment')).toBe(true);
    expect(isDisabled(view, 'lifecycle-birthday-discount-decrement')).toBe(true);
    // The switches keep their real ON value and their normal enabled look.
    for (const toggleID of ['lifecycle-birthday-toggle', 'lifecycle-winback-toggle']) {
      expect(view.getByTestId(`${toggleID}-switch`).props.value).toBe(true);
      expect(view.getByTestId(`${toggleID}-switch`).props.disabled).toBe(false);
    }
    // The other steppers keep their normal look.
    for (const stepper of STEPPERS.filter((id) => id !== 'lifecycle-birthday-discount')) {
      expect(isDisabled(view, `${stepper}-decrement`)).toBe(false);
      expect(isDisabled(view, `${stepper}-increment`)).toBe(false);
    }
    // …but the container takes no touch: no overlapping write can start.
    expect(view.getByTestId('lifecycle-controls').props.pointerEvents).toBe('none');
    await press(view, 'lifecycle-winback-after-increment');
    await toggle(view, 'lifecycle-winback-toggle', false);
    expect(update).toHaveBeenCalledTimes(1);
    expect(valueOf(view, 'lifecycle-winback-after')).toBe('60 jours');

    await act(async () => {
      answer({
        status: 'UPDATED',
        preferences: {
          ...DEFAULT_LIFECYCLE_SMS_PREFERENCES,
          birthdaySmsEnabled: true,
          winbackSmsEnabled: true,
          birthdayDiscountPercent: 20,
        },
      });
    });
    expect(valueOf(view, 'lifecycle-birthday-discount')).toBe('20 %');
    expect(isDisabled(view, 'lifecycle-birthday-discount-increment')).toBe(false);
    expect(view.getByTestId('lifecycle-controls').props.pointerEvents).toBe('auto');
    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.value).toBe(true);
  });

  it('a pending switch disables only itself', async () => {
    const gateway = createFakeCommunicationsGateway();
    jest
      .spyOn(gateway, 'updateLifecycleSmsPreferences')
      .mockImplementation(() => new Promise(() => {}));
    const view = await renderSettings(gateway);

    await toggle(view, 'lifecycle-birthday-toggle', true);

    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.disabled).toBe(true);
    expect(view.getByTestId('lifecycle-winback-toggle-switch').props.disabled).toBe(false);
    for (const stepper of STEPPERS) {
      expect(isDisabled(view, `${stepper}-increment`)).toBe(false);
    }
    expect(view.getByTestId('lifecycle-controls').props.pointerEvents).toBe('none');
  });

  it('a failing step rolls back to the last confirmed value and explains', async () => {
    const gateway = createFakeCommunicationsGateway();
    const view = await renderSettings(gateway);
    gateway.failNext('NETWORK');

    await press(view, 'lifecycle-winback-discount-increment');

    expect(valueOf(view, 'lifecycle-winback-discount')).toBe('10 %');
    expect(view.getByText(/Impossible d’enregistrer le réglage/)).toBeTruthy();
    expect(gateway.lifecycleUpdates).toEqual([]);
  });

  it('INVALID_VALUE rolls back with its own message', async () => {
    const gateway = createFakeCommunicationsGateway();
    const view = await renderSettings(gateway);
    gateway.refuseNextLifecycleUpdate();

    await press(view, 'lifecycle-birthday-discount-increment');

    expect(valueOf(view, 'lifecycle-birthday-discount')).toBe('15 %');
    expect(view.getByText('Cette valeur n’est pas autorisée.')).toBeTruthy();
    expect(view.queryByText(/Impossible d’enregistrer/)).toBeNull();
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

  it('a failed first read fails safe: no fallback values, no steppers, no « dernier connu »', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.failNext('NETWORK');
    const view = await renderSettings(gateway);

    expect(view.getByText(/les réglages n’ont pas pu être chargés/)).toBeTruthy();
    expect(view.queryByText(/dernier connu/)).toBeNull();
    for (const text of ['15 %', '10 %', '7 jours', '60 jours']) {
      expect(view.queryByText(text)).toBeNull();
    }
    for (const stepper of STEPPERS) {
      expect(valueOf(view, stepper)).toBe('—');
      expect(isDisabled(view, `${stepper}-decrement`)).toBe(true);
      expect(isDisabled(view, `${stepper}-increment`)).toBe(true);
      await press(view, `${stepper}-increment`);
    }
    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.value).toBe(false);
    await toggle(view, 'lifecycle-birthday-toggle', true);
    expect(gateway.calls.updateLifecycle).toBe(0);
  });

  it('a retry after a failed first read loads the server values', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedLifecycleSmsPreferences(testBusiness.id, {
      ...DEFAULT_LIFECYCLE_SMS_PREFERENCES,
      winbackDiscountPercent: 25,
    });
    gateway.failNext('NETWORK');
    const view = await renderSettings(gateway);

    await act(async () => {
      fireEvent.press(view.getByText('Réessayer'));
    });

    expect(valueOf(view, 'lifecycle-winback-discount')).toBe('25 %');
    expect(view.queryByText(/Connexion indisponible/)).toBeNull();
    expect(isDisabled(view, 'lifecycle-winback-discount-increment')).toBe(false);
  });

  it('without a configured gateway everything reads disabled', async () => {
    const view = await renderSettings(undefined);

    expect(view.getByTestId('lifecycle-birthday-toggle-switch').props.value).toBe(false);
    expect(view.getByTestId('lifecycle-winback-toggle-switch').props.value).toBe(false);
    expect(view.getByText(/Connexion indisponible/)).toBeTruthy();
    expect(view.queryByText(/dernier connu/)).toBeNull();
    for (const stepper of STEPPERS) {
      expect(isDisabled(view, `${stepper}-increment`)).toBe(true);
    }
  });
});
