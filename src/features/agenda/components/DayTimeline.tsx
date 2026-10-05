import { useEffect, useState, type ComponentProps } from 'react';
import { useRouter } from 'expo-router';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';

import type { CalendarBlock } from '@/domain/calendar-blocks';
import { getClientInitials } from '@/domain/clients';
import { AppText } from '@/shared/ui/AppText';
import { TabBarGlassScrollEdge } from '@/shared/ui/TabBarGlassScrollEdge';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { useClientPhotoUri } from '@/features/clients/photo/use-client-photo-uri';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import { agenda, bottomClearance, gutter, rose, semanticColors } from '@/shared/ui/theme';

import { resolveAgendaAppointmentPalettes } from '../appointment-palette';
import { buildAgendaStaffSegments } from '../layout/agenda-staff-segments';
import { calculateDayIntervalLayout } from '../layout/day-layout';
import {
  calculateDayTimelineRange,
  formatTimelineClockLabel,
  minutesFromDayMidnight,
} from '../layout/day-range';
import { startAtFromTimelinePosition } from '../interaction/timeline-position';
import { AppointmentBlock } from './AppointmentBlock';
import { CalendarBlockCard } from './CalendarBlockCard';

interface DayTimelineProps {
  readonly day: Date;
  readonly appointments: readonly AppointmentSessionEntry[];
  /** Personal unavailability of the selected day. */
  readonly calendarBlocks?: readonly CalendarBlock[];
}

/** Layout id of a Calendar Block: never collides with an Appointment segment id. */
const blockLayoutId = (calendarBlock: CalendarBlock) => `calendar-block:${calendarBlock.id}`;

const minuteHeight = agenda.hourHeight / 60;

/**
 * One Appointment card with its client's photo: the stable `photoPath` of the
 * Client already resolved for this day becomes a displayable file through the
 * shared media cache — the Clientèle list's own path, nothing new is read.
 */
function AppointmentSegmentCard({
  clientPhotoPath,
  ...card
}: Omit<ComponentProps<typeof AppointmentBlock>, 'clientPhotoUri'> & {
  readonly clientPhotoPath?: string;
}) {
  return <AppointmentBlock {...card} clientPhotoUri={useClientPhotoUri(clientPhotoPath)} />;
}

export function DayTimeline({ day, appointments, calendarBlocks = [] }: DayTimelineProps) {
  const router = useRouter();
  const { getClientById } = useClientSession();
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(() => new Date());
  // Colour identifies the client: resolved once for the clients of this day.
  const paletteOf = resolveAgendaAppointmentPalettes(
    appointments.map(({ appointment }) => appointment),
  );
  const visibleSegments = appointments.flatMap(({ appointment }) =>
    buildAgendaStaffSegments(appointment).map((segment) => {
      const client = getClientById(appointment.clientId);
      return {
        ...segment,
        clientInitials: client ? getClientInitials(client) : undefined,
        clientPhotoPath: client?.photoPath,
        clientName: getResolvedClientDisplayName(client),
        palette: paletteOf(appointment),
      };
    }),
  );
  // ONE geometry for everything the day holds: Calendar Blocks go through the
  // same interval layout, the same range and the same minute scale as the
  // Appointment segments — exact start, exact duration, shared overlap columns.
  const blockIntervals = calendarBlocks.map((calendarBlock) => ({
    id: blockLayoutId(calendarBlock),
    startAt: calendarBlock.startAt,
    endAt: calendarBlock.endAt,
  }));
  const intervalLayouts = calculateDayIntervalLayout([...visibleSegments, ...blockIntervals]);
  const layoutById = new Map(intervalLayouts.map((layout) => [layout.id, layout]));
  const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
  // The canvas covers the normal operational day and grows only as far as
  // the latest visible block of the selected day requires (past 20:00, or
  // past midnight for a very late Appointment). Only the height changes:
  // the initial scroll position stays at the top of the day.
  const range = calculateDayTimelineRange(day, [...visibleSegments, ...blockIntervals], {
    defaultEndHour: agenda.dayEndHour,
    defaultStartHour: agenda.dayStartHour,
  });
  // One marker per full hour. Blocks keep minute precision (minuteHeight).
  const hourCount = (range.endMinutes - range.startMinutes) / 60;
  const timelineHeight = (range.endMinutes - range.startMinutes) * minuteHeight;
  const topOf = (date: Date) => (minutesFromDayMidnight(day, date) - range.startMinutes) * minuteHeight;
  const nowMinutes = minutesFromDayMidnight(day, now);
  const showNow =
    isSameDay(day, now) && nowMinutes >= range.startMinutes && nowMinutes < range.endMinutes;
  const nowTop = topOf(now);
  const eventLeft = agenda.timelineGutter;
  const eventWidth = Math.max(160, width - eventLeft - horizontalGutter);
  /** Frame of one laid-out interval on the canvas. */
  const frameOf = (interval: { readonly id: string; readonly startAt: Date; readonly endAt: Date }) => {
    const layout = layoutById.get(interval.id);
    if (!layout) return undefined;
    const height = Math.max(
      1,
      ((interval.endAt.getTime() - interval.startAt.getTime()) / 60_000) * minuteHeight,
    );
    const columnWidth = eventWidth / layout.columnCount;
    return {
      height,
      left: eventLeft + layout.column * columnWidth + 3,
      position: 'absolute' as const,
      top: topOf(interval.startAt),
      width: columnWidth - 6,
    };
  };

  const openCreationAtPosition = (event: GestureResponderEvent) => {
    const startAt = startAtFromTimelinePosition(day, event.nativeEvent.locationY, {
      dayEndHour: range.endMinutes / 60,
      dayStartHour: agenda.dayStartHour,
      hourHeight: agenda.hourHeight,
    });
    router.push({
      pathname: '/appointments/new',
      params: { startAt: startAt.toISOString() },
    });
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <TabBarGlassScrollEdge>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        // The native tab bar overlays the page: the system bottom inset keeps
        // the last hour scrollable above it (bottomClearance then clears
        // the floating +).
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.canvas, { height: timelineHeight, width }]} testID="agenda-day-canvas">
          {Array.from({ length: hourCount + 1 }, (_, index) => {
            const minutes = range.startMinutes + index * 60;
            return (
              <View
                key={minutes}
                pointerEvents="none"
                style={[styles.timeRow, { top: index * agenda.hourHeight }]}
              >
                <AppText variant="agendaHour" style={styles.timeLabel}>
                  {formatTimelineClockLabel(minutes)}
                </AppText>
                <View style={[styles.gridLine, { right: horizontalGutter }]} />
              </View>
            );
          })}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Créer un rendez-vous"
            accessibilityHint="Choisit l'heure du rendez-vous dans la grille"
            onPress={openCreationAtPosition}
            style={[styles.emptySlotSurface, { height: timelineHeight, left: eventLeft, width: eventWidth }]}
          />

          {visibleSegments.map((segment) => {
            const frame = frameOf(segment);
            if (!frame) return null;
            return (
              <View key={segment.id} testID={`agenda-segment-${segment.id}`} style={frame}>
                <AppointmentSegmentCard
                  clientInitials={segment.clientInitials}
                  clientName={segment.clientName}
                  clientPhotoPath={segment.clientPhotoPath}
                  height={frame.height}
                  onPress={() =>
                    router.push({
                      pathname: '/appointments/[appointmentId]',
                      params: { appointmentId: segment.appointmentId },
                    })
                  }
                  palette={segment.palette}
                  segment={segment}
                  width={frame.width}
                />
              </View>
            );
          })}

          {calendarBlocks.map((calendarBlock) => {
            const frame = frameOf({ ...calendarBlock, id: blockLayoutId(calendarBlock) });
            if (!frame) return null;
            return (
              <View
                key={calendarBlock.id}
                testID={`agenda-calendar-block-${calendarBlock.id}`}
                style={frame}
              >
                <CalendarBlockCard
                  calendarBlock={calendarBlock}
                  height={frame.height}
                  onPress={() =>
                    router.push({
                      pathname: '/calendar-blocks/[calendarBlockId]',
                      params: { calendarBlockId: calendarBlock.id },
                    })
                  }
                />
              </View>
            );
          })}

          {showNow && (
            <View
              pointerEvents="none"
              style={[styles.nowLine, { right: horizontalGutter, top: nowTop }]}
            >
              <View style={styles.nowDot} />
              <View style={styles.nowRule} />
            </View>
          )}
        </View>
      </ScrollView>
    </TabBarGlassScrollEdge>
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    // The canvas keeps y = 0 at the start of the day; the inset moves the WHOLE
    // canvas (labels, grid, blocks, tap surface, now line), never one layer.
    paddingTop: agenda.timelineTopInset,
    paddingBottom: bottomClearance[Platform.OS === 'android' ? 'android' : 'ios'],
  },
  canvas: { position: 'relative' },
  emptySlotSurface: { position: 'absolute', top: 0 },
  timeRow: { height: agenda.hourHeight, left: 0, position: 'absolute', right: 0 },
  timeLabel: { left: 14, position: 'absolute', top: -8, width: 48 },
  gridLine: {
    backgroundColor: semanticColors.borderSubtle,
    height: 1,
    left: agenda.timelineGutter,
    position: 'absolute',
    top: 0,
  },
  nowLine: { height: 1.5, left: agenda.timelineGutter - 4, position: 'absolute' },
  nowDot: {
    backgroundColor: rose.rose600,
    borderRadius: 5,
    height: 10,
    left: 0,
    position: 'absolute',
    top: -4,
    width: 10,
  },
  nowRule: { backgroundColor: rose.rose600, height: 1.5, left: 8, position: 'absolute', right: 0 },
});
