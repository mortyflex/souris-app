// Souris — Calendar Blocks on the Agenda: Day geometry, card content, the
// dedicated theme, the tap target and the Week rows. Appointment cards are
// asserted unchanged next to them.

import { act, fireEvent, render } from '@testing-library/react-native';

import type { CalendarBlock } from '@/domain/calendar-blocks';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { agenda, appointmentPastels, calendarBlockColors } from '@/shared/ui/theme';

import { resolveAgendaAppointmentPalettes } from '../appointment-palette';
import { getCalendarBlockCardContent } from '../calendar-block-content';
import { getCalendarBlocksOfLocalDay, mergeWeekDayRows } from '../calendar/week-appointments';
import { DayTimeline } from '../components/DayTimeline';
import { WeekDaySection } from '../components/WeekDaySection';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return { SymbolView: () => React.createElement(React.Fragment, null) };
});

const day = new Date(2026, 8, 21);
const minuteHeight = agenda.hourHeight / 60;
const at = (hour: number, minute = 0) => new Date(2026, 8, 21, hour, minute);

function block(id: string, startAt: Date, endAt: Date, reason = 'Déplacement'): CalendarBlock {
  return { id, businessId: 'fixture-business', staffMemberId: 'staff-amelie', startAt, endAt, reason };
}

function entry(id: string, hour: number, durationMinutes: number): AppointmentSessionEntry {
  return {
    appointment: {
      id,
      businessId: 'fixture-business',
      clientId: 'client-agenda-sofia',
      staffMemberId: 'staff-amelie',
      startAt: at(hour),
      status: 'SCHEDULED',
      items: [
        {
          id: `${id}-item`,
          serviceId: 'service-treatment',
          order: 0,
          serviceName: 'Soin profond',
          serviceType: 'SERVICE',
          price: 60,
          phases: [{ id: `${id}-phase`, name: 'Soin profond', durationMinutes, requiresStaff: true }],
        },
      ],
    },
  };
}

function renderDay(
  calendarBlocks: readonly CalendarBlock[],
  appointments: readonly AppointmentSessionEntry[] = [],
) {
  return render(
    <TestPersistenceProvider>
      <ClientSessionProvider>
        <DayTimeline appointments={appointments} calendarBlocks={calendarBlocks} day={day} />
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

function flatStyle(style: unknown): Record<string, number | string> {
  return Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]));
}

type Rendered = Awaited<ReturnType<typeof render>>;
const frame = (view: Rendered, testID: string) => flatStyle(view.getByTestId(testID).props.style);

describe('Calendar Block on the Day timeline', () => {
  beforeEach(() => mockPush.mockClear());

  it('occupies exactly its interval: 10:10 → 11:25 at minute precision', async () => {
    const view = await renderDay([block('b1', at(10, 10), at(11, 25))]);
    const geometry = frame(view, 'agenda-calendar-block-b1');

    expect(geometry.top).toBeCloseTo((2 * 60 + 10) * minuteHeight);
    expect(geometry.height).toBeCloseTo(75 * minuteHeight);
  });

  it('uses the SAME geometry as an Appointment: same scale, same column frame', async () => {
    // One render (a second render in a test poisons the file): an hour-long
    // block and an hour-long Appointment, two hours apart, in the same day.
    const view = await renderDay([block('b1', at(14), at(15))], [entry('a1', 16, 60)]);
    const blockFrame = frame(view, 'agenda-calendar-block-b1');
    const segmentFrame = frame(view, 'agenda-segment-a1:a1-phase');

    expect(blockFrame.height).toBe(segmentFrame.height);
    expect(blockFrame.left).toBe(segmentFrame.left);
    expect(blockFrame.width).toBe(segmentFrame.width);
    expect(blockFrame.position).toBe(segmentFrame.position);
    expect((segmentFrame.top as number) - (blockFrame.top as number)).toBeCloseTo(120 * minuteHeight);
  });

  it('shares the overlap columns with Appointments instead of covering them', async () => {
    const view = await renderDay([block('b1', at(10), at(11))], [entry('a1', 10, 60)]);
    const blockFrame = frame(view, 'agenda-calendar-block-b1');
    const segmentFrame = frame(view, 'agenda-segment-a1:a1-phase');

    expect(blockFrame.width).toBe(segmentFrame.width);
    expect(blockFrame.left).not.toBe(segmentFrame.left);
    expect(blockFrame.top).toBe(segmentFrame.top);
  });

  it('extends the visible day for a late block, like a late Appointment', async () => {
    const view = await renderDay([block('late', at(20, 30), at(21, 30))]);

    expect(flatStyle(view.getByTestId('agenda-day-canvas').props.style).height).toBe(14 * agenda.hourHeight);
  });

  it('a normal block shows « Indisponible » and the reason — no client, no price', async () => {
    const view = await renderDay([block('b1', at(10), at(11))]);

    expect(view.getByText('Indisponible')).toBeTruthy();
    expect(view.getByText('Déplacement')).toBeTruthy();
    expect(view.queryByText(/€/)).toBeNull();
  });

  it('is announced without relying on colour', async () => {
    const view = await renderDay([block('b1', at(10), at(11, 30))]);

    expect(
      view.getByRole('button', { name: 'Indisponible, Déplacement, de 10 heures à 11 heures 30' }),
    ).toBeTruthy();
  });

  it('tapping it opens the dedicated details route, never Appointment Details', async () => {
    const view = await renderDay([block('b1', at(10), at(11))]);

    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: /^Indisponible/ }));
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/calendar-blocks/[calendarBlockId]',
      params: { calendarBlockId: 'b1' },
    });
  });

  it('leaves Appointment cards exactly as they were', async () => {
    // A block elsewhere in the day changes nothing about the Appointment card:
    // full-width column, exact interval, its own client palette and label.
    const view = await renderDay([block('b1', at(15), at(16))], [entry('a1', 9, 60)]);
    const segmentFrame = frame(view, 'agenda-segment-a1:a1-phase');
    const card = view.getByRole('button', { name: /Soin profond/ });
    const clientPalette = resolveAgendaAppointmentPalettes([entry('a1', 9, 60).appointment])(
      entry('a1', 9, 60).appointment,
    );

    expect(segmentFrame.top).toBeCloseTo(60 * minuteHeight);
    expect(segmentFrame.height).toBeCloseTo(60 * minuteHeight);
    expect(segmentFrame.left).toBe(agenda.timelineGutter + 3);
    expect(card.props.accessibilityLabel).not.toMatch(/Indisponible/);
    expect(flatStyle(card.props.style).backgroundColor).toBe(clientPalette.background);
    expect(flatStyle(card.props.style).borderLeftColor).toBe(clientPalette.accent);
    expect(view.getByText('Soin profond')).toBeTruthy();
  });
});

describe('Calendar Block card content', () => {
  it.each([
    [60, 'lines'],
    [30, 'lines'],
  ] as const)('a %i-minute block has room for two lines', (minutes, mode) => {
    expect(getCalendarBlockCardContent({ reason: 'Pause' }, minutes * minuteHeight)).toEqual({
      mode,
      title: 'Indisponible',
      reason: 'Pause',
    });
  });

  it.each([15, 20, 25])('a %i-minute block uses ONE readable line: « Indisponible · Pause »', (minutes) => {
    expect(getCalendarBlockCardContent({ reason: 'Pause' }, minutes * minuteHeight)).toEqual({
      mode: 'compact',
      title: 'Indisponible',
      reason: 'Pause',
    });
  });

  it('renders the compact line as one text, title first', async () => {
    const view = await render(
      <TestPersistenceProvider>
        <ClientSessionProvider>
          <DayTimeline appointments={[]} calendarBlocks={[block('short', at(10), at(10, 15), 'Pause')]} day={day} />
        </ClientSessionProvider>
      </TestPersistenceProvider>,
    );

    expect(view.getByText(/^Indisponible · Pause$/)).toBeTruthy();
  });

  it('a block too short for readable text draws no squeezed text but keeps its spoken label', async () => {
    expect(getCalendarBlockCardContent({ reason: 'Pause' }, 5 * minuteHeight)).toEqual({ mode: 'visual' });

    const view = await renderDay([block('tiny', at(10), at(10, 5), 'Pause')]);
    expect(view.queryByText(/Indisponible/)).toBeNull();
    expect(view.getByRole('button', { name: /^Indisponible, Pause/ })).toBeTruthy();
  });
});

describe('Calendar Block theme', () => {
  it('is ONE fixed family that no client palette can produce', () => {
    const clientColours = new Set<string>(
      Object.values(appointmentPastels).flatMap((family) => Object.values(family)),
    );

    for (const colour of [calendarBlockColors.background, calendarBlockColors.accent, calendarBlockColors.title, calendarBlockColors.subtitle]) {
      expect(clientColours.has(colour)).toBe(false);
    }
  });

  it('never takes part in client colour resolution', () => {
    const appointments = [entry('a1', 9, 60).appointment, entry('a2', 10, 60).appointment];
    const paletteOf = resolveAgendaAppointmentPalettes(appointments);

    for (const appointment of appointments) {
      expect(paletteOf(appointment).background).not.toBe(calendarBlockColors.background);
      expect(paletteOf(appointment).accent).not.toBe(calendarBlockColors.accent);
    }
  });

  it('paints every block the same, whatever its reason', async () => {
    const view = await renderDay([
      block('b1', at(9), at(10), 'Pause'),
      block('b2', at(11), at(12), 'Formation'),
    ]);
    const cards = view.getAllByRole('button', { name: /^Indisponible/ }).map((card) => flatStyle(card.props.style));

    expect(cards).toHaveLength(2);
    expect(cards[0]?.backgroundColor).toBe(calendarBlockColors.background);
    expect(cards[0]?.borderLeftColor).toBe(calendarBlockColors.accent);
    expect(cards[1]?.backgroundColor).toBe(cards[0]?.backgroundColor);
    expect(cards[1]?.borderLeftColor).toBe(cards[0]?.borderLeftColor);
  });
});

describe('Calendar Blocks in the Week view', () => {
  beforeEach(() => mockPush.mockClear());

  it('follows the selected date: only the blocks starting that local day', () => {
    const today = block('today', at(10), at(11));
    const tomorrow = block('tomorrow', new Date(2026, 8, 22, 9), new Date(2026, 8, 22, 10));

    expect(getCalendarBlocksOfLocalDay([tomorrow, today], day)).toEqual([today]);
    expect(getCalendarBlocksOfLocalDay([tomorrow, today], new Date(2026, 8, 22))).toEqual([tomorrow]);
    expect(getCalendarBlocksOfLocalDay([today], new Date(2026, 8, 23))).toEqual([]);
  });

  it('merges blocks and Appointments chronologically, the block first on a tie', () => {
    const rows = mergeWeekDayRows(
      [entry('a-noon', 12, 30), entry('a-ten', 10, 30)].sort(
        (a, b) => a.appointment.startAt.getTime() - b.appointment.startAt.getTime(),
      ),
      [block('b-ten', at(10), at(10, 30)), block('b-nine', at(9), at(9, 30))],
    );

    expect(rows.map((row) => row.key)).toEqual([
      'calendar-block:b-nine',
      'calendar-block:b-ten',
      'appointment:a-ten',
      'appointment:a-noon',
    ]);
  });

  function renderSection(calendarBlocks: readonly CalendarBlock[], appointments: readonly AppointmentSessionEntry[]) {
    return render(
      <TestPersistenceProvider>
        <ClientSessionProvider>
          <WeekDaySection
            appointments={appointments}
            calendarBlocks={calendarBlocks}
            day={day}
            onSelectDay={jest.fn()}
            selectedDay={day}
            today={day}
          />
        </ClientSessionProvider>
      </TestPersistenceProvider>,
    );
  }

  it('identifies a block as « Indisponible » with its reason and end — and opens its own details', async () => {
    const view = await renderSection([block('b1', at(10), at(11, 30))], [entry('a1', 14, 60)]);

    expect(view.getByText('Indisponible')).toBeTruthy();
    expect(view.getByText("Déplacement · jusqu'à 11:30")).toBeTruthy();
    // The Appointment row next to it is untouched, and blocks are not « rendez-vous ».
    expect(view.getByText('1 rendez-vous')).toBeTruthy();
    expect(view.getByRole('button', { name: /Lun 21, 1 rendez-vous, 1 créneau indisponible/ })).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('week-calendar-block-b1'));
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/calendar-blocks/[calendarBlockId]',
      params: { calendarBlockId: 'b1' },
    });
  });

  it('a day holding only a block shows the block, not « Aucun rendez-vous » as its content', async () => {
    const view = await renderSection([block('b1', at(10), at(11))], []);

    expect(view.getByText('Indisponible')).toBeTruthy();
    expect(view.queryByText('Aucun rendez-vous')).toBeNull();
  });
});
