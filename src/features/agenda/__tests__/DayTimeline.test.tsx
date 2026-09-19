import { render } from '@testing-library/react-native';

import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { agenda } from '@/shared/ui/theme';

import { DayTimeline } from '../components/DayTimeline';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const day = new Date(2026, 7, 24);
const minuteHeight = agenda.hourHeight / 60;

function entry(
  id: string,
  hour: number,
  durationMinutes: number,
  minute = 0,
): AppointmentSessionEntry {
  return {
    appointment: {
      id,
      businessId: 'fixture-business',
      clientId: 'client-agenda-sofia',
      staffMemberId: 'staff-amelie',
      startAt: new Date(2026, 7, 24, hour, minute),
      status: 'SCHEDULED',
      items: [
        {
          id: `${id}-item`,
          serviceId: 'service-treatment',
          order: 0,
          serviceName: 'Soin profond',
          serviceType: 'SERVICE',
          price: 60,
          phases: [
            { id: `${id}-phase`, name: 'Soin profond', durationMinutes, requiresStaff: true },
          ],
        },
      ],
    },
  };
}

function renderTimeline(appointments: readonly AppointmentSessionEntry[]) {
  return render(
    <TestPersistenceProvider>
      <ClientSessionProvider>
        <DayTimeline day={day} appointments={appointments} />
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

function flatStyle(style: unknown): Record<string, number> {
  return Object.assign({}, ...(Array.isArray(style) ? style.flat() : [style]));
}

function canvasHeight(view: Awaited<ReturnType<typeof render>>): number {
  return flatStyle(view.getByTestId('agenda-day-canvas').props.style).height;
}

function segmentGeometry(view: Awaited<ReturnType<typeof render>>, id: string) {
  const style = flatStyle(view.getByTestId(`agenda-segment-${id}`).props.style);
  return { top: style.top, height: style.height };
}

describe('DayTimeline visible range', () => {
  it('keeps the compact 08:00 → 20:00 canvas for a normal day', async () => {
    const view = await renderTimeline([entry('morning', 9, 60)]);

    expect(canvasHeight(view)).toBe(12 * agenda.hourHeight);
    expect(view.getByText('20:00')).toBeTruthy();
    expect(view.queryByText('21:00')).toBeNull();
  });

  it('extends the canvas so a 19:00 appointment lasting three hours is fully visible', async () => {
    const view = await renderTimeline([entry('late', 19, 180)]);

    const geometry = segmentGeometry(view, 'late:late-phase');
    expect(geometry.top).toBe(11 * agenda.hourHeight);
    expect(geometry.height).toBe(180 * minuteHeight);
    // 22:00 end + padding → the canvas reaches 23:00; nothing is clipped at 20:00.
    expect(canvasHeight(view)).toBe(15 * agenda.hourHeight);
    expect(canvasHeight(view)).toBeGreaterThanOrEqual(geometry.top + geometry.height + 30 * minuteHeight);
    expect(view.getByText('22:00')).toBeTruthy();
    expect(view.getByText('23:00')).toBeTruthy();
  });

  it('gives an appointment starting at 20:00 its whole block and scroll height', async () => {
    const view = await renderTimeline([entry('evening', 20, 180)]);

    const geometry = segmentGeometry(view, 'evening:evening-phase');
    expect(geometry.top).toBe(12 * agenda.hourHeight);
    expect(geometry.height).toBe(3 * agenda.hourHeight);
    expect(canvasHeight(view)).toBe(16 * agenda.hourHeight);
    expect(view.getByText('00:00')).toBeTruthy();
  });

  it('extends past midnight for a 22:00 appointment lasting three hours, as one block with clock labels', async () => {
    const view = await renderTimeline([entry('night', 22, 180)]);

    const geometry = segmentGeometry(view, 'night:night-phase');
    expect(geometry.top).toBe(14 * agenda.hourHeight);
    expect(geometry.height).toBe(3 * agenda.hourHeight);
    // 1500 minutes from the start-day midnight, plus padding → 02:00.
    expect(canvasHeight(view)).toBe(18 * agenda.hourHeight);
    expect(view.getAllByTestId(/^agenda-segment-/)).toHaveLength(1);
    expect(view.getByText('00:00')).toBeTruthy();
    expect(view.getByText('01:00')).toBeTruthy();
    expect(view.queryByText('24:00')).toBeNull();
    expect(view.queryByText('25:00')).toBeNull();
  });
});

describe('DayTimeline hourly grid', () => {
  it('labels full hours only', async () => {
    const view = await renderTimeline([entry('morning', 9, 60)]);

    for (let hour = 8; hour <= 20; hour += 1) {
      expect(view.getByText(`${hour.toString().padStart(2, '0')}:00`)).toBeTruthy();
    }
    expect(view.queryByText(/^\d{2}:(15|30|45)$/)).toBeNull();
  });

  it('keeps a 45-minute appointment 45 minutes tall', async () => {
    const view = await renderTimeline([entry('short', 9, 45)]);

    const geometry = segmentGeometry(view, 'short:short-phase');
    expect(geometry.top).toBe(agenda.hourHeight);
    expect(geometry.height).toBe(45 * minuteHeight);
    expect(geometry.height).toBeLessThan(agenda.hourHeight);
  });

  it('renders an older 09:30 → 10:15 appointment at its real position', async () => {
    const view = await renderTimeline([entry('legacy', 9, 45, 30)]);

    const geometry = segmentGeometry(view, 'legacy:legacy-phase');
    expect(geometry.top).toBe(90 * minuteHeight);
    expect(geometry.top).toBeGreaterThan(agenda.hourHeight);
    expect(geometry.top).toBeLessThan(2 * agenda.hourHeight);
    expect(geometry.height).toBe(45 * minuteHeight);
  });
});
