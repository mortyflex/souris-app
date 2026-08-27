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
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { agenda, bottomClearance, gutter, rose, semanticColors } from '@/shared/ui/theme';

import { getAgendaAppointmentPalette } from '../appointment-palette';
import { buildAgendaStaffSegments } from '../layout/agenda-staff-segments';
import { calculateDayIntervalLayout, minutesFromDayStart } from '../layout/day-layout';
import { startAtFromTimelinePosition } from '../interaction/timeline-position';
import { AppointmentBlock } from './AppointmentBlock';

interface DayTimelineProps {
  readonly day: Date;
  readonly appointments: readonly AppointmentSessionEntry[];
}

const quarterHeight = agenda.hourHeight / 4;
const quarterCount = (agenda.dayEndHour - agenda.dayStartHour) * 4;
const timelineHeight = (agenda.dayEndHour - agenda.dayStartHour) * agenda.hourHeight;

export function DayTimeline({ day, appointments }: DayTimelineProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(() => new Date());
  const visibleSegments = appointments.flatMap(({ appointment, clientDisplayName }) =>
    buildAgendaStaffSegments(appointment).map((segment) => ({
      ...segment,
      clientName: clientDisplayName,
      palette: getAgendaAppointmentPalette(segment.appointmentId),
    })),
  );
  const intervalLayouts = calculateDayIntervalLayout(visibleSegments);
  const layoutById = new Map(intervalLayouts.map((layout) => [layout.id, layout]));
  const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
  const showNow =
    isSameDay(day, now) &&
    now.getHours() >= agenda.dayStartHour &&
    now.getHours() < agenda.dayEndHour;
  const nowTop = minutesFromDayStart(now, agenda.dayStartHour) * (agenda.hourHeight / 60);
  const eventLeft = agenda.timelineGutter;
  const eventWidth = Math.max(160, width - eventLeft - horizontalGutter);

  const openCreationAtPosition = (event: GestureResponderEvent) => {
    const startAt = startAtFromTimelinePosition(day, event.nativeEvent.locationY, {
      dayEndHour: agenda.dayEndHour,
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
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.canvas, { height: timelineHeight, width }]}>
        {Array.from({ length: quarterCount + 1 }, (_, index) => {
          const isFullHour = index % 4 === 0;
          const hour = agenda.dayStartHour + Math.floor(index / 4);
          const minute = (index % 4) * 15;
          return (
            <View
              key={`${hour}:${minute}`}
              pointerEvents="none"
              style={[styles.timeRow, { top: index * quarterHeight }]}
            >
              <AppText
                variant={isFullHour ? 'agendaHour' : 'agendaQuarter'}
                style={[styles.timeLabel, isFullHour ? styles.fullHourLabel : styles.quarterLabel]}
              >
                {`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
              </AppText>
              <View
                style={[
                  styles.gridLine,
                  isFullHour ? styles.fullHourLine : styles.quarterLine,
                  { right: horizontalGutter },
                ]}
              />
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
          const top =
            minutesFromDayStart(segment.startAt, agenda.dayStartHour) * (agenda.hourHeight / 60);
          const height = Math.max(
            1,
            (segment.endAt.getTime() - segment.startAt.getTime()) / 60_000 * (agenda.hourHeight / 60),
          );
          const columnWidth = eventWidth / layout.columnCount;
          return (
            <View
              key={segment.id}
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
  timeRow: { height: quarterHeight, left: 0, position: 'absolute', right: 0 },
  timeLabel: { left: 14, position: 'absolute', width: 48 },
  fullHourLabel: { top: -8 },
  quarterLabel: { top: -7 },
  gridLine: { left: agenda.timelineGutter, position: 'absolute', top: 0 },
  fullHourLine: { backgroundColor: semanticColors.borderSubtle, height: 1 },
  quarterLine: {
    backgroundColor: semanticColors.borderSubtle,
    height: StyleSheet.hairlineWidth,
    opacity: 0.38,
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
