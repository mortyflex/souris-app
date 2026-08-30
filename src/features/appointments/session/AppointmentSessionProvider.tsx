import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import { getLocalDateKey, startOfLocalDay } from '@/features/agenda/calendar/week';
import { createAgendaFixtures } from '@/features/agenda/fixtures/agenda-fixtures';

import { reconcileAppointmentEntriesForLocalDay } from './reconciliation';
import { removeAppointmentEntryById } from './deletion';
import type { AppointmentSessionEntry, AppointmentSessionValue } from './types';

const AppointmentSessionContext = createContext<AppointmentSessionValue | null>(null);

function createInitialSessionState() {
  const now = new Date();
  return {
    appointments: reconcileAppointmentEntriesForLocalDay(
      createAgendaFixtures(startOfLocalDay(now)),
      now,
    ),
    dayKey: getLocalDateKey(now),
  };
}

function millisecondsUntilNextLocalDay(now: Date): number {
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, nextDay.getTime() - now.getTime());
}

/**
 * The in-memory Appointment session boundary.
 *
 * Automatic previous-local-day finalization runs here (never in
 * rendering): at session start, when the app returns to the foreground, and
 * whenever the local calendar day changes while the app stays open. The
 * reconciliation is idempotent and skips work entirely while the local day
 * has not changed.
 */
export function AppointmentSessionProvider({ children }: PropsWithChildren) {
  const [initialState] = useState(createInitialSessionState);
  const [appointments, setAppointments] = useState<readonly AppointmentSessionEntry[]>(
    initialState.appointments,
  );
  const lastReconciledDayKey = useRef(initialState.dayKey);

  const reconcile = useCallback(() => {
    const now = new Date();
    const dayKey = getLocalDateKey(now);
    if (dayKey === lastReconciledDayKey.current) return;
    lastReconciledDayKey.current = dayKey;
    setAppointments((current) => reconcileAppointmentEntriesForLocalDay(current, now));
  }, []);

  useEffect(() => {
    let rolloverTimer: ReturnType<typeof setTimeout>;
    const scheduleNextRollover = () => {
      const now = new Date();
      rolloverTimer = setTimeout(() => {
        reconcile();
        scheduleNextRollover();
      }, millisecondsUntilNextLocalDay(now));
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reconcile();
      }
    });
    scheduleNextRollover();
    return () => {
      subscription.remove();
      clearTimeout(rolloverTimer);
    };
  }, [reconcile]);

  const getAppointmentById = (appointmentId: string | undefined) => {
    if (!appointmentId) return undefined;
    return appointments.find(({ appointment }) => appointment.id === appointmentId);
  };

  const addAppointment = (entry: AppointmentSessionEntry) => {
    const reconciledEntry = reconcileAppointmentEntriesForLocalDay([entry], new Date())[0] ?? entry;
    setAppointments((current) => [...current, reconciledEntry]);
  };

  const updateAppointment = (entry: AppointmentSessionEntry) => {
    const reconciledEntry = reconcileAppointmentEntriesForLocalDay([entry], new Date())[0] ?? entry;
    setAppointments((current) =>
      current.map((currentEntry) =>
        currentEntry.appointment.id === reconciledEntry.appointment.id
          ? reconciledEntry
          : currentEntry,
      ),
    );
  };

  const deleteAppointment = (appointmentId: string) => {
    setAppointments((current) => removeAppointmentEntryById(current, appointmentId));
  };

  return (
    <AppointmentSessionContext.Provider
      value={{
        appointments,
        getAppointmentById,
        addAppointment,
        updateAppointment,
        deleteAppointment,
      }}
    >
      {children}
    </AppointmentSessionContext.Provider>
  );
}

export function useAppointmentSession(): AppointmentSessionValue {
  const value = useContext(AppointmentSessionContext);
  if (!value) {
    throw new Error('useAppointmentSession must be used inside AppointmentSessionProvider');
  }
  return value;
}
