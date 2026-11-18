import { describe, expect, it } from "vitest";

import type { AvailableSlot, BookableService } from "@/features/availability/availability";
import type { SelectionQuote } from "@/features/availability/selection";

import type { BookingResponse } from "../booking-answer";
import {
  canAddService,
  canShowStep,
  flowReducer,
  initialFlowState,
  isAttemptLocked,
  planSend,
  requestOf,
  type FlowAction,
  type FlowState,
} from "../booking-flow";
import { isSelectionRequest } from "../selection-request";

const service = (id: string, durationMinutes: number, priceCents?: number): BookableService => ({
  id,
  name: id.replace("svc-", "").replace(/^./, (first) => first.toUpperCase()),
  durationMinutes,
  ...(priceCents !== undefined ? { priceCents } : {}),
});
const coupe = service("svc-coupe", 45, 4500);
const couleur = service("svc-couleur", 90, 8900);
const soin = service("svc-soin", 30, 0);
const nine = Array.from({ length: 9 }, (_, index) => service(`svc-${index}`, 15, 1000));

const quoteOf = (services: readonly BookableService[], fingerprint = "a".repeat(64)): SelectionQuote => ({
  services,
  durationMinutes: services.reduce((total, item) => total + item.durationMinutes, 0),
  fingerprint,
});
const two: AvailableSlot = { startsAt: "2026-11-16T13:00:00Z", endsAt: "2026-11-16T15:15:00Z", localTime: "14:00" };
const three: AvailableSlot = { startsAt: "2026-11-16T14:00:00Z", endsAt: "2026-11-16T16:15:00Z", localTime: "15:00" };

const run = (state: FlowState, ...actions: FlowAction[]) => actions.reduce(flowReducer, state);
const start = () => initialFlowState("selection");
const add = (item: BookableService): FlowAction => ({ type: "ADD_SERVICE", service: item });
const details: FlowAction[] = [
  { type: "EDIT_DETAIL", field: "firstName", value: " Marie " },
  { type: "EDIT_DETAIL", field: "lastName", value: "Dupont" },
  { type: "EDIT_DETAIL", field: "email", value: "marie.dupont@example.test" },
  { type: "EDIT_DETAIL", field: "phone", value: "06 12 34 56 78" },
];

/** Couleur then Coupe, a time of that selection, details typed, at the review. */
function atReview(quote = quoteOf([couleur, coupe])): FlowState {
  return run(
    start(),
    add(couleur),
    add(coupe),
    { type: "CHOOSE_TIMES", firstDate: "2026-11-16" },
    { type: "CHOOSE_SLOT", slot: two, quote },
    { type: "GO_TO", step: "details" },
    ...details,
    { type: "REVIEW_DETAILS" },
  );
}

let keys = 0;
const newKey = () => `key-${String(++keys).padStart(4, "0")}-0123456789abcdef`;
function press(state: FlowState) {
  const plan = planSend(state, newKey);
  return { plan, state: plan ? flowReducer(state, { type: "SENDING", attempt: plan.attempt }) : state };
}
const answer = (state: FlowState, response: BookingResponse) => flowReducer(state, { type: "ANSWER", response });

describe("choosing several services", () => {
  it("adds services at the END, in her order — never sorted — one occurrence each", () => {
    const state = run(start(), add(soin), add(couleur), add(coupe), add(couleur));
    expect(state.selection.map((item) => item.id)).toEqual(["svc-soin", "svc-couleur", "svc-coupe"]);
    expect(state.step).toBe("service");
  });

  it("removes any service, keeping the order of the others", () => {
    const state = run(start(), add(soin), add(couleur), add(coupe), { type: "REMOVE_SERVICE", serviceId: "svc-couleur" });
    expect(state.selection.map((item) => item.id)).toEqual(["svc-soin", "svc-coupe"]);
  });

  it("stops at eight: a ninth service is refused", () => {
    const full = run(start(), ...nine.slice(0, 8).map(add));
    expect(full.selection).toHaveLength(8);
    expect(canAddService(full, nine[8]!.id)).toBe(false);
    expect(run(full, add(nine[8]!)).selection).toHaveLength(8);
    // One removed: one more may be added again.
    const freed = run(full, { type: "REMOVE_SERVICE", serviceId: "svc-0" });
    expect(canAddService(freed, nine[8]!.id)).toBe(true);
  });

  it("goes to the times only with at least one service, keeping a date already chosen", () => {
    expect(run(start(), { type: "CHOOSE_TIMES", firstDate: "2026-11-16" }).step).toBe("service");
    const chosen = run(start(), add(coupe), { type: "CHOOSE_TIMES", firstDate: "2026-11-16" }, { type: "CHOOSE_DATE", date: "2026-11-18" });
    const back = run(chosen, { type: "GO_TO", step: "service" }, add(soin), { type: "CHOOSE_TIMES", firstDate: "2026-11-16" });
    expect(back).toMatchObject({ step: "slot", date: "2026-11-18" });
  });

  it("is ignored in the single-service mode, which keeps its own « Choisir »", () => {
    const single = run(initialFlowState("single"), add(coupe), { type: "CHOOSE_TIMES", firstDate: "2026-11-16" });
    expect(single.selection).toEqual([]);
    const chosen = run(initialFlowState("single"), { type: "CHOOSE_SERVICE", service: coupe, firstDate: "2026-11-16" });
    expect(chosen).toMatchObject({ step: "slot", selection: [coupe] });
    expect(run(start(), { type: "CHOOSE_SERVICE", service: coupe, firstDate: "2026-11-16" }).selection).toEqual([]);
  });
});

describe("a time is offered for THIS selection only", () => {
  it("accepts a time only with the server's reading of exactly this selection, in this order", () => {
    const base = run(start(), add(couleur), add(coupe), { type: "CHOOSE_TIMES", firstDate: "2026-11-16" });
    expect(run(base, { type: "CHOOSE_SLOT", slot: two }).slot).toBeUndefined();
    expect(run(base, { type: "CHOOSE_SLOT", slot: two, quote: quoteOf([coupe, couleur]) }).slot).toBeUndefined();
    expect(run(base, { type: "CHOOSE_SLOT", slot: two, quote: quoteOf([couleur]) }).slot).toBeUndefined();
    const chosen = run(base, { type: "CHOOSE_SLOT", slot: two, quote: quoteOf([couleur, coupe]) });
    expect(chosen.slot).toEqual(two);
    expect(canShowStep(chosen, "details")).toBe(true);
  });

  it("clears the time, its fingerprint and any attempt when the selection changes — the details are kept", () => {
    const review = atReview();
    const back = run(review, { type: "GO_TO", step: "service" });
    expect(back.slot).toEqual(two);
    const changed = run(back, add(soin));
    expect(changed).toMatchObject({ slot: undefined, quote: undefined, attempt: undefined });
    expect(changed.details.firstName).toBe("Marie");
    expect(canShowStep(changed, "review")).toBe(false);
    const removed = run(back, { type: "REMOVE_SERVICE", serviceId: "svc-coupe" });
    expect(removed).toMatchObject({ slot: undefined, quote: undefined, step: "service" });
  });

  it("clears the time and fingerprint when the date changes", () => {
    const changed = run(atReview(), { type: "GO_TO", step: "slot" }, { type: "CHOOSE_DATE", date: "2026-11-17" });
    expect(changed).toMatchObject({ slot: undefined, quote: undefined });
  });
});

describe("the request — ONE booking for the whole selection", () => {
  it("sends the ids in her order, the time and the server's fingerprint — never a name, a length or a price", () => {
    const request = requestOf(atReview(quoteOf([couleur, coupe], "b".repeat(64))));
    expect(request).toEqual({
      serviceIds: ["svc-couleur", "svc-coupe"],
      startsAt: two.startsAt,
      fingerprint: "b".repeat(64),
      firstName: "Marie",
      lastName: "Dupont",
      email: "marie.dupont@example.test",
      phone: "06 12 34 56 78",
    });
    expect(isSelectionRequest(request!)).toBe(true);
  });

  it("one key per attempt; a second press while sending sends nothing", () => {
    const { plan, state } = press(atReview());
    expect(plan?.attempt.sending).toBe(true);
    expect(planSend(state, newKey)).toBeUndefined();
    expect(run(state, { type: "SENDING", attempt: plan!.attempt }).attempt).toBe(state.attempt);
  });

  it("an unknown outcome (a timeout, a 502) freezes the request: the retry sends the SAME key and the SAME selection", () => {
    const { plan, state } = press(atReview());
    const unknown = answer(state, { status: "ERROR" });
    expect(unknown.notice).toBe("UNCERTAIN");
    expect(isAttemptLocked(unknown)).toBe(true);
    // Nothing can be changed meanwhile.
    expect(run(unknown, { type: "GO_TO", step: "service" }).step).toBe("review");
    expect(run(unknown, { type: "REMOVE_SERVICE", serviceId: "svc-coupe" }).selection).toHaveLength(2);
    expect(run(unknown, { type: "CATALOG", services: [coupe] }).selection).toHaveLength(2);
    const retry = press(unknown);
    expect(retry.plan?.attempt.key).toBe(plan!.attempt.key);
    expect(retry.plan?.attempt.request).toEqual(plan!.attempt.request);
  });

  it("BUSY (the lock, or every attempt rolled back by 40001) keeps the same key for the customer's retry", () => {
    const { plan, state } = press(atReview());
    const busy = answer(state, { status: "BUSY" });
    expect(busy.notice).toBe("BUSY");
    expect(press(busy).plan?.attempt.key).toBe(plan!.attempt.key);
  });

  it("a material change after a definitive answer starts a NEW attempt with a new key", () => {
    const { plan, state } = press(atReview());
    const reused = answer(state, { status: "IDEMPOTENCY_KEY_REUSED" });
    const edited = run(reused, { type: "GO_TO", step: "details" }, { type: "EDIT_DETAIL", field: "phone", value: "06 99 99 99 99" }, { type: "REVIEW_DETAILS" });
    expect(press(edited).plan?.attempt.key).not.toBe(plan!.attempt.key);
  });

  it("BOOKED: one appointment, every service", () => {
    const { state } = press(atReview());
    const done = answer(state, {
      status: "BOOKED",
      booking: {
        kind: "selection",
        reference: "4b0a1d0e-3c1f-4f7a-9d39-2a8f4f1c6e21",
        services: [couleur, coupe],
        durationMinutes: 135,
        startsAt: two.startsAt,
        endsAt: two.endsAt,
        localDate: "2026-11-16",
        localTime: "14:00",
        timeZone: "Europe/Paris",
      },
    });
    expect(done.step).toBe("done");
    expect(done.confirmation?.services).toHaveLength(2);
    // A new booking keeps what she typed, nothing else.
    const again = run(done, { type: "RESTART" });
    expect(again).toMatchObject({ mode: "selection", step: "service", selection: [] });
    expect(again.details.firstName).toBe("Marie");
  });
});

describe("SELECTION_CHANGED — nothing booked with values she has not seen", () => {
  it("goes back to the services, read again, clears the time and fingerprint, keeps her details", () => {
    const { state } = press(atReview());
    const changed = answer(state, { status: "SELECTION_CHANGED" });
    expect(changed).toMatchObject({ step: "service", notice: "SELECTION_CHANGED", slot: undefined, quote: undefined, attempt: undefined });
    expect(changed.servicesRevision).toBe(state.servicesRevision + 1);
    expect(changed.details.firstName).toBe("Marie");
    expect(canShowStep(changed, "review")).toBe(false);
  });

  it("then lists what changed against what she reviewed, takes the new values, and keeps her order", () => {
    const { state } = press(atReview());
    const changed = answer(state, { status: "SELECTION_CHANGED" });
    const read = run(changed, { type: "CATALOG", services: [soin, { ...coupe, priceCents: 5000 }, { ...couleur, durationMinutes: 105 }] });
    expect(read.notice).toBe("SELECTION_CHANGED");
    expect(read.selection.map((item) => item.id)).toEqual(["svc-couleur", "svc-coupe"]);
    expect(read.selection[1]?.priceCents).toBe(5000);
    expect(read.changes).toEqual([
      { id: "svc-couleur", name: "Couleur", duration: { from: 90, to: 105 } },
      { id: "svc-coupe", name: "Coupe", price: { from: 4500, to: 5000 } },
    ]);
  });

  it("a service no longer offered leaves the selection and is named", () => {
    const { state } = press(atReview());
    const read = run(answer(state, { status: "SELECTION_CHANGED" }), { type: "CATALOG", services: [coupe] });
    expect(read.selection.map((item) => item.id)).toEqual(["svc-coupe"]);
    expect(read.noticeServices).toEqual(["Couleur"]);
  });

  it("a time is chosen again before anything can be sent: the new fingerprint", () => {
    const { state } = press(atReview());
    const read = run(answer(state, { status: "SELECTION_CHANGED" }), { type: "CATALOG", services: [coupe, { ...couleur, priceCents: 9500 }] });
    expect(planSend(run(read, { type: "GO_TO", step: "review" }), newKey)).toBeUndefined();
    const fresh = quoteOf(read.selection, "c".repeat(64));
    const reviewed = run(read, { type: "CHOOSE_TIMES", firstDate: "2026-11-16" }, { type: "CHOOSE_SLOT", slot: three, quote: fresh }, { type: "GO_TO", step: "details" }, { type: "REVIEW_DETAILS" });
    const request = requestOf(reviewed);
    expect(request && isSelectionRequest(request) ? request.fingerprint : undefined).toBe("c".repeat(64));
  });
});

describe("other refusals of a selection", () => {
  it("UNKNOWN_SERVICE removes the service the engine names, and names it", () => {
    const { state } = press(atReview());
    const gone = answer(state, { status: "UNKNOWN_SERVICE", serviceId: "svc-couleur" });
    expect(gone).toMatchObject({ step: "service", notice: "SERVICE_GONE", noticeServices: ["Couleur"], slot: undefined });
    expect(gone.selection.map((item) => item.id)).toEqual(["svc-coupe"]);
  });

  it("SELECTION_TOO_LONG and a refused selection go back to the services", () => {
    expect(answer(press(atReview()).state, { status: "SELECTION_TOO_LONG" })).toMatchObject({ step: "service", notice: "SELECTION_TOO_LONG" });
    expect(answer(press(atReview()).state, { status: "INVALID_REQUEST", field: "service_ids" })).toMatchObject({ step: "service", notice: "REQUEST_REFUSED" });
    expect(answer(press(atReview()).state, { status: "INVALID_REQUEST", field: "selection_fingerprint" })).toMatchObject({
      step: "slot",
      notice: "REQUEST_REFUSED",
      quote: undefined,
    });
  });

  it("SLOT_UNAVAILABLE goes back to the times of the same selection, read again", () => {
    const { state } = press(atReview());
    const taken = answer(state, { status: "SLOT_UNAVAILABLE" });
    expect(taken).toMatchObject({ step: "slot", notice: "SLOT_TAKEN", slot: undefined, quote: undefined });
    expect(taken.selection).toHaveLength(2);
    expect(taken.slotsRevision).toBe(state.slotsRevision + 1);
  });
});

describe("the page's services read again while choosing", () => {
  it("a change seen while choosing a time is said, and the time is chosen again", () => {
    const atTimes = run(start(), add(couleur), add(coupe), { type: "CHOOSE_TIMES", firstDate: "2026-11-16" }, { type: "CHOOSE_SLOT", slot: two, quote: quoteOf([couleur, coupe]) });
    const read = run(atTimes, { type: "CATALOG", services: [couleur, { ...coupe, priceCents: 5000 }] });
    expect(read).toMatchObject({ notice: "SELECTION_UPDATED", slot: undefined, quote: undefined });
    expect(read.changes).toHaveLength(1);
  });

  it("unchanged values change nothing; a withdrawn service leaves, named", () => {
    const atTimes = run(start(), add(couleur), add(coupe), { type: "CHOOSE_TIMES", firstDate: "2026-11-16" }, { type: "CHOOSE_SLOT", slot: two, quote: quoteOf([couleur, coupe]) });
    expect(run(atTimes, { type: "CATALOG", services: [coupe, couleur] }).slot).toEqual(two);
    const withdrawn = run(atTimes, { type: "CATALOG", services: [coupe] });
    expect(withdrawn).toMatchObject({ step: "service", notice: "SERVICE_GONE", noticeServices: ["Couleur"], slot: undefined });
  });
});

describe("a selection restored after a reload", () => {
  it("is checked against the page's current services: what is not offered any more is left out, and said", () => {
    const restored = run(start(), { type: "RESTORE", ids: ["svc-couleur", "svc-gone", "svc-coupe"], services: [coupe, couleur] });
    expect(restored.selection.map((item) => item.id)).toEqual(["svc-couleur", "svc-coupe"]);
    expect(restored.notice).toBe("SELECTION_RESTORED");
    const intact = run(start(), { type: "RESTORE", ids: ["svc-coupe"], services: [coupe, couleur] });
    expect(intact.selection).toEqual([coupe]);
    expect(intact.notice).toBeUndefined();
  });

  it("never replaces a journey already started, nor fills the single-service mode", () => {
    const started = run(start(), add(soin), { type: "RESTORE", ids: ["svc-coupe"], services: [coupe, soin] });
    expect(started.selection).toEqual([soin]);
    expect(run(initialFlowState("single"), { type: "RESTORE", ids: ["svc-coupe"], services: [coupe] }).selection).toEqual([]);
    const capped = run(start(), { type: "RESTORE", ids: [...nine.map((item) => item.id), "svc-0"], services: nine });
    expect(capped.selection).toHaveLength(8);
  });
});
