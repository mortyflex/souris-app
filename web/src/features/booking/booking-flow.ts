/**
 * The customer's booking journey, as pure state transitions (no React, no
 * network): choose the service(s), a date and a start time, give a name and a
 * contact, review, confirm.
 *
 * Two modes, decided by the SERVER for the page (`booking-catalog.ts`):
 *
 *   * `selection` — the database has the multi-service contract: the customer
 *     adds 1 to 8 distinct services in HER order (never sorted), then chooses
 *     a time offered for the WHOLE selection; ONE appointment is booked. Every
 *     time the server offers comes with its reading of the selection (names,
 *     lengths, prices) and a fingerprint of it — the `quote`: the review shows
 *     the quote, and the booking sends its fingerprint back. A change of the
 *     selection clears the time and the quote.
 *   * `single` — an older server: ONE service, exactly the deployed flow.
 *
 * The rules that keep a booking from being lost or made twice live here:
 *
 *   * ONE idempotency key per booking ATTEMPT — an attempt is one immutable
 *     request. A new key is drawn only when a new attempt starts; any change
 *     of what is booked ends the attempt (a new key next time).
 *   * When an attempt's outcome is UNKNOWN (network failure, timeout, server
 *     error), its key and its request are FROZEN: the only way forward is to
 *     send the very same request again under the very same key — the engine
 *     then replays the booking instead of creating a second one. Nothing can be
 *     edited meanwhile, and the key is never replaced silently.
 *   * While a request is in flight, nothing else is sent (no double
 *     submission).
 *   * The bot-challenge token is NOT part of an attempt: it is single-use and
 *     travels beside the request, so a retry sends the same request under the
 *     same key with a new token (`booking-flow.tsx`, `challenge.ts`).
 *   * A definitive refusal releases the attempt: SLOT_UNAVAILABLE keeps the
 *     customer's details and goes back to the times, which are read again;
 *     SELECTION_CHANGED goes back to the services, read again, and names what
 *     changed — nothing is booked with values the customer has not seen.
 *
 * Selecting a time never holds it: only creation decides, under the lock.
 */

import type { AvailableSlot, BookableService } from "@/features/availability/availability";
import { MAX_SELECTED_SERVICES, selectionChanges, type SelectionQuote, type ServiceChange } from "@/features/availability/selection";

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
import type { SelectionBookingRequest } from "./selection-request";

/** Which booking the page's server supports (`booking-catalog.ts`). */
export type BookingMode = "selection" | "single";

export type FlowStep = "service" | "slot" | "details" | "review" | "done";

/** The four steps the customer walks through (the confirmation is the outcome, not a step). */
export const JOURNEY: readonly Exclude<FlowStep, "done">[] = ["service", "slot", "details", "review"];

export type FlowNotice =
  /** The chosen time was taken meanwhile: the times are read again, the details are kept. */
  | "SLOT_TAKEN"
  /** A service is no longer offered online (named in `noticeServices` when known). */
  | "SERVICE_GONE"
  /** The server refused the time or the selection as malformed: choose again. */
  | "REQUEST_REFUSED"
  /** The professional's calendar was busy: retry the same request. */
  | "BUSY"
  /** The outcome is unknown: retry the same request; it will not be booked twice. */
  | "UNCERTAIN"
  | "RATE_LIMITED"
  | "PROTECTION_UNAVAILABLE"
  /** The security check was refused (expired, already used…): a new one runs; confirm again. */
  | "CHALLENGE_FAILED"
  /** The key already booked something else: nothing was booked this time. */
  | "KEY_REUSED"
  /** Online booking is not available. */
  | "CLOSED"
  /** Online booking is not available now, and an EARLIER send of this request may have booked. */
  | "CLOSED_UNCERTAIN"
  /** The booking was refused: a selected service changed since it was shown (`changes`). Nothing was booked. */
  | "SELECTION_CHANGED"
  /** While choosing, the server's details of a selected service changed (`changes`): the time is chosen again. */
  | "SELECTION_UPDATED"
  /** The selection is longer than 12 hours. */
  | "SELECTION_TOO_LONG"
  /** The selection saved in this tab no longer matches the page: what is not offered any more was left out. */
  | "SELECTION_RESTORED";

export type AttemptRequest = BookingRequest | SelectionBookingRequest;

export interface PendingAttempt {
  readonly key: string;
  readonly request: AttemptRequest;
  /** An earlier send of THIS request may have booked: key and request are frozen. */
  readonly uncertain: boolean;
  readonly sending: boolean;
}

export interface FlowState {
  readonly mode: BookingMode;
  readonly step: FlowStep;
  /**
   * The chosen services in the customer's order, as the page last offered
   * them (their ids are what is sent). One at most in the `single` mode.
   */
  readonly selection: readonly BookableService[];
  readonly date?: string;
  readonly slot?: AvailableSlot;
  /** `selection` mode: the server's reading of the selection that offered `slot` — shown at review, fingerprint sent. */
  readonly quote?: SelectionQuote;
  readonly details: CustomerDetails;
  readonly issues: CustomerIssues;
  /** A field the SERVER refused (its rules are the authority). */
  readonly refusedField?: CustomerField;
  readonly attempt?: PendingAttempt;
  readonly notice?: FlowNotice;
  /** The services a notice is about, by name (no longer offered). */
  readonly noticeServices?: readonly string[];
  /** What a SELECTION_CHANGED or SELECTION_UPDATED notice lists. */
  readonly changes?: readonly ServiceChange[];
  /** After SELECTION_CHANGED: the services as she last reviewed them, until the catalogue has been read again. */
  readonly reviewed?: readonly BookableService[];
  readonly confirmation?: ConfirmedBooking;
  /** Bumped when the times of the chosen date must be read again. */
  readonly slotsRevision: number;
  /** Bumped when the list of services must be read again. */
  readonly servicesRevision: number;
}

export type FlowAction =
  /** `single` mode: THE service — the flow moves on to the times. */
  | { readonly type: "CHOOSE_SERVICE"; readonly service: BookableService; readonly firstDate: string }
  /** `selection` mode: one more service, at the END of her selection. */
  | { readonly type: "ADD_SERVICE"; readonly service: BookableService }
  | { readonly type: "REMOVE_SERVICE"; readonly serviceId: string }
  /** `selection` mode: « Choisir un horaire » — on to the times of the whole selection. */
  | { readonly type: "CHOOSE_TIMES"; readonly firstDate: string }
  | { readonly type: "CHOOSE_DATE"; readonly date: string }
  /** A start, with — in the `selection` mode — the server's reading of the selection that offered it. */
  | { readonly type: "CHOOSE_SLOT"; readonly slot: AvailableSlot; readonly quote?: SelectionQuote }
  | { readonly type: "GO_TO"; readonly step: FlowStep }
  | { readonly type: "EDIT_DETAIL"; readonly field: CustomerField; readonly value: string }
  | { readonly type: "REVIEW_DETAILS" }
  /** The send planned by `planSend` has started. */
  | { readonly type: "SENDING"; readonly attempt: PendingAttempt }
  | { readonly type: "ANSWER"; readonly response: BookingResponse }
  /** The availability says a chosen service is no longer bookable (the first one, when known). */
  | { readonly type: "SERVICE_UNAVAILABLE"; readonly serviceId?: string }
  /** The availability refused the selection itself (its shape): choose again. */
  | { readonly type: "SELECTION_REFUSED" }
  /** The page's services as the server just gave them. */
  | { readonly type: "CATALOG"; readonly services: readonly BookableService[] }
  /** `selection` mode: the ids saved in this tab, checked against the page's services. */
  | { readonly type: "RESTORE"; readonly ids: readonly string[]; readonly services: readonly BookableService[] }
  /** The availability says the page does not accept bookings any more. */
  | { readonly type: "CLOSED" }
  | { readonly type: "RESTART" };

export function initialFlowState(mode: BookingMode = "single", details: CustomerDetails = EMPTY_DETAILS): FlowState {
  return { mode, step: "service", selection: [], details, issues: {}, slotsRevision: 0, servicesRevision: 0 };
}

/** Frozen: a request is in flight, or an earlier send of it has an unknown outcome. */
export function isAttemptLocked(state: FlowState): boolean {
  return state.attempt !== undefined && (state.attempt.sending || state.attempt.uncertain);
}

const idsOf = (services: readonly { readonly id: string }[]) => services.map((service) => service.id);
const sameIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

/** The quote offered the slot for THIS selection, in this order. */
function quoteMatches(state: FlowState, quote: SelectionQuote | undefined): quote is SelectionQuote {
  return quote !== undefined && sameIds(idsOf(quote.services), idsOf(state.selection));
}

/** The request the review shows and confirms. */
export function requestOf(state: FlowState): AttemptRequest | undefined {
  if (state.selection.length === 0 || state.slot === undefined) return undefined;
  if (hasIssues(customerIssues(state.details))) return undefined;
  const details = cleanDetails(state.details);
  if (state.mode === "single") {
    return state.selection.length === 1 ? { serviceId: state.selection[0]!.id, startsAt: state.slot.startsAt, ...details } : undefined;
  }
  if (!quoteMatches(state, state.quote)) return undefined;
  return { serviceIds: idsOf(state.selection), startsAt: state.slot.startsAt, fingerprint: state.quote.fingerprint, ...details };
}

/** Whether a step can be shown with what has been chosen so far. */
export function canShowStep(state: FlowState, step: FlowStep): boolean {
  switch (step) {
    case "service":
      return true;
    case "slot":
      return state.selection.length > 0;
    case "details":
      return state.selection.length > 0 && state.slot !== undefined && (state.mode === "single" || quoteMatches(state, state.quote));
    case "review":
      return requestOf(state) !== undefined;
    case "done":
      return state.confirmation !== undefined;
  }
}

/** Whether one more service may be added (`selection` mode): not already chosen, fewer than eight. */
export function canAddService(state: FlowState, serviceId: string): boolean {
  return (
    state.mode === "selection" &&
    state.selection.length < MAX_SELECTED_SERVICES &&
    !state.selection.some((service) => service.id === serviceId)
  );
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

/** What a change of the selection, the date or the services makes stale: the time, its quote, the attempt, the notices. */
const CLEARED = {
  slot: undefined,
  quote: undefined,
  attempt: undefined,
  notice: undefined,
  noticeServices: undefined,
  changes: undefined,
  reviewed: undefined,
} as const;

/** Back to the services, read again: something about them changed. */
function backToServices(state: FlowState, notice: FlowNotice, extra: Partial<FlowState> = {}): FlowState {
  return {
    ...state,
    ...CLEARED,
    step: "service",
    notice,
    servicesRevision: state.servicesRevision + 1,
    ...extra,
  };
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
        quote: undefined,
        attempt: undefined,
        notice: "SLOT_TAKEN",
        slotsRevision: state.slotsRevision + 1,
      };
    case "UNKNOWN_SERVICE": {
      if (state.mode === "single") {
        return backToServices(state, "SERVICE_GONE", { selection: [], date: undefined });
      }
      // The engine names the first service that is not bookable any more: it leaves the selection.
      const gone = state.selection.filter((service) => service.id === response.serviceId);
      return backToServices(state, "SERVICE_GONE", {
        selection: state.selection.filter((service) => service.id !== response.serviceId),
        ...(gone.length > 0 ? { noticeServices: gone.map((service) => service.name) } : {}),
      });
    }
    case "SELECTION_CHANGED":
      // Nothing was booked: the catalogue is read again and what changed is listed (`CATALOG`).
      return backToServices(state, "SELECTION_CHANGED", { reviewed: state.quote?.services ?? state.selection });
    case "SELECTION_TOO_LONG":
      return backToServices(state, "SELECTION_TOO_LONG");
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
      if (response.field === "service_ids") return backToServices(state, "REQUEST_REFUSED");
      return {
        ...state,
        step: "slot",
        slot: undefined,
        quote: undefined,
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
    case "CHALLENGE_FAILED":
      // Refused before the engine: this send booked nothing — an earlier unknown one still may have.
      return { ...state, attempt: paused, notice: attempt.uncertain ? "UNCERTAIN" : "CHALLENGE_FAILED" };
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

/**
 * The page's services as the server just gave them. The `single` mode only
 * refreshes its service (the deployed behaviour). The `selection` mode keeps
 * the selection true to the page: each chosen service takes the server's
 * current name, length and price; one no longer offered leaves the selection
 * (back to the services, named); after SELECTION_CHANGED, what changed since
 * the review is listed; while choosing a time, a change is said and the time
 * chosen again — never a silent new price or length.
 */
function reconcile(state: FlowState, services: readonly BookableService[]): FlowState {
  if (!editable(state) || state.selection.length === 0) return state;
  const byId = new Map(services.map((service) => [service.id, service]));
  if (state.mode === "single") {
    return { ...state, selection: state.selection.map((service) => byId.get(service.id) ?? service) };
  }

  const kept = state.selection.flatMap((service) => byId.get(service.id) ?? []);
  const dropped = state.selection.filter((service) => !byId.has(service.id));
  const droppedNames = dropped.length > 0 ? { noticeServices: dropped.map((service) => service.name) } : {};

  if (state.reviewed !== undefined) {
    // SELECTION_CHANGED: the list of what changed since she reviewed it. The notice stays.
    return { ...state, selection: kept, reviewed: undefined, changes: selectionChanges(state.reviewed, kept), ...droppedNames };
  }
  if (dropped.length > 0) {
    return { ...state, ...CLEARED, step: "service", selection: kept, notice: "SERVICE_GONE", ...droppedNames };
  }
  const changes = selectionChanges(state.selection, kept);
  if (changes.length === 0) return { ...state, selection: kept };
  if (state.step === "service") {
    // The cards and the summary show the new values at once; nothing was offered yet.
    return { ...state, selection: kept, slot: undefined, quote: undefined, attempt: undefined };
  }
  return { ...state, selection: kept, slot: undefined, quote: undefined, attempt: undefined, notice: "SELECTION_UPDATED", changes };
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "CHOOSE_SERVICE":
      if (state.mode !== "single" || !editable(state)) return state;
      return {
        ...state,
        ...CLEARED,
        step: "slot",
        selection: [action.service],
        date: action.firstDate,
      };
    case "ADD_SERVICE":
      if (!editable(state) || state.step !== "service" || !canAddService(state, action.service.id)) return state;
      return { ...state, ...CLEARED, selection: [...state.selection, action.service] };
    case "REMOVE_SERVICE": {
      if (state.mode !== "selection" || !editable(state)) return state;
      if (!state.selection.some((service) => service.id === action.serviceId)) return state;
      return {
        ...state,
        ...CLEARED,
        step: "service",
        selection: state.selection.filter((service) => service.id !== action.serviceId),
      };
    }
    case "CHOOSE_TIMES":
      if (state.mode !== "selection" || !editable(state) || state.selection.length === 0) return state;
      return {
        ...state,
        step: "slot",
        date: state.date ?? action.firstDate,
        notice: undefined,
        noticeServices: undefined,
        changes: undefined,
      };
    case "CHOOSE_DATE":
      if (!editable(state) || state.selection.length === 0) return state;
      return { ...state, date: action.date, slot: undefined, quote: undefined, attempt: undefined, notice: undefined, changes: undefined };
    case "CHOOSE_SLOT":
      if (!editable(state) || state.selection.length === 0) return state;
      if (state.mode === "selection" && !quoteMatches(state, action.quote)) return state;
      return {
        ...state,
        slot: action.slot,
        quote: state.mode === "selection" ? action.quote : undefined,
        attempt: undefined,
        notice: undefined,
        changes: undefined,
      };
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
    case "SERVICE_UNAVAILABLE": {
      if (!editable(state)) return state;
      if (state.mode === "single") return backToServices(state, "SERVICE_GONE", { selection: [], date: undefined });
      const gone = state.selection.filter((service) => service.id === action.serviceId);
      return backToServices(state, "SERVICE_GONE", {
        selection: state.selection.filter((service) => service.id !== action.serviceId),
        ...(gone.length > 0 ? { noticeServices: gone.map((service) => service.name) } : {}),
      });
    }
    case "SELECTION_REFUSED":
      if (!editable(state)) return state;
      return backToServices(state, "REQUEST_REFUSED");
    case "CATALOG":
      return reconcile(state, action.services);
    case "RESTORE": {
      // Only into an untouched journey: a restored list never replaces what she is doing.
      if (state.mode !== "selection" || state.step !== "service" || state.selection.length > 0 || !editable(state)) return state;
      const byId = new Map(action.services.map((service) => [service.id, service]));
      const unique = [...new Set(action.ids)].slice(0, MAX_SELECTED_SERVICES);
      const restored = unique.flatMap((id) => byId.get(id) ?? []);
      if (restored.length === unique.length) return { ...state, selection: restored };
      return { ...state, selection: restored, notice: "SELECTION_RESTORED" };
    }
    case "CLOSED":
      if (isAttemptLocked(state) || state.step === "done") return state;
      return { ...state, notice: "CLOSED" };
    case "RESTART":
      // A new booking: the customer keeps what she typed, nothing else.
      return initialFlowState(state.mode, state.details);
  }
}
