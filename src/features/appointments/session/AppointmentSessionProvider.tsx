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

import type { Appointment, Service } from '@/domain/appointments';
import { getLocalDateKey } from '@/features/agenda/calendar/week';
import { useOptionalServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { runInTransaction, type SourisDatabase } from '@/persistence/database';
import {
  deleteAppointment as removeAppointment,
  insertAppointmentWithServiceDefaults,
  updateAppointment as persistAppointment,
} from '@/persistence/stores/appointments';
import { usePersistence } from '@/providers/PersistenceProvider';

import { reconcileAppointmentEntriesForLocalDay } from './reconciliation';
import { removeAppointmentEntryById } from './deletion';
import type { AppointmentSessionEntry, AppointmentSessionValue } from './types';

const AppointmentSessionContext = createContext<AppointmentSessionValue | null>(null);

/**
 * Reconciles the collection for the local day and persists every entry the
 * reconciliation changed (previous-day finalization) in one transaction.
 * Unchanged collections return the same reference and write nothing.
 */
function reconcileAndPersist(
  database: SourisDatabase,
  entries: readonly AppointmentSessionEntry[],
  now: Date,
): readonly AppointmentSessionEntry[] {
  const next = reconcileAppointmentEntriesForLocalDay(entries, now);
  if (next === entries) return entries;

  runInTransaction(database, () => {
    next.forEach((entry, index) => {
      if (entry !== entries[index]) persistAppointment(database, entry.appointment);
    });
  });
  return next;
}

function createInitialSessionState(
  database: SourisDatabase,
  appointments: readonly Appointment[],
) {
  const now = new Date();
  const entries = appointments.map((appointment) => ({ appointment }));
  return {
    appointments: reconcileAndPersist(database, entries, now),
    dayKey: getLocalDateKey(now),
  };
}

function millisecondsUntilNextLocalDay(now: Date): number {
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, nextDay.getTime() - now.getTime());
}

/**
 * The Appointment session boundary, hydrated once from the persisted
 * snapshot. Every mutation is written to SQLite first (parent + items +
 * phases in one transaction) and reflected in state only after success.
 *
 * Automatic previous-local-day finalization runs here (never in
 * rendering): at session start, when the app returns to the foreground, and
 * whenever the local calendar day changes while the app stays open. The
 * reconciliation is idempotent, persists what it changes, and skips work
 * entirely while the local day has not changed.
 */
export function AppointmentSessionProvider({ children }: PropsWithChildren) {
  const { database, snapshot } = usePersistence();
  const serviceCatalog = useOptionalServiceCatalog();
  const [initialState] = useState(() =>
    createInitialSessionState(database, snapshot.appointments),
  );
  const [appointments, setAppointments] = useState<readonly AppointmentSessionEntry[]>(
    initialState.appointments,
  );
  const committed = useRef(initialState.appointments);
  const lastReconciledDayKey = useRef(initialState.dayKey);

  const commit = useCallback((next: readonly AppointmentSessionEntry[]) => {
    committed.current = next;
    setAppointments(next);
  }, []);

  const reconcile = useCallback(() => {
    const now = new Date();
    const dayKey = getLocalDateKey(now);
    if (dayKey === lastReconciledDayKey.current) return;
    lastReconciledDayKey.current = dayKey;
    const next = reconcileAndPersist(database, committed.current, now);
    if (next !== committed.current) commit(next);
  }, [commit, database]);

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

  const addAppointment = (
    entry: AppointmentSessionEntry,
    serviceDefaultUpdates: readonly Service[] = [],
  ) => {
    if (serviceDefaultUpdates.length > 0 && !serviceCatalog) {
      throw new Error('addAppointment: Service default updates require a ServiceCatalogProvider');
    }
    const reconciledEntry = reconcileAppointmentEntriesForLocalDay([entry], new Date())[0] ?? entry;
    // ONE transaction: appointment + items + phases + catalog defaults.
    insertAppointmentWithServiceDefaults(database, reconciledEntry.appointment, serviceDefaultUpdates);
    commit([...committed.current, reconciledEntry]);
    serviceCatalog?.applyCommittedServiceUpdates(serviceDefaultUpdates);
  };

  const updateAppointment = (entry: AppointmentSessionEntry) => {
    const reconciledEntry = reconcileAppointmentEntriesForLocalDay([entry], new Date())[0] ?? entry;
    persistAppointment(database, reconciledEntry.appointment);
    commit(
      committed.current.map((currentEntry) =>
        currentEntry.appointment.id === reconciledEntry.appointment.id
          ? reconciledEntry
          : currentEntry,
      ),
    );
  };

  const deleteAppointment = (appointmentId: string) => {
    const next = removeAppointmentEntryById(committed.current, appointmentId);
    if (next === committed.current) return;
    removeAppointment(database, appointmentId);
    commit(next);
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
