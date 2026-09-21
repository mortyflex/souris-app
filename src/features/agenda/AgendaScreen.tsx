import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DateNavigator } from "@/shared/ui/DateNavigator";
import { DayPickerSheet } from "@/shared/ui/DayPickerSheet";
import { FloatingCreateButton } from "@/shared/ui/FloatingCreateButton";
import { MainScreenHeader } from "@/shared/ui/MainScreenHeader";
import { agenda, gutter, semanticColors, spacing } from "@/shared/ui/theme";

import { useAppointmentSession } from "@/features/appointments/session/AppointmentSessionProvider";
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
import { WeekView } from "./components/WeekView";
import { getOperationalAgendaEntries } from "./operational-visibility";

export function AgendaScreen() {
  const router = useRouter();
  // Today is always derived from the device clock; it is refreshed on focus,
  // on return from background, and on a rollover check, never frozen at mount.
  const [today, setToday] = useState<Date>(() => startOfLocalDay(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const [mode, setMode] = useState<AgendaViewMode>("day");
  const [dayPickerVisible, setDayPickerVisible] = useState(false);
  const { appointments: allAppointments } = useAppointmentSession();
  const operationalAppointments = getOperationalAgendaEntries(allAppointments);
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
            onOpenCalendar={() => setDayPickerVisible(true)}
            onPrevious={() => shiftSelectedDay(-1)}
            style={[
              styles.dayNavigation,
              { paddingHorizontal: horizontalGutter },
            ]}
            testID="agenda-date"
          />
          <DayTimeline
            day={selectedDay}
            appointments={selectedDayAppointments}
          />
        </>
      ) : (
        <WeekView
          appointments={operationalAppointments}
          selectedDay={selectedDay}
          today={today}
          onSelectDay={selectDay}
          onShiftWeek={shiftSelectedWeek}
        />
      )}
      <DayPickerSheet
        day={selectedDay}
        eyebrow="AGENDA DU"
        onClose={() => setDayPickerVisible(false)}
        onSelect={(day) => {
          setSelectedDay(day);
          setDayPickerVisible(false);
        }}
        testID="agenda-day-picker"
        visible={dayPickerVisible}
      />
      <FloatingCreateButton
        accessibilityLabel="Nouveau rendez-vous"
        onPress={createAppointment}
        testID="agenda-create-appointment"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screen, flex: 1 },
  header: { paddingBottom: spacing.md },
  dayNavigation: {
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
});
