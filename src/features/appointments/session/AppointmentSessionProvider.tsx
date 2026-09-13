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

import {
  canDeleteAppointmentPermanently,
  canEditAppointment,
  checkoutAppointment as recordCheckout,
  removeAppointmentItem as dropItem,
  reorderAppointmentItemsByIds as arrangeItems,
  updateAppointmentItemPhaseDurations as adjustItemPhaseDurations,
  updateAppointmentPayment as correctPayment,
  type Appointment,
  type AppointmentPaymentAmounts,
  type AppointmentPhaseDurationUpdate,
} from '@/domain/appointments';
import { getLocalDateKey } from '@/features/agenda/calendar/week';
import { runInTransaction, type SourisDatabase } from '@/persistence/database';
import {
  checkoutAppointment as persistCheckout,
  countAppointmentReferences,
  deleteAppointment as removeAppointment,
  insertAppointment,
  removeAppointmentItem as persistItemRemoval,
  reorderAppointmentItems as persistItemOrder,
  updateAppointment as persistAppointment,
  updateAppointmentItemPhaseDurations as persistItemPhaseDurations,
  updateAppointmentPayment as persistPaymentCorrection,
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

  const addAppointment = (entry: AppointmentSessionEntry) => {
    const reconciledEntry = reconcileAppointmentEntriesForLocalDay([entry], new Date())[0] ?? entry;
    // ONE transaction: appointment + items + phases. Snapshot only — the
    // Service catalog is never written from Appointment workflows.
    insertAppointment(database, reconciledEntry.appointment);
    commit([...committed.current, reconciledEntry]);
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

  const replaceEntry = (appointment: Appointment) => {
    commit(
      committed.current.map((currentEntry) =>
        currentEntry.appointment.id === appointment.id ? { appointment } : currentEntry,
      ),
    );
  };

  const requireAppointment = (appointmentId: string, operation: string): Appointment => {
    const entry = committed.current.find(
      ({ appointment }) => appointment.id === appointmentId,
    );
    if (!entry) throw new Error(`${operation}: Appointment "${appointmentId}" not found`);
    return entry.appointment;
  };

  // Timing edit: the domain rebuilds the snapshot (zero stays zero, other
  // items untouched), ONE transaction writes the phase rows after
  // re-verifying editability, and state changes only after the commit.
  const updateAppointmentItemTiming = (
    appointmentId: string,
    appointmentItemId: string,
    updates: readonly AppointmentPhaseDurationUpdate[],
  ) => {
    const appointment = requireAppointment(appointmentId, 'updateAppointmentItemTiming');
    if (!canEditAppointment(appointment)) {
      throw new Error(
        `updateAppointmentItemTiming: Appointment "${appointmentId}" is no longer editable`,
      );
    }
    const next = adjustItemPhaseDurations(appointment, appointmentItemId, updates);
    persistItemPhaseDurations(database, appointmentId, appointmentItemId, updates);
    replaceEntry(next);
  };

  // Direct composition edits from Appointment Details (no draft, no Save):
  // the domain builds the next snapshot by STABLE item id, ONE transaction
  // writes it after re-verifying editability, and state changes only after
  // the commit. Linked Sales, payment and the catalog are never involved.
  const reorderAppointmentItems = (appointmentId: string, orderedItemIds: readonly string[]) => {
    const appointment = requireAppointment(appointmentId, 'reorderAppointmentItems');
    if (!canEditAppointment(appointment)) {
      throw new Error(`reorderAppointmentItems: Appointment "${appointmentId}" is no longer editable`);
    }
    const next = arrangeItems(appointment, orderedItemIds);
    persistItemOrder(database, appointmentId, orderedItemIds);
    replaceEntry(next);
  };

  const removeAppointmentItem = (appointmentId: string, appointmentItemId: string) => {
    const appointment = requireAppointment(appointmentId, 'removeAppointmentItem');
    if (!canEditAppointment(appointment)) {
      throw new Error(`removeAppointmentItem: Appointment "${appointmentId}" is no longer editable`);
    }
    const next = dropItem(appointment, appointmentItemId);
    persistItemRemoval(database, appointmentId, appointmentItemId);
    replaceEntry(next);
  };

  // Checkout: the domain decides eligibility and builds the next record; ONE
  // transaction then writes status + payment (re-verifying the stored row);
  // state reflects the record only after the commit.
  const checkoutAppointment = (appointmentId: string, amounts: AppointmentPaymentAmounts) => {
    const appointment = requireAppointment(appointmentId, 'checkoutAppointment');
    const next = recordCheckout(appointment, amounts, new Date());
    if (next === appointment || !next.payment) {
      throw new Error(`checkoutAppointment: Appointment "${appointmentId}" cannot be checked out`);
    }
    persistCheckout(database, appointmentId, next.payment);
    replaceEntry(next);
  };

  const updateAppointmentPayment = (
    appointmentId: string,
    amounts: AppointmentPaymentAmounts,
  ) => {
    const appointment = requireAppointment(appointmentId, 'updateAppointmentPayment');
    const next = correctPayment(appointment, amounts);
    if (next === appointment) {
      throw new Error(`updateAppointmentPayment: Appointment "${appointmentId}" has no payment`);
    }
    persistPaymentCorrection(database, appointmentId, amounts);
    replaceEntry(next);
  };

  const getAppointmentDeletionEligibility = (appointmentId: string) => {
    const references = countAppointmentReferences(database, appointmentId);
    return { deletable: canDeleteAppointmentPermanently(references), references };
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
        updateAppointmentItemTiming,
        reorderAppointmentItems,
        removeAppointmentItem,
        checkoutAppointment,
        updateAppointmentPayment,
        getAppointmentDeletionEligibility,
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

/** For surfaces that may render with or without an Appointment session (Sale creation). */
export function useOptionalAppointmentSession(): AppointmentSessionValue | null {
  return useContext(AppointmentSessionContext);
}
