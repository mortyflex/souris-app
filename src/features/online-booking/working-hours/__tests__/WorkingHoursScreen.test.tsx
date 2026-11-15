// BeautIzzy — Plus › Horaires
//
// The real screen against the fake gateway: the week the server returns,
// one day saved at a time, breaks, inline validation (overlap, end before
// start), and the connectivity rule — no server answer, no week; a failed
// save changes nothing, keeps the edits open and is never retried behind
// the professional's back.

import { act, fireEvent, render } from '@testing-library/react-native';

import type { WorkingDay } from '@/domain/online-booking';
import { haptics } from '@/shared/lib/haptics';
import { settleWheelOn } from '@/shared/ui/testing/wheels';
import { testBusiness, TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { OnlineBookingGatewayProvider } from '../../session/OnlineBookingGatewayProvider';
import {
  createFakeOnlineBookingGateway,
  type FakeOnlineBookingGateway,
} from '../../testing/fake-online-booking-gateway';
import { WorkingHoursScreen } from '../WorkingHoursScreen';

const successHaptic = jest.spyOn(haptics, 'success').mockImplementation();
const warningHaptic = jest.spyOn(haptics, 'warning').mockImplementation();
jest.spyOn(haptics, 'selection').mockImplementation();

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

// The disclosure chevron of the time rows animates; nothing animates here.
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return { SymbolView: () => React.createElement(React.Fragment, null) };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

// The shared sheet is simply there or not; it reports its dismissal once hidden.
jest.mock('@/shared/ui/BottomSheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  function MockBottomSheet(props: {
    readonly visible: boolean;
    readonly header?: React.ReactNode;
    readonly footer?: React.ReactNode;
    readonly children?: React.ReactNode;
    readonly testID?: string;
    readonly onDismissed?: () => void;
  }) {
    const { visible, onDismissed } = props;
    React.useEffect(() => {
      if (!visible) onDismissed?.();
    }, [visible, onDismissed]);
    return visible ? React.createElement(View, { testID: props.testID }, props.header, props.children, props.footer) : null;
  }
  return { BottomSheet: MockBottomSheet };
});

type View = Awaited<ReturnType<typeof renderHours>>;

async function renderHours(gateway: FakeOnlineBookingGateway | undefined) {
  const view = await render(
    <TestPersistenceProvider>
      <OnlineBookingGatewayProvider gateway={gateway}>
        <WorkingHoursScreen />
      </OnlineBookingGatewayProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
}

const press = (view: View, testID: string) =>
  act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
const toggle = (view: View, testID: string, value: boolean) =>
  act(async () => {
    fireEvent(view.getByTestId(`${testID}-switch`), 'valueChange', value);
  });
const isDisabled = (view: View, testID: string) =>
  view.getByTestId(testID).props.accessibilityState?.disabled === true;
const summary = (view: View, weekday: number) =>
  view.getByTestId(`working-hours-day-${weekday}-summary`).props.children as string;

/** Opens a time row of the day sheet and settles its wheels on hh:mm. */
async function setTime(view: View, index: number, edge: 'start' | 'end', hour: string, minute: string) {
  await press(view, `working-interval-${index}-${edge}`);
  await settleWheelOn(view, `working-interval-${index}-${edge}-wheel-hour`, hour);
  await settleWheelOn(view, `working-interval-${index}-${edge}-wheel-minute`, minute);
  await press(view, 'working-interval-time-done');
}

const monday: WorkingDay = {
  weekday: 1,
  isOpen: true,
  intervals: [
    { startMinute: 540, endMinute: 720 },
    { startMinute: 840, endMinute: 1140 },
  ],
};

function seededGateway() {
  const gateway = createFakeOnlineBookingGateway(testBusiness.name);
  gateway.seedWorkingHours(testBusiness.id, [monday]);
  return gateway;
}

beforeEach(() => {
  successHaptic.mockClear();
  warningHaptic.mockClear();
  mockBack.mockReset();
});

describe('Horaires — loading', () => {
  it('without Supabase: a notice, no week and no retry', async () => {
    const view = await renderHours(undefined);
    expect(view.getByTestId('working-hours-offline')).toBeTruthy();
    expect(view.queryByTestId('working-hours-week')).toBeNull();
    expect(view.queryByTestId('working-hours-retry')).toBeNull();
  });

  it('offline: the notice and « Réessayer », then the week once the server answers', async () => {
    const gateway = seededGateway();
    gateway.failNext('NETWORK');
    const view = await renderHours(gateway);
    expect(view.getByText('Connexion nécessaire pour afficher et modifier vos horaires.')).toBeTruthy();
    expect(view.queryByTestId('working-hours-week')).toBeNull();

    await press(view, 'working-hours-retry');
    expect(view.getByTestId('working-hours-week')).toBeTruthy();
    expect(gateway.calls.readHours).toBe(2);
  });

  it('shows the seven days of the server, Monday first, with the break and the clock they follow', async () => {
    const gateway = seededGateway();
    const view = await renderHours(gateway);

    expect(summary(view, 1)).toBe('09:00 – 12:00 · 14:00 – 19:00');
    for (const weekday of [2, 3, 4, 5, 6, 7]) expect(summary(view, weekday)).toBe('Fermé');
    expect(view.getByTestId('working-hours-day-1').props.accessibilityLabel).toBe(
      'Lundi, de 9 heures à 12 heures, puis de 14 heures à 19 heures',
    );
    expect(view.getByTestId('working-hours-time-zone').props.children).toBe('Horaires à l’heure de Paris.');
    // Working hours never touch the public profile.
    expect(gateway.calls.read).toBe(0);
    expect(gateway.calls.update).toBe(0);
    expect(gateway.calls.setState).toBe(0);
  });
});

describe('Horaires — editing a day', () => {
  it('opens a closed day with the hours of the previous open one, then saves it at once', async () => {
    const gateway = seededGateway();
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-2');
    expect(view.getByTestId('working-day-sheet')).toBeTruthy();
    expect(isDisabled(view, 'working-day-save')).toBe(true); // nothing changed yet
    await toggle(view, 'working-day-open', true);
    expect(view.getByTestId('working-interval-0-start-value').props.children).toBe('09:00');
    expect(view.getByTestId('working-interval-1-end-value').props.children).toBe('19:00');

    await press(view, 'working-day-save');

    expect(gateway.savedDays).toEqual([{ ...monday, weekday: 2 }]);
    expect(view.queryByTestId('working-day-sheet')).toBeNull();
    expect(summary(view, 2)).toBe('09:00 – 12:00 · 14:00 – 19:00');
    expect(view.getByTestId('working-hours-saved')).toBeTruthy();
    expect(successHaptic).toHaveBeenCalledTimes(1);
  });

  it('adds a break by adding a second interval, set on the wheels', async () => {
    const gateway = createFakeOnlineBookingGateway(testBusiness.name);
    gateway.seedWorkingHours(testBusiness.id, [{ weekday: 3, isOpen: true, intervals: [{ startMinute: 540, endMinute: 1080 }] }]);
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-3');
    expect(view.queryByTestId('working-interval-0-remove')).toBeNull(); // the last interval goes with the switch
    await press(view, 'working-day-add-interval');
    expect(view.getByTestId('working-interval-1-start-value').props.children).toBe('19:00');
    await setTime(view, 0, 'end', '12', '00');
    await setTime(view, 1, 'start', '13', '30');
    await setTime(view, 1, 'end', '18', '00');
    await press(view, 'working-day-save');

    expect(gateway.savedDays).toEqual([
      {
        weekday: 3,
        isOpen: true,
        intervals: [
          { startMinute: 540, endMinute: 720 },
          { startMinute: 810, endMinute: 1080 },
        ],
      },
    ]);
    expect(summary(view, 3)).toBe('09:00 – 12:00 · 13:30 – 18:00');
  });

  it('explains an overlap under the later interval and never sends it', async () => {
    const gateway = seededGateway();
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-1');
    await setTime(view, 1, 'start', '11', '00');

    expect(view.getByTestId('working-interval-1-error').props.children).toBe('Cette plage chevauche une autre plage.');
    expect(view.queryByTestId('working-interval-0-error')).toBeNull();
    expect(isDisabled(view, 'working-day-save')).toBe(true);
    await press(view, 'working-day-save');
    expect(gateway.calls.saveDay).toBe(0);
  });

  it('explains an end before its start; the start never moves by itself', async () => {
    const gateway = seededGateway();
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-1');
    await setTime(view, 0, 'end', '08', '00');

    expect(view.getByTestId('working-interval-0-error').props.children).toBe('La fin doit être après le début.');
    expect(view.getByTestId('working-interval-0-start-value').props.children).toBe('09:00');
    expect(isDisabled(view, 'working-day-save')).toBe(true);
  });

  it('removes an interval, and closes a day with the switch', async () => {
    const gateway = seededGateway();
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-1');
    await press(view, 'working-interval-0-remove');
    expect(view.getByTestId('working-interval-0-start-value').props.children).toBe('14:00');
    await toggle(view, 'working-day-open', false);
    expect(view.queryByTestId('working-interval-0')).toBeNull();
    await press(view, 'working-day-save');

    expect(gateway.savedDays).toEqual([{ weekday: 1, isOpen: false, intervals: [] }]);
    expect(summary(view, 1)).toBe('Fermé');
  });

  it('« Annuler » discards the edits; the next opening starts from the stored day', async () => {
    const gateway = seededGateway();
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-1');
    await toggle(view, 'working-day-open', false);
    await press(view, 'working-day-cancel');
    expect(view.queryByTestId('working-day-sheet')).toBeNull();
    expect(gateway.calls.saveDay).toBe(0);
    expect(summary(view, 1)).toBe('09:00 – 12:00 · 14:00 – 19:00');

    await press(view, 'working-hours-day-1');
    expect(view.getByTestId('working-day-open-switch').props.value).toBe(true);
  });
});

describe('Horaires — the note on suggested hours', () => {
  const note = (view: View) => view.queryByTestId('working-day-suggestion');
  const source = (view: View) => view.getByTestId('working-day-suggestion-source').props.children as string;

  it('names the day the hours were copied from, as information', async () => {
    const view = await renderHours(seededGateway());

    await press(view, 'working-hours-day-2');
    expect(note(view)).toBeNull(); // nothing is suggested before the day is switched on
    await toggle(view, 'working-day-open', true);

    expect(source(view)).toBe('Horaires proposés à partir du lundi');
    expect(view.getByText('Vous pouvez les modifier avant de les enregistrer.')).toBeTruthy();
    expect(note(view)?.props.accessibilityLabel).toBe(
      'Horaires proposés à partir du lundi. Vous pouvez les modifier avant de les enregistrer.',
    );
    expect(warningHaptic).not.toHaveBeenCalled();
  });

  it('names the actual source: the closest earlier open day, the week wrapping around', async () => {
    const gateway = createFakeOnlineBookingGateway(testBusiness.name);
    gateway.seedWorkingHours(testBusiness.id, [
      { weekday: 3, isOpen: true, intervals: [{ startMinute: 600, endMinute: 1020 }] },
      { weekday: 6, isOpen: true, intervals: [{ startMinute: 540, endMinute: 960 }] },
    ]);
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-5');
    await toggle(view, 'working-day-open', true);
    expect(source(view)).toBe('Horaires proposés à partir du mercredi');
    expect(view.getByTestId('working-interval-0-start-value').props.children).toBe('10:00');
    await press(view, 'working-day-cancel');

    await press(view, 'working-hours-day-1');
    await toggle(view, 'working-day-open', true);
    expect(source(view)).toBe('Horaires proposés à partir du samedi');
    expect(view.getByTestId('working-interval-0-end-value').props.children).toBe('16:00');
  });

  it('never names a day for the default 09:00 – 18:00', async () => {
    const view = await renderHours(createFakeOnlineBookingGateway(testBusiness.name));

    await press(view, 'working-hours-day-4');
    await toggle(view, 'working-day-open', true);

    expect(view.getByTestId('working-interval-0-start-value').props.children).toBe('09:00');
    expect(view.getByTestId('working-interval-0-end-value').props.children).toBe('18:00');
    expect(note(view)).toBeNull();
  });

  it('never appears on a day with its own saved hours, even closed then reopened', async () => {
    const gateway = seededGateway();
    gateway.seedWorkingHours(testBusiness.id, [{ weekday: 2, isOpen: true, intervals: [{ startMinute: 480, endMinute: 720 }] }]);
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-2');
    expect(note(view)).toBeNull();
    await toggle(view, 'working-day-open', false);
    await toggle(view, 'working-day-open', true);

    expect(view.getByTestId('working-interval-0-start-value').props.children).toBe('08:00');
    expect(note(view)).toBeNull();
  });

  it('follows the switch: hidden while closed, back with the same source when reopened', async () => {
    const view = await renderHours(seededGateway());

    await press(view, 'working-hours-day-2');
    await toggle(view, 'working-day-open', true);
    expect(note(view)).toBeTruthy();
    await toggle(view, 'working-day-open', false);
    expect(note(view)).toBeNull();
    await toggle(view, 'working-day-open', true);
    expect(source(view)).toBe('Horaires proposés à partir du lundi');
  });

  it('stays while the copied hours are adjusted, and changes nothing that is saved', async () => {
    const gateway = seededGateway();
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-2');
    await toggle(view, 'working-day-open', true);
    await setTime(view, 1, 'end', '18', '00');
    expect(source(view)).toBe('Horaires proposés à partir du lundi');
    await press(view, 'working-day-save');

    expect(gateway.savedDays).toEqual([
      {
        weekday: 2,
        isOpen: true,
        intervals: [
          { startMinute: 540, endMinute: 720 },
          { startMinute: 840, endMinute: 1080 },
        ],
      },
    ]);
    // A new opening of the now saved day: its own hours, no note.
    await press(view, 'working-hours-day-2');
    expect(note(view)).toBeNull();
  });
});

describe('Horaires — save failures', () => {
  it('offline: the day stays open with its edits and the reason; nothing changes', async () => {
    const gateway = seededGateway();
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-1');
    await toggle(view, 'working-day-open', false);
    gateway.failNext('NETWORK');
    await press(view, 'working-day-save');

    expect(view.getByTestId('working-day-failure').props.children).toBe(
      'Vos horaires n’ont pas été enregistrés. Vérifiez votre connexion et réessayez.',
    );
    expect(view.getByTestId('working-day-open-switch').props.value).toBe(false);
    expect(summary(view, 1)).toBe('09:00 – 12:00 · 14:00 – 19:00');
    expect(gateway.savedDays).toEqual([]);
    expect(warningHaptic).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('working-hours-saved')).toBeNull();

    // Nothing is retried behind her back: the next attempt is her own tap.
    expect(gateway.calls.saveDay).toBe(1);
    await press(view, 'working-day-save');
    expect(gateway.savedDays).toEqual([{ weekday: 1, isOpen: false, intervals: [] }]);
    expect(summary(view, 1)).toBe('Fermé');
  });

  it('a server refusal is explained and writes nothing', async () => {
    const gateway = seededGateway();
    jest.spyOn(gateway, 'saveWorkingDay').mockResolvedValueOnce({ status: 'INVALID_DAY', reason: 'OVERLAP' });
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-2');
    await toggle(view, 'working-day-open', true);
    await press(view, 'working-day-save');

    expect(view.getByTestId('working-day-failure').props.children).toBe(
      'Ces horaires n’ont pas pu être enregistrés. Vérifiez les plages et réessayez.',
    );
    expect(view.getByTestId('working-day-sheet')).toBeTruthy();
    expect(summary(view, 2)).toBe('Fermé');
  });

  it('any edit clears the failure', async () => {
    const gateway = seededGateway();
    const view = await renderHours(gateway);

    await press(view, 'working-hours-day-1');
    await toggle(view, 'working-day-open', false);
    gateway.failNext('NETWORK');
    await press(view, 'working-day-save');
    expect(view.getByTestId('working-day-failure')).toBeTruthy();

    await toggle(view, 'working-day-open', true);
    expect(view.queryByTestId('working-day-failure')).toBeNull();
  });
});
