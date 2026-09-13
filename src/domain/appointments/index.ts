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
  Appointment,
} from "./types";

export type { TimelinePhase, TimelineItem, AppointmentTimeline } from "./timeline";
export {
  calculateAppointmentTimeline,
  getOrderedItems,
  getElapsedDurationMinutes,
  getStaffActiveDurationMinutes,
  getProcessingDurationMinutes,
  getAppointmentEndAt,
} from "./timeline";

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
  eurosToCents,
  getPaymentTotalCents,
  isCheckoutTotalAcceptable,
  isValidPaymentAmountCents,
  updateAppointmentPayment,
} from "./payment";

export type { AppointmentExpectedTotal } from "./expected-total";
export {
  getAppointmentExpectedTotal,
  getAppointmentLinkedSales,
  getSaleTotalCents,
} from "./expected-total";

export type { AppointmentProductIdentity, AppointmentProductLine } from "./linked-products";
export {
  getAppointmentProductKey,
  getAppointmentProductLines,
  getAppointmentProductUnitCount,
  isSameProductSnapshot,
  toAppointmentProductIdentity,
} from "./linked-products";
