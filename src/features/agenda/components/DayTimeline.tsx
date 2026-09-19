import { useEffect, useState } from 'react';
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

import { AppText } from '@/shared/ui/AppText';
import { TabBarGlassScrollEdge } from '@/shared/ui/TabBarGlassScrollEdge';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
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

interface DayTimelineProps {
  readonly day: Date;
  readonly appointments: readonly AppointmentSessionEntry[];
}

const minuteHeight = agenda.hourHeight / 60;

export function DayTimeline({ day, appointments }: DayTimelineProps) {
  const router = useRouter();
  const { getClientById } = useClientSession();
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(() => new Date());
  // Colour identifies the client: resolved once for the clients of this day.
  const paletteOf = resolveAgendaAppointmentPalettes(
    appointments.map(({ appointment }) => appointment),
  );
  const visibleSegments = appointments.flatMap(({ appointment }) =>
    buildAgendaStaffSegments(appointment).map((segment) => ({
      ...segment,
      clientName: getResolvedClientDisplayName(getClientById(appointment.clientId)),
      palette: paletteOf(appointment),
    })),
  );
  const intervalLayouts = calculateDayIntervalLayout(visibleSegments);
  const layoutById = new Map(intervalLayouts.map((layout) => [layout.id, layout]));
  const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
  // The canvas covers the normal operational day and grows only as far as
  // the latest visible block of the selected day requires (past 20:00, or
  // past midnight for a very late Appointment). Only the height changes:
  // the initial scroll position stays at the top of the day.
  const range = calculateDayTimelineRange(day, visibleSegments, {
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
            const layout = layoutById.get(segment.id);
            if (!layout) return null;
            const top = topOf(segment.startAt);
            const height = Math.max(
              1,
              ((segment.endAt.getTime() - segment.startAt.getTime()) / 60_000) * minuteHeight,
            );
            const columnWidth = eventWidth / layout.columnCount;
            return (
              <View
                key={segment.id}
                testID={`agenda-segment-${segment.id}`}
                style={{
                  height,
                  left: eventLeft + layout.column * columnWidth + 3,
                  position: 'absolute',
                  top,
                  width: columnWidth - 6,
                }}
              >
                <AppointmentBlock
                  clientName={segment.clientName}
                  height={height}
                  onPress={() =>
                    router.push({
                      pathname: '/appointments/[appointmentId]',
                      params: { appointmentId: segment.appointmentId },
                    })
                  }
                  palette={segment.palette}
                  segment={segment}
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
