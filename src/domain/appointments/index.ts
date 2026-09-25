// Souris — Appointment domain public entry point
//
// Only the Appointment domain exists under src/domain/ for now.

export type {
  ServiceType,
  AppointmentStatus,
  AppointmentCancellationActor,
  ServicePhase,
  Service,
  AppointmentPhase,
  AppointmentItem,
  AppointmentCancellation,
  AppointmentNoShow,
  AppointmentPayment,
  AppointmentDiscount,
  AppointmentDeposit,
  AppointmentDepositStatus,
  PaymentMethod,
  Appointment,
} from "./types";
export { isAppointmentClientReminderEnabled } from "./types";

export type { TimelinePhase, TimelineItem, AppointmentTimeline } from "./timeline";
export {
  calculateAppointmentTimeline,
  getOrderedItems,
  getElapsedDurationMinutes,
  getStaffActiveDurationMinutes,
  getProcessingDurationMinutes,
  getAppointmentEndAt,
} from "./timeline";

export type { StaffBusyInterval, StaffOccupancySource } from "./occupancy";
export {
  areStaffBusyIntervalsEqual,
  doesAppointmentOccupySchedule,
  getAppointmentStaffBusyIntervals,
} from "./occupancy";

export type {
  CreateAppointmentItemSnapshotInput,
  ServiceSnapshotSource,
} from "./snapshot";
export { createAppointmentItemSnapshot } from "./snapshot";

export type { AppointmentPhaseDurationUpdate } from "./mutations";
export {
  removeAppointmentItem,
  reorderAppointmentItems,
  reorderAppointmentItemsByIds,
  updateAppointmentItemPhaseDurations,
  updateAppointmentPhaseDuration,
} from "./mutations";

export type { PhaseDurationStepDirection } from "./phase-duration";
export {
  PHASE_DURATION_STEP_MINUTES,
  isValidPhaseDurationMinutes,
  stepPhaseDurationMinutes,
} from "./phase-duration";

export type { AppointmentItemEditDraft } from "./editing";
export {
  canRemoveAppointmentItem,
  hydrateAppointmentDrafts,
  updateAppointmentFromDrafts,
} from "./editing";

export {
  canEditAppointment,
  isEditableAppointmentStatus,
  canCompleteAppointment,
  canCancelAppointment,
  canMarkAppointmentNoShow,
  shouldAutoCompleteAppointment,
  completeAppointment,
  cancelAppointment,
  markAppointmentNoShow,
  finalizePastBusinessDays,
} from "./lifecycle";

export type { AppointmentPaymentAmounts, AppointmentReferences } from "./payment";
export {
  areValidPaymentAmounts,
  canCheckoutAppointment,
  canDeleteAppointmentPermanently,
  canEditAppointmentPayment,
  checkoutAppointment,
  checkoutAppointmentWithDiscount,
  eurosToCents,
  getPaymentTotalCents,
  isCheckoutTotalAcceptable,
  isValidPaymentAmountCents,
  updateAppointmentPayment,
} from "./payment";

export {
  MAX_DISCOUNT_PERCENT,
  areAppointmentDiscountsEqual,
  getAppointmentDiscountCents,
  isValidAppointmentDiscount,
  setAppointmentDiscount,
} from "./discount";

export type {
  AppointmentDepositInvariantBreach,
  AppointmentDepositPosition,
  AppointmentDepositRefusal,
  AppointmentDepositShortfall,
} from "./deposit";
export {
  AppointmentDepositInvalidError,
  PAYMENT_METHODS,
  canCompletePrepaidAppointment,
  canCorrectAppointmentDeposits,
  canRecordAppointmentDeposit,
  canVoidAppointmentDeposit,
  completePrepaidAppointment,
  createAppointmentDeposit,
  findAppointmentChangeDepositShortfall,
  findAppointmentDepositInvariantBreach,
  findAppointmentTotalChangeDepositShortfall,
  findDepositInvariantBreach,
  getActiveDepositTotalCents,
  getAppointmentActiveDepositTotal,
  getAppointmentDepositPosition,
  getAppointmentDeposits,
  getAppointmentRemainingAmount,
  getDepositPositionFromTotals,
  getMaximumAppointmentDepositCents,
  isActiveAppointmentDeposit,
  isAppointmentFinanciallyOpen,
  isAppointmentSettled,
  isPaymentMethod,
  isValidDepositAmountCents,
  validateAppointmentDeposit,
  validateAppointmentDepositAmount,
  voidAppointmentDeposit,
} from "./deposit";

export type { AppointmentExpectedTotal, AppointmentServicesTotal } from "./expected-total";
export {
  getAppointmentExpectedTotal,
  getAppointmentLinkedSales,
  getAppointmentServicesTotal,
  getSaleTotalCents,
} from "./expected-total";

export type {
  AppointmentDaySummary,
  AppointmentDaySummaryRow,
  AppointmentDaySummarySources,
  AppointmentPeriodActivity,
  AppointmentSummaryPeriod,
} from "./day-summary";
export {
  getAppointmentDaySummary,
  getAppointmentPeriodActivity,
  getAppointmentPeriodSummary,
} from "./day-summary";

export type { AppointmentProductIdentity, AppointmentProductLine } from "./linked-products";
export {
  getAppointmentProductKey,
  getAppointmentProductLines,
  getAppointmentProductUnitCount,
  isSameProductSnapshot,
  toAppointmentProductIdentity,
} from "./linked-products";
