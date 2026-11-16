/**
 * The customer's booking journey, as pure state transitions (no React, no
 * network): choose ONE service, a date and a start time, give a name and a
 * contact, review, confirm.
 *
 * The rules that keep a booking from being lost or made twice live here:
 *
 *   * ONE idempotency key per booking ATTEMPT — an attempt is one immutable
 *     request (service, start, name, contact). A new key is drawn only when a
 *     new attempt starts.
 *   * When an attempt's outcome is UNKNOWN (network failure, timeout, server
 *     error), its key and its request are FROZEN: the only way forward is to
 *     send the very same request again under the very same key — the engine
 *     then replays the booking instead of creating a second one. Nothing can be
 *     edited meanwhile, and the key is never replaced silently.
 *   * While a request is in flight, nothing else is sent (no double
 *     submission).
 *   * A definitive refusal releases the attempt: SLOT_UNAVAILABLE keeps the
 *     customer's details and goes back to the times, which are read again.
 *
 * Selecting a time never holds it: only creation decides, under the lock.
 */

import type { AvailableSlot, BookableService } from "@/features/availability/availability";

import type { BookingResponse, ConfirmedBooking } from "./booking-answer";
import {
  cleanDetails,
  customerFieldOf,
  customerIssues,
  EMPTY_DETAILS,
  hasIssues,
  type BookingRequest,
  type CustomerDetails,
  type CustomerField,
  type CustomerIssues,
} from "./booking-request";

export type FlowStep = "service" | "slot" | "details" | "review" | "done";

/** The four steps the customer walks through (the confirmation is the outcome, not a step). */
export const JOURNEY: readonly Exclude<FlowStep, "done">[] = ["service", "slot", "details", "review"];

export type FlowNotice =
  /** The chosen time was taken meanwhile: the times are read again, the details are kept. */
  | "SLOT_TAKEN"
  /** The service is no longer offered online. */
  | "SERVICE_GONE"
  /** The server refused the time or the service as malformed: choose again. */
  | "REQUEST_REFUSED"
  /** The professional's calendar was busy: retry the same request. */
  | "BUSY"
  /** The outcome is unknown: retry the same request; it will not be booked twice. */
  | "UNCERTAIN"
  | "RATE_LIMITED"
  | "PROTECTION_UNAVAILABLE"
  /** The key already booked something else: nothing was booked this time. */
  | "KEY_REUSED"
  /** Online booking is not available. */
  | "CLOSED"
  /** Online booking is not available now, and an EARLIER send of this request may have booked. */
  | "CLOSED_UNCERTAIN";

export interface PendingAttempt {
  readonly key: string;
  readonly request: BookingRequest;
  /** An earlier send of THIS request may have booked: key and request are frozen. */
  readonly uncertain: boolean;
  readonly sending: boolean;
}

export interface FlowState {
  readonly step: FlowStep;
  /** The service as it was offered when chosen (its id is what is sent). */
  readonly service?: BookableService;
  readonly date?: string;
  readonly slot?: AvailableSlot;
  readonly details: CustomerDetails;
  readonly issues: CustomerIssues;
  /** A field the SERVER refused (its rules are the authority). */
  readonly refusedField?: CustomerField;
  readonly attempt?: PendingAttempt;
  readonly notice?: FlowNotice;
  readonly confirmation?: ConfirmedBooking;
  /** Bumped when the times of the chosen date must be read again. */
  readonly slotsRevision: number;
  /** Bumped when the list of services must be read again. */
  readonly servicesRevision: number;
}

export type FlowAction =
  | { readonly type: "CHOOSE_SERVICE"; readonly service: BookableService; readonly firstDate: string }
  | { readonly type: "CHOOSE_DATE"; readonly date: string }
  | { readonly type: "CHOOSE_SLOT"; readonly slot: AvailableSlot }
  | { readonly type: "GO_TO"; readonly step: FlowStep }
  | { readonly type: "EDIT_DETAIL"; readonly field: CustomerField; readonly value: string }
  | { readonly type: "REVIEW_DETAILS" }
  /** The send planned by `planSend` has started. */
  | { readonly type: "SENDING"; readonly attempt: PendingAttempt }
  | { readonly type: "ANSWER"; readonly response: BookingResponse }
  /** The availability says the chosen service is no longer bookable. */
  | { readonly type: "SERVICE_UNAVAILABLE" }
  /** The availability says the page does not accept bookings any more. */
  | { readonly type: "CLOSED" }
  | { readonly type: "RESTART" };

export function initialFlowState(details: CustomerDetails = EMPTY_DETAILS): FlowState {
  return { step: "service", details, issues: {}, slotsRevision: 0, servicesRevision: 0 };
}

/** Frozen: a request is in flight, or an earlier send of it has an unknown outcome. */
export function isAttemptLocked(state: FlowState): boolean {
  return state.attempt !== undefined && (state.attempt.sending || state.attempt.uncertain);
}

/** The request the review shows and confirms. */
export function requestOf(state: FlowState): BookingRequest | undefined {
  if (state.service === undefined || state.slot === undefined) return undefined;
  if (hasIssues(customerIssues(state.details))) return undefined;
  return { serviceId: state.service.id, startsAt: state.slot.startsAt, ...cleanDetails(state.details) };
}

/** Whether a step can be shown with what has been chosen so far. */
export function canShowStep(state: FlowState, step: FlowStep): boolean {
  switch (step) {
    case "service":
      return true;
    case "slot":
      return state.service !== undefined;
    case "details":
      return state.service !== undefined && state.slot !== undefined;
    case "review":
      return requestOf(state) !== undefined;
    case "done":
      return state.confirmation !== undefined;
  }
}

export type SendPlan = { readonly attempt: PendingAttempt } | undefined;

/**
 * What a press on « Confirmer » sends — or nothing. While a request is in
 * flight: nothing (no double submission). With a pending attempt: the SAME
 * key and the SAME request again. Otherwise a new attempt, with a new key
 * drawn from `newKey`.
 */
export function planSend(state: FlowState, newKey: () => string): SendPlan {
  if (state.step !== "review") return undefined;
  if (state.attempt?.sending) return undefined;
  if (state.attempt !== undefined) return { attempt: { ...state.attempt, sending: true } };
  const request = requestOf(state);
  if (request === undefined) return undefined;
  return { attempt: { key: newKey(), request, uncertain: false, sending: true } };
}

/** A change of what is being booked: allowed unless frozen; it ends a pending, certain attempt. */
function editable(state: FlowState): boolean {
  return state.step !== "done" && !isAttemptLocked(state);
}

function settle(state: FlowState, response: BookingResponse): FlowState {
  const attempt = state.attempt;
  if (attempt === undefined || !attempt.sending) return state;
  const paused = { ...attempt, sending: false };

  switch (response.status) {
    case "BOOKED":
      return { ...state, step: "done", confirmation: response.booking, attempt: undefined, notice: undefined };
    case "SLOT_UNAVAILABLE":
      return {
        ...state,
        step: "slot",
        slot: undefined,
        attempt: undefined,
        notice: "SLOT_TAKEN",
        slotsRevision: state.slotsRevision + 1,
      };
    case "UNKNOWN_SERVICE":
      return {
        ...state,
        step: "service",
        service: undefined,
        date: undefined,
        slot: undefined,
        attempt: undefined,
        notice: "SERVICE_GONE",
        servicesRevision: state.servicesRevision + 1,
      };
    case "INVALID_REQUEST": {
      const field = customerFieldOf(response.field);
      if (field !== undefined) {
        return {
          ...state,
          step: "details",
          attempt: undefined,
          notice: undefined,
          refusedField: field,
          issues: { ...state.issues, [field]: "invalid" },
        };
      }
      return {
        ...state,
        step: "slot",
        slot: undefined,
        attempt: undefined,
        notice: "REQUEST_REFUSED",
        slotsRevision: state.slotsRevision + 1,
      };
    }
    case "BUSY":
      return { ...state, attempt: paused, notice: "BUSY" };
    case "RATE_LIMITED":
      return { ...state, attempt: paused, notice: "RATE_LIMITED" };
    case "PROTECTION_UNAVAILABLE":
      return { ...state, attempt: paused, notice: "PROTECTION_UNAVAILABLE" };
    case "IDEMPOTENCY_KEY_REUSED":
      // Nothing was booked by THIS request; a new attempt needs the customer's explicit confirmation.
      return { ...state, attempt: undefined, notice: "KEY_REUSED" };
    case "UNAVAILABLE":
      return { ...state, attempt: undefined, notice: attempt.uncertain ? "CLOSED_UNCERTAIN" : "CLOSED" };
    case "REJECTED":
      // Refused at the door: this send booked nothing — an earlier unknown one still may have.
      return attempt.uncertain
        ? { ...state, attempt: paused, notice: "UNCERTAIN" }
        : { ...state, attempt: undefined, notice: "CLOSED" };
    case "ERROR":
      return { ...state, attempt: { ...paused, uncertain: true }, notice: "UNCERTAIN" };
  }
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "CHOOSE_SERVICE":
      if (!editable(state)) return state;
      return {
        ...state,
        step: "slot",
        service: action.service,
        date: action.firstDate,
        slot: undefined,
        attempt: undefined,
        notice: undefined,
      };
    case "CHOOSE_DATE":
      if (!editable(state) || state.service === undefined) return state;
      return { ...state, date: action.date, slot: undefined, attempt: undefined, notice: undefined };
    case "CHOOSE_SLOT":
      if (!editable(state) || state.service === undefined) return state;
      return { ...state, slot: action.slot, attempt: undefined, notice: undefined };
    case "GO_TO":
      if (state.step === "done" || action.step === "done") return state;
      if (isAttemptLocked(state) && action.step !== "review") return state;
      if (!canShowStep(state, action.step)) return state;
      return { ...state, step: action.step };
    case "EDIT_DETAIL": {
      if (!editable(state)) return state;
      const issues = { ...state.issues };
      delete issues[action.field];
      return {
        ...state,
        details: { ...state.details, [action.field]: action.value },
        issues,
        refusedField: state.refusedField === action.field ? undefined : state.refusedField,
        attempt: undefined,
      };
    }
    case "REVIEW_DETAILS": {
      if (!editable(state) || !canShowStep(state, "details")) return state;
      const issues = customerIssues(state.details);
      if (hasIssues(issues)) return { ...state, issues };
      return { ...state, step: "review", details: cleanDetails(state.details), issues: {}, refusedField: undefined, notice: undefined };
    }
    case "SENDING":
      if (state.step !== "review" || state.attempt?.sending) return state;
      return { ...state, attempt: action.attempt };
    case "ANSWER":
      return settle(state, action.response);
    case "SERVICE_UNAVAILABLE":
      if (isAttemptLocked(state) || state.step === "done") return state;
      return {
        ...state,
        step: "service",
        service: undefined,
        date: undefined,
        slot: undefined,
        attempt: undefined,
        notice: "SERVICE_GONE",
        servicesRevision: state.servicesRevision + 1,
      };
    case "CLOSED":
      if (isAttemptLocked(state) || state.step === "done") return state;
      return { ...state, notice: "CLOSED" };
    case "RESTART":
      // A new booking: the customer keeps what she typed, nothing else.
      return initialFlowState(state.details);
  }
}
