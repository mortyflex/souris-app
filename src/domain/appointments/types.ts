// Souris — Appointment domain types
//
// Source: docs/domain/APPOINTMENTS.md
//
// Framework-independent canonical types.
// No React, React Native, Expo, or persistence imports.
// Date values use the built-in Date type; arithmetic is done on timestamps.

export type ServiceType = "SERVICE" | "TECHNIQUE";

export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export type AppointmentCancellationActor = "CLIENT" | "BUSINESS";

/**
 * A phase of a catalog Service.
 *
 * requiresStaff = true  → the professional is actively required.
 * requiresStaff = false → the client remains in the appointment, but the
 *                         professional is free (processing / unattended time).
 */
export interface ServicePhase {
  readonly id: string;
  readonly name: string;
  readonly durationMinutes: number;
  readonly requiresStaff: boolean;
}

/**
 * A catalog service.
 *
 * SERVICE  — the professional is required throughout; no unattended time.
 * TECHNIQUE — an ordered list of phases, each with its own requiresStaff.
 *             Not limited to "application + processing"; any ordered
 *             phase pattern is valid, including zero processing time.
 */
export interface Service {
  readonly id: string;
  readonly businessId: string;
  readonly name: string;
  readonly type: ServiceType;
  readonly price: number;
  readonly phases: readonly ServicePhase[];
  readonly active: boolean;
}

/**
 * A phase inside an AppointmentItem snapshot.
 * Structurally identical to ServicePhase, but owned by the appointment:
 * later catalog changes must not affect it.
 */
export interface AppointmentPhase {
  readonly id: string;
  readonly name: string;
  readonly durationMinutes: number;
  readonly requiresStaff: boolean;
}

/**
 * One booked service inside an Appointment.
 *
 * This is a historical snapshot: serviceName, serviceType, price and phases
 * preserve the state of the catalog service at booking time.
 * serviceId keeps the link to the catalog service it originated from.
 *
 * order is the authoritative sequence of the item inside the appointment.
 */
export interface AppointmentItem {
  readonly id: string;
  readonly serviceId: string;
  readonly serviceOptionId?: string;
  readonly order: number;
  readonly serviceName: string;
  readonly serviceType: ServiceType;
  readonly price: number;
  readonly phases: readonly AppointmentPhase[];
}

/**
 * Cancellation is a historical outcome. It never deletes the appointment.
 */
export interface AppointmentCancellation {
  readonly cancelledAt: Date;
  readonly cancelledBy: AppointmentCancellationActor;
  readonly reason?: string;
}

/**
 * No-show is a historical outcome. It never deletes the appointment.
 */
export interface AppointmentNoShow {
  readonly recordedAt: Date;
}

/**
 * The explicit checkout ("Encaisser") recorded by the professional: how
 * much was actually received by card and by cash, in INTEGER CENTS.
 *
 * This is not payment processing — nothing is charged. The amounts are what
 * the professional confirms having received, which may legitimately differ
 * from the snapshot total (discount, tip, adjustment). Absent on every
 * Appointment that was never checked out, including those completed
 * automatically by previous-day reconciliation.
 */
export interface AppointmentPayment {
  readonly paidAt: Date;
  readonly cardAmountCents: number;
  readonly cashAmountCents: number;
}

export interface Appointment {
  readonly id: string;
  readonly businessId: string;
  readonly clientId: string;
  readonly staffMemberId: string;
  readonly startAt: Date;
  readonly status: AppointmentStatus;
  readonly items: readonly AppointmentItem[];
  readonly notes?: string;
  readonly cancellation?: AppointmentCancellation;
  readonly noShow?: AppointmentNoShow;
  readonly payment?: AppointmentPayment;
}
