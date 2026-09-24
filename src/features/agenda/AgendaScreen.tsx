import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { daySummaryIcon } from "@/shared/icons/day-summary-icon";
import { insightsIcon } from "@/shared/icons/insights-icon";
import { DateNavigator } from "@/shared/ui/DateNavigator";
import { FloatingCreateButton } from "@/shared/ui/FloatingCreateButton";
import { MonthCalendarSheet } from "@/shared/ui/MonthCalendarSheet";
import { MainScreenHeader } from "@/shared/ui/MainScreenHeader";
import { agenda, gutter, semanticColors, spacing } from "@/shared/ui/theme";

import { useAppointmentSession } from "@/features/appointments/session/AppointmentSessionProvider";
import { useCalendarBlockSession } from "@/features/calendar-blocks/session/CalendarBlockSessionProvider";
import { BusinessInsightsTicket } from "@/features/insights/BusinessInsightsTicket";
import {
  addLocalDays,
  followTodayChange,
  isSameLocalDay,
  shiftWeek,
  startOfLocalDay,
} from "./calendar/week";
import {
  AgendaViewSwitcher,
  type AgendaViewMode,
} from "./components/AgendaViewSwitcher";
import { DayTimeline } from "./components/DayTimeline";
import { DaySummaryTicket } from "./day-summary/DaySummaryTicket";
import { WeekSummaryTicket } from "./day-summary/WeekSummaryTicket";
import { WeekView } from "./components/WeekView";
import { getCalendarBlocksOfLocalDay } from "./calendar/week-appointments";
import {
  getAppointmentDayDecoration,
  getAppointmentDayKeys,
} from "./calendar/month";
import { getOperationalAgendaEntries } from "./operational-visibility";

export function AgendaScreen() {
  const router = useRouter();
  // Today is always derived from the device clock; it is refreshed on focus,
  // on return from background, and on a rollover check, never frozen at mount.
  const [today, setToday] = useState<Date>(() => startOfLocalDay(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const [mode, setMode] = useState<AgendaViewMode>("day");
  const [monthCalendarVisible, setMonthCalendarVisible] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [daySummaryVisible, setDaySummaryVisible] = useState(false);
  const [weekSummaryVisible, setWeekSummaryVisible] = useState(false);
  const [insightsVisible, setInsightsVisible] = useState(false);
  const { appointments: allAppointments } = useAppointmentSession();
  const { calendarBlocks } = useCalendarBlockSession();
  const operationalAppointments = useMemo(
    () => getOperationalAgendaEntries(allAppointments),
    [allAppointments],
  );
  // The month calendar's dots: the SAME entries and local-day keys as the
  // Day view, so both always agree. Calendar Blocks are never part of them.
  const appointmentDayKeys = useMemo(
    () => getAppointmentDayKeys(operationalAppointments),
    [operationalAppointments],
  );
  const decorateCalendarMonth = useCallback(
    () => (day: Date) => getAppointmentDayDecoration(appointmentDayKeys, day),
    [appointmentDayKeys],
  );
  const previousTodayRef = useRef(today);
  const horizontalGutter =
    Platform.OS === "android" ? gutter.android : gutter.ios;
  const selectedDayAppointments = operationalAppointments.filter(
    ({ appointment }) => isSameLocalDay(appointment.startAt, selectedDay),
  );

  const refreshToday = useCallback(() => {
    const current = startOfLocalDay(new Date());
    setToday((previous) =>
      isSameLocalDay(previous, current) ? previous : current,
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshToday();
    }, [refreshToday]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshToday();
      }
    });
    const rolloverTimer = setInterval(refreshToday, 60_000);
    return () => {
      subscription.remove();
      clearInterval(rolloverTimer);
    };
  }, [refreshToday]);

  useEffect(() => {
    const previousToday = previousTodayRef.current;
    if (isSameLocalDay(previousToday, today)) return;
    previousTodayRef.current = today;
    setSelectedDay((selected) =>
      followTodayChange(selected, previousToday, today),
    );
  }, [today]);

  const selectDay = (day: Date) => {
    setSelectedDay(startOfLocalDay(day));
    setMode("day");
  };

  const shiftSelectedDay = (amount: number) => {
    setSelectedDay(addLocalDays(selectedDay, amount));
  };

  const shiftSelectedWeek = (amount: number) => {
    setSelectedDay(shiftWeek(selectedDay, amount));
  };

  const goToToday = () => {
    const current = startOfLocalDay(new Date());
    setToday(current);
    setSelectedDay(current);
  };

  // The SAME creation flow the timeline opens: a new Appointment on the
  // selected day at the start of the operational day.
  const createAppointment = () => {
    const startAt = new Date(selectedDay);
    startAt.setHours(agenda.dayStartHour, 0, 0, 0);
    router.push({
      pathname: "/appointments/new",
      params: { startAt: startAt.toISOString() },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <MainScreenHeader style={styles.header} title="Agenda" watermark="agenda">
        <AgendaViewSwitcher mode={mode} onChange={setMode} />
      </MainScreenHeader>
      {mode === "day" ? (
        <>
          <DateNavigator
            date={selectedDay}
            isToday={isSameLocalDay(selectedDay, today)}
            onGoToToday={goToToday}
            onNext={() => shiftSelectedDay(1)}
            onOpenCalendar={() => setMonthCalendarVisible(true)}
            onPressDate={() => setMonthCalendarVisible(true)}
            onPrevious={() => shiftSelectedDay(-1)}
            style={[
              styles.periodNavigation,
              { marginHorizontal: horizontalGutter },
            ]}
            testID="agenda-date"
          />
          <DayTimeline
            day={selectedDay}
            appointments={selectedDayAppointments}
            calendarBlocks={getCalendarBlocksOfLocalDay(calendarBlocks, selectedDay)}
          />
        </>
      ) : (
        <WeekView
          appointments={operationalAppointments}
          calendarBlocks={calendarBlocks}
          selectedDay={selectedDay}
          today={today}
          onSelectDay={selectDay}
          onShiftWeek={shiftSelectedWeek}
        />
      )}
      <MonthCalendarSheet
        day={selectedDay}
        decorateMonth={decorateCalendarMonth}
        onClose={() => setMonthCalendarVisible(false)}
        onSelect={(day) => {
          setSelectedDay(day);
          setMonthCalendarVisible(false);
        }}
        testID="agenda-month-calendar"
        today={today}
        visible={monthCalendarVisible}
      />
      <FloatingCreateButton
        accessibilityLabel="Actions de l'agenda"
        actions={[
          {
            icon: { ios: "calendar.badge.plus", android: "event" },
            label: "Nouveau rendez-vous",
            onPress: createAppointment,
            testID: "agenda-new-appointment",
          },
          // The summary follows the mode: the day shown in Jour, the week
          // shown in Semaine — never both.
          mode === "day"
            ? {
                icon: daySummaryIcon,
                label: "Résumé du jour",
                onPress: () => setDaySummaryVisible(true),
                testID: "agenda-day-summary",
              }
            : {
                icon: daySummaryIcon,
                label: "Résumé de la semaine",
                onPress: () => setWeekSummaryVisible(true),
                testID: "agenda-week-summary",
              },
          {
            icon: insightsIcon,
            label: "Tops & tendances",
            onPress: () => setInsightsVisible(true),
            testID: "agenda-insights",
          },
        ]}
        menuOpen={createMenuOpen}
        onMenuOpenChange={setCreateMenuOpen}
        testID="agenda-create"
      />
      <DaySummaryTicket
        day={selectedDay}
        onClose={() => setDaySummaryVisible(false)}
        visible={daySummaryVisible}
      />
      <WeekSummaryTicket
        day={selectedDay}
        onClose={() => setWeekSummaryVisible(false)}
        visible={weekSummaryVisible}
      />
      <BusinessInsightsTicket
        anchor={selectedDay}
        onClose={() => setInsightsVisible(false)}
        visible={insightsVisible}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screen, flex: 1 },
  header: { paddingBottom: spacing.md },
  // The grouped period surface replaces the old hairline under the row.
  periodNavigation: { marginBottom: spacing.sm, marginTop: spacing.xs },
});
