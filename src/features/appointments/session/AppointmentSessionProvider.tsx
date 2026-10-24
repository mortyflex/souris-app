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
  areAppointmentDiscountsEqual,
  canCompleteAppointment,
  canCorrectAppointmentDeposits,
  canDeleteAppointmentPermanently,
  canEditAppointment,
  createAppointmentDeposit,
  voidAppointmentDeposit as markDepositVoided,
  checkoutAppointmentWithDiscount as recordCheckout,
  getAppointmentPaymentInstant,
  removeAppointmentItem as dropItem,
  reorderAppointmentItemsByIds as arrangeItems,
  setAppointmentCheckoutDiscount as applyCheckoutDiscount,
  setAppointmentDiscount as applyDiscount,
  updateAppointmentItemPhaseDurations as adjustItemPhaseDurations,
  updateAppointmentPayment as correctPayment,
  type Appointment,
  type AppointmentDeposit,
  type AppointmentDiscount,
  type AppointmentPaymentAmounts,
  type AppointmentPaymentDate,
  type AppointmentPhaseDurationUpdate,
} from '@/domain/appointments';
import { useBusinessWriteGuard } from '@/features/access/write-guard';
import { getLocalDateKey } from '@/features/agenda/calendar/week';
import { runInTransaction, type SourisDatabase } from '@/persistence/database';
import {
  AppointmentDepositConflictError,
  insertAppointmentDeposit,
  voidAppointmentDeposit as persistDepositVoid,
} from '@/persistence/stores/appointment-deposits';
import {
  checkoutAppointment as persistCheckout,
  completePrepaidAppointment as persistPrepaidCompletion,
  countAppointmentReferences,
  deleteAppointment as removeAppointment,
  insertAppointment,
  insertAppointmentWithDeposit,
  removeAppointmentItem as persistItemRemoval,
  settleCompletedAppointmentWithDeposits as persistDepositSettlement,
  reorderAppointmentItems as persistItemOrder,
  updateAppointment as persistAppointment,
  updateAppointmentDiscount as persistDiscount,
  updateAppointmentItemPhaseDurations as persistItemPhaseDurations,
  updateAppointmentPayment as persistPaymentCorrection,
} from '@/persistence/stores/appointments';
import { usePersistence, useSnapshotRefresh } from '@/providers/PersistenceProvider';

import { reconcileAppointmentEntriesForLocalDay } from './reconciliation';
import { removeAppointmentEntryById } from './deletion';
import type {
  AppointmentCheckoutDiscount,
  AppointmentCreationDeposit,
  AppointmentDepositInput,
  AppointmentSessionEntry,
  AppointmentSessionValue,
} from './types';

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
 * snapshot. Every user-initiated mutation passes the business write guard
 * first (features/access/write-guard.ts), is written to SQLite next (parent +
 * items + phases in one transaction) and is reflected in state only after
 * success. The automatic previous-day finalization below is NOT user-initiated
 * and never goes through the guard: a read-only session keeps its history true.
 *
 * Appointment deposits live in the same session: they belong to the
 * Appointment's financial state, and every surface that reads it (Details,
 * checkout, Cash Register, day summary) already reads this session. The
 * stored rows are the authority for every deposit rule: the store re-reads
 * the Appointment, its linked Sales and its deposits inside each transaction.
 * A deposit already received for a NEW Appointment (« Ajouter un acompte
 * reçu » on the creation Résumé) is written by `addAppointment` in the SAME
 * transaction as the Appointment — both saved, or neither.
 *
 * Automatic previous-local-day finalization runs here (never in
 * rendering): at session start, when the app returns to the foreground, and
 * whenever the local calendar day changes while the app stays open. The
 * reconciliation is idempotent, persists what it changes, and skips work
 * entirely while the local day has not changed.
 */
export function AppointmentSessionProvider({ children }: PropsWithChildren) {
  const { database, snapshot } = usePersistence();
  const requireWriteAccess = useBusinessWriteGuard();
  const [initialState] = useState(() =>
    createInitialSessionState(database, snapshot.appointments),
  );
  const [appointments, setAppointments] = useState<readonly AppointmentSessionEntry[]>(
    initialState.appointments,
  );
  const committed = useRef(initialState.appointments);
  const lastReconciledDayKey = useRef(initialState.dayKey);
  const [deposits, setDeposits] = useState<readonly AppointmentDeposit[]>(
    snapshot.appointmentDeposits,
  );
  const committedDeposits = useRef(snapshot.appointmentDeposits);
  const commitDeposits = (next: readonly AppointmentDeposit[]) => {
    committedDeposits.current = next;
    setDeposits(next);
  };

  const commit = useCallback((next: readonly AppointmentSessionEntry[]) => {
    committed.current = next;
    setAppointments(next);
  }, []);

  // Remote changes applied by the sync runner, adopted in place — through the
  // same previous-day reconciliation as the hydration at mount.
  useSnapshotRefresh((fresh) => {
    const now = new Date();
    lastReconciledDayKey.current = getLocalDateKey(now);
    commit(
      reconcileAndPersist(
        database,
        fresh.appointments.map((appointment) => ({ appointment })),
        now,
      ),
    );
    commitDeposits(fresh.appointmentDeposits);
  });

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

  const addAppointment = (entry: AppointmentSessionEntry, deposit?: AppointmentCreationDeposit) => {
    requireWriteAccess('appointments.addAppointment');
    const now = new Date();
    const reconciledEntry = reconcileAppointmentEntriesForLocalDay([entry], now)[0] ?? entry;
    if (!deposit) {
      // ONE transaction: appointment + items + phases. Snapshot only — the
      // Service catalog is never written from Appointment workflows.
      insertAppointment(database, reconciledEntry.appointment);
      commit([...committed.current, reconciledEntry]);
      return;
    }

    // A deposit ALREADY received for the new Appointment: the same deposit
    // record as « Prendre un acompte », received now, written in the SAME
    // transaction as the Appointment. The store re-verifies it against the
    // rows just inserted and refuses a repeated id; a refusal rolls the
    // Appointment back too, so state changes only once both are committed.
    if (committedDeposits.current.some((candidate) => candidate.id === deposit.id)) {
      throw new AppointmentDepositConflictError(deposit.id, 'DUPLICATE_DEPOSIT');
    }
    const { appointment } = reconciledEntry;
    const record = createAppointmentDeposit({
      id: deposit.id,
      businessId: appointment.businessId,
      appointmentId: appointment.id,
      amountCents: deposit.amountCents,
      paymentMethod: deposit.paymentMethod,
      paidAt: now,
      status: 'ACTIVE',
      createdAt: now,
    });
    insertAppointmentWithDeposit(database, appointment, record);
    commit([...committed.current, reconciledEntry]);
    commitDeposits([...committedDeposits.current, record]);
  };

  const updateAppointment = (entry: AppointmentSessionEntry) => {
    requireWriteAccess('appointments.updateAppointment');
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
    requireWriteAccess('appointments.updateAppointmentItemTiming');
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
    requireWriteAccess('appointments.reorderAppointmentItems');
    const appointment = requireAppointment(appointmentId, 'reorderAppointmentItems');
    if (!canEditAppointment(appointment)) {
      throw new Error(`reorderAppointmentItems: Appointment "${appointmentId}" is no longer editable`);
    }
    const next = arrangeItems(appointment, orderedItemIds);
    persistItemOrder(database, appointmentId, orderedItemIds);
    replaceEntry(next);
  };

  const removeAppointmentItem = (appointmentId: string, appointmentItemId: string) => {
    requireWriteAccess('appointments.removeAppointmentItem');
    const appointment = requireAppointment(appointmentId, 'removeAppointmentItem');
    if (!canEditAppointment(appointment)) {
      throw new Error(`removeAppointmentItem: Appointment "${appointmentId}" is no longer editable`);
    }
    const next = dropItem(appointment, appointmentItemId);
    persistItemRemoval(database, appointmentId, appointmentItemId);
    replaceEntry(next);
  };

  // Discount: the domain validates the discount and the editing rule, ONE
  // transaction writes the two columns after re-verifying the stored status,
  // and state changes only after the commit. Item snapshot prices are never
  // touched; every total stays derived.
  const setAppointmentDiscount = (
    appointmentId: string,
    discount: AppointmentDiscount | undefined,
  ) => {
    requireWriteAccess('appointments.setAppointmentDiscount');
    const appointment = requireAppointment(appointmentId, 'setAppointmentDiscount');
    if (!canEditAppointment(appointment)) {
      throw new Error(`setAppointmentDiscount: Appointment "${appointmentId}" is no longer editable`);
    }
    const next = applyDiscount(appointment, discount);
    persistDiscount(database, appointmentId, discount);
    replaceEntry(next);
  };

  // Checkout: the domain decides eligibility, validates the final discount
  // (THE checkout discount rule: open, or COMPLETED without payment) and the
  // payment date, and builds the next record; ONE store transaction then
  // writes the changed discount and status + payment, re-verifying the stored
  // row — including that the amounts settle EXACTLY the checkout due. A
  // refused step rolls both back; state reflects the record only after the
  // commit.
  const checkoutAppointment = (
    appointmentId: string,
    amounts: AppointmentPaymentAmounts,
    finalDiscount?: AppointmentCheckoutDiscount,
    paymentDate: AppointmentPaymentDate = 'TODAY',
  ) => {
    requireWriteAccess('appointments.checkoutAppointment');
    const appointment = requireAppointment(appointmentId, 'checkoutAppointment');
    const discount = finalDiscount ? finalDiscount.discount : appointment.discount;
    const now = new Date();
    const paidAt = getAppointmentPaymentInstant(appointment, paymentDate, now);
    const next = recordCheckout(appointment, discount, amounts, now, paidAt);
    if (next === appointment || !next.payment) {
      throw new Error(`checkoutAppointment: Appointment "${appointmentId}" cannot be checked out`);
    }
    persistCheckout(
      database,
      appointmentId,
      next.payment,
      areAppointmentDiscountsEqual(appointment.discount, next.discount)
        ? undefined
        : { discount: next.discount },
    );
    replaceEntry(next);
  };

  // Prepaid completion: the final discount goes through THE discount action
  // (and is written first, guarded against the deposits like any discount);
  // the store then re-verifies, in the SAME transaction, that the ACTIVE
  // deposits cover the whole expected total, and writes COMPLETED with NO
  // payment. State reflects the record only after the commit.
  //
  // An Appointment ALREADY COMPLETED without payment (a late checkout whose
  // discount brings the total down to the deposits) is settled by its
  // deposits: the store writes ONLY the discount, re-verifying in the same
  // transaction that the deposits cover everything. No payment, status kept.
  const completePrepaidAppointment = (
    appointmentId: string,
    finalDiscount?: AppointmentCheckoutDiscount,
  ) => {
    requireWriteAccess('appointments.completePrepaidAppointment');
    const appointment = requireAppointment(appointmentId, 'completePrepaidAppointment');
    if (appointment.status === 'COMPLETED') {
      const discount = finalDiscount ? finalDiscount.discount : appointment.discount;
      const candidate = applyCheckoutDiscount(appointment, discount);
      if (appointment.payment !== undefined || !areAppointmentDiscountsEqual(candidate.discount, discount)) {
        throw new Error(`completePrepaidAppointment: Appointment "${appointmentId}" cannot be settled`);
      }
      persistDepositSettlement(database, appointmentId, { discount });
      replaceEntry(candidate);
      return;
    }
    const now = new Date();
    const candidate = finalDiscount ? applyDiscount(appointment, finalDiscount.discount) : appointment;
    if (!canCompleteAppointment(candidate, now) || candidate.payment !== undefined) {
      throw new Error(`completePrepaidAppointment: Appointment "${appointmentId}" cannot be completed`);
    }
    runInTransaction(database, () => {
      if (!areAppointmentDiscountsEqual(appointment.discount, candidate.discount)) {
        persistDiscount(database, appointmentId, candidate.discount);
      }
      persistPrepaidCompletion(database, appointmentId, now);
    });
    replaceEntry({ ...candidate, status: 'COMPLETED' });
  };

  const updateAppointmentPayment = (
    appointmentId: string,
    amounts: AppointmentPaymentAmounts,
  ) => {
    requireWriteAccess('appointments.updateAppointmentPayment');
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
    requireWriteAccess('appointments.deleteAppointment');
    const next = removeAppointmentEntryById(committed.current, appointmentId);
    if (next === committed.current) return;
    removeAppointment(database, appointmentId);
    commit(next);
  };

  // A deposit is received NOW. The domain validates its shape; the store
  // re-verifies the Appointment (open, enough left to collect) and refuses a
  // second write of the same id, so a double submission never duplicates.
  const recordAppointmentDeposit = (input: AppointmentDepositInput): AppointmentDeposit => {
    requireWriteAccess('appointments.recordAppointmentDeposit');
    const appointment = requireAppointment(input.appointmentId, 'recordAppointmentDeposit');
    if (committedDeposits.current.some((deposit) => deposit.id === input.id)) {
      throw new AppointmentDepositConflictError(input.id, 'DUPLICATE_DEPOSIT');
    }
    const now = new Date();
    const deposit = createAppointmentDeposit({
      id: input.id,
      businessId: appointment.businessId,
      appointmentId: appointment.id,
      amountCents: input.amountCents,
      paymentMethod: input.paymentMethod,
      paidAt: now,
      status: 'ACTIVE',
      createdAt: now,
    });
    insertAppointmentDeposit(database, deposit);
    commitDeposits([...committedDeposits.current, deposit]);
    return deposit;
  };

  const voidAppointmentDeposit = (depositId: string) => {
    requireWriteAccess('appointments.voidAppointmentDeposit');
    const deposit = committedDeposits.current.find((candidate) => candidate.id === depositId);
    if (!deposit) throw new AppointmentDepositConflictError(depositId, 'DEPOSIT_NOT_FOUND');
    const appointment = requireAppointment(deposit.appointmentId, 'voidAppointmentDeposit');
    // A mistaken entry stays correctable after a cancellation or a no-show; only
    // a COMPLETED Appointment is frozen (docs/domain/APPOINTMENTS.md §25d).
    if (!canCorrectAppointmentDeposits(appointment)) {
      throw new AppointmentDepositConflictError(depositId, 'APPOINTMENT_NOT_OPEN');
    }
    const now = new Date();
    const voided = markDepositVoided(deposit, appointment, now);
    if (voided === deposit || !voided.voidedAt) {
      throw new AppointmentDepositConflictError(depositId, 'DEPOSIT_NOT_ACTIVE');
    }
    persistDepositVoid(database, depositId, voided.voidedAt);
    commitDeposits(
      committedDeposits.current.map((candidate) => (candidate.id === depositId ? voided : candidate)),
    );
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
        setAppointmentDiscount,
        checkoutAppointment,
        completePrepaidAppointment,
        updateAppointmentPayment,
        getAppointmentDeletionEligibility,
        deleteAppointment,
        deposits,
        recordAppointmentDeposit,
        voidAppointmentDeposit,
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
