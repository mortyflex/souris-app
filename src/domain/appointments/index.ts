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

export type { CreateAppointmentItemSnapshotInput } from "./snapshot";
export { createAppointmentItemSnapshot } from "./snapshot";

export { reorderAppointmentItems, updateAppointmentPhaseDuration } from "./mutations";

export type { AppointmentItemEditDraft } from "./editing";
export {
  canRemoveAppointmentItem,
  hydrateAppointmentDrafts,
  updateAppointmentFromDrafts,
} from "./editing";
