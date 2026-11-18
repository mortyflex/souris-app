import { describe, expect, it } from "vitest";

import type { AvailableSlot, BookableService } from "@/features/availability/availability";

import type { BookingResponse } from "../booking-answer";
import {
  canShowStep,
  flowReducer,
  initialFlowState,
  isAttemptLocked,
  planSend,
  type FlowAction,
  type FlowState,
} from "../booking-flow";

const coupe: BookableService = { id: "svc-coupe", name: "Coupe", durationMinutes: 45 };
const two: AvailableSlot = { startsAt: "2026-11-16T13:00:00Z", endsAt: "2026-11-16T13:45:00Z", localTime: "14:00" };
const three: AvailableSlot = { startsAt: "2026-11-16T14:00:00Z", endsAt: "2026-11-16T14:45:00Z", localTime: "15:00" };
const booked: BookingResponse = {
  status: "BOOKED",
  booking: {
    kind: "single",
    reference: "4b0a1d0e-3c1f-4f7a-9d39-2a8f4f1c6e21",
    services: [coupe],
    durationMinutes: 45,
    startsAt: two.startsAt,
    endsAt: two.endsAt,
    localDate: "2026-11-16",
    localTime: "14:00",
    timeZone: "Europe/Paris",
  },
};

const run = (state: FlowState, ...actions: FlowAction[]) => actions.reduce(flowReducer, state);

/** A customer at the review step, details typed with stray spaces. */
function atReview(): FlowState {
  return run(
    initialFlowState(),
    { type: "CHOOSE_SERVICE", service: coupe, firstDate: "2026-11-16" },
    { type: "CHOOSE_SLOT", slot: two },
    { type: "GO_TO", step: "details" },
    { type: "EDIT_DETAIL", field: "firstName", value: " Marie " },
    { type: "EDIT_DETAIL", field: "lastName", value: "Dupont" },
    { type: "EDIT_DETAIL", field: "email", value: "marie.dupont@example.test" },
    { type: "EDIT_DETAIL", field: "phone", value: "06 12 34 56 78" },
    { type: "REVIEW_DETAILS" },
  );
}

let keys = 0;
const newKey = () => `key-${String(++keys).padStart(4, "0")}-0123456789abcdef`;

/** Press « Confirmer »: what would be sent, and the state while it is in flight. */
function press(state: FlowState) {
  const plan = planSend(state, newKey);
  return { plan, state: plan ? flowReducer(state, { type: "SENDING", attempt: plan.attempt }) : state };
}
const answer = (state: FlowState, response: BookingResponse) => flowReducer(state, { type: "ANSWER", response });

describe("the journey", () => {
  it("walks service → date and time → details → review → confirmation", () => {
    let state = initialFlowState();
    expect(state.step).toBe("service");
    state = flowReducer(state, { type: "CHOOSE_SERVICE", service: coupe, firstDate: "2026-11-16" });
    expect(state).toMatchObject({ step: "slot", date: "2026-11-16" });
    expect(canShowStep(state, "details")).toBe(false);
    state = run(state, { type: "CHOOSE_SLOT", slot: two }, { type: "GO_TO", step: "details" });
    expect(state.step).toBe("details");

    // Nothing typed: the review is refused, each field says why.
    state = flowReducer(state, { type: "REVIEW_DETAILS" });
    expect(state.step).toBe("details");
    expect(state.issues).toEqual({ firstName: "required", lastName: "required", email: "required", phone: "required" });

    const review = atReview();
    expect(review.step).toBe("review");
    expect(review.details.firstName).toBe("Marie");

    const { plan, state: sending } = press(review);
    expect(plan?.attempt.request).toEqual({
      serviceId: "svc-coupe",
      startsAt: "2026-11-16T13:00:00Z",
      firstName: "Marie",
      lastName: "Dupont",
      email: "marie.dupont@example.test",
      phone: "06 12 34 56 78",
    });
    const done = answer(sending, booked);
    expect(done).toMatchObject({ step: "done", confirmation: booked.status === "BOOKED" ? booked.booking : undefined });
    expect(done.attempt).toBeUndefined();
  });

  it("never selects a time it was not given, and a new date clears the time", () => {
    const state = run(
      initialFlowState(),
      { type: "CHOOSE_SERVICE", service: coupe, firstDate: "2026-11-16" },
      { type: "CHOOSE_SLOT", slot: two },
      { type: "CHOOSE_DATE", date: "2026-11-17" },
    );
    expect(state.slot).toBeUndefined();
    expect(canShowStep(state, "details")).toBe(false);
  });
});

describe("idempotency: one key per attempt", () => {
  it("sends nothing more while a request is in flight (double submission)", () => {
    const { plan, state } = press(atReview());
    expect(plan).toBeDefined();
    expect(planSend(state, newKey)).toBeUndefined();
    // A second SENDING cannot replace the attempt in flight.
    expect(flowReducer(state, { type: "SENDING", attempt: { ...plan!.attempt, key: "other-key-0123456789" } }).attempt).toEqual(plan!.attempt);
  });

  it("retries an UNKNOWN outcome with the SAME key and the SAME request, and freezes everything meanwhile", () => {
    const first = press(atReview());
    const uncertain = answer(first.state, { status: "ERROR" });
    expect(uncertain.notice).toBe("UNCERTAIN");
    expect(isAttemptLocked(uncertain)).toBe(true);

    // Nothing can change what is being booked…
    const tampered = run(
      uncertain,
      { type: "EDIT_DETAIL", field: "phone", value: "07 00 00 00 00" },
      { type: "GO_TO", step: "slot" },
      { type: "CHOOSE_SLOT", slot: three },
      { type: "CHOOSE_SERVICE", service: { ...coupe, id: "svc-other" }, firstDate: "2026-11-16" },
    );
    expect(tampered).toEqual(uncertain);

    // …and the retry is byte for byte the first request.
    const second = press(tampered);
    expect(second.plan?.attempt.key).toBe(first.plan?.attempt.key);
    expect(second.plan?.attempt.request).toEqual(first.plan?.attempt.request);

    // Still unknown: the same again.
    const third = press(answer(second.state, { status: "ERROR" }));
    expect(third.plan?.attempt.key).toBe(first.plan?.attempt.key);

    // The engine replays the booking the first send made.
    expect(answer(third.state, booked).step).toBe("done");
  });

  it("BUSY offers a retry with the same key — and a change starts a new attempt", () => {
    const first = press(atReview());
    const busy = answer(first.state, { status: "BUSY" });
    expect(busy.notice).toBe("BUSY");
    expect(isAttemptLocked(busy)).toBe(false);
    expect(press(busy).plan?.attempt.key).toBe(first.plan?.attempt.key);

    // BUSY wrote nothing: changing the request is allowed and draws a new key.
    const edited = run(busy, { type: "GO_TO", step: "details" }, { type: "EDIT_DETAIL", field: "phone", value: "07 11 22 33 44" }, { type: "REVIEW_DETAILS" });
    const next = press(edited);
    expect(next.plan?.attempt.key).not.toBe(first.plan?.attempt.key);
    expect(next.plan?.attempt.request.phone).toBe("07 11 22 33 44");
  });

  it("a rate limit keeps the same request ready for a later retry", () => {
    const first = press(atReview());
    const limited = answer(first.state, { status: "RATE_LIMITED" });
    expect(limited.notice).toBe("RATE_LIMITED");
    expect(press(limited).plan?.attempt.key).toBe(first.plan?.attempt.key);
  });

  it("a refused security token keeps the same request and key: confirming again sends them unchanged", () => {
    const first = press(atReview());
    const refused = answer(first.state, { status: "CHALLENGE_FAILED" });
    expect(refused).toMatchObject({ step: "review", notice: "CHALLENGE_FAILED" });
    expect(isAttemptLocked(refused)).toBe(false);
    const again = press(refused);
    expect(again.plan?.attempt.key).toBe(first.plan?.attempt.key);
    expect(again.plan?.attempt.request).toEqual(first.plan?.attempt.request);
  });

  it("a refused security token never hides an earlier unknown outcome: the request stays frozen", () => {
    const first = press(atReview());
    const uncertain = answer(first.state, { status: "ERROR" });
    const refused = answer(press(uncertain).state, { status: "CHALLENGE_FAILED" });
    expect(refused.notice).toBe("UNCERTAIN");
    expect(refused.attempt?.uncertain).toBe(true);
    expect(isAttemptLocked(refused)).toBe(true);
    // Nothing can be edited; the retry is the same request under the same key.
    expect(run(refused, { type: "EDIT_DETAIL", field: "phone", value: "07 00 00 00 00" })).toBe(refused);
    expect(press(refused).plan?.attempt.key).toBe(first.plan?.attempt.key);
  });

  it("IDEMPOTENCY_KEY_REUSED is recoverable: nothing is retried until the customer confirms again, under a new key", () => {
    const first = press(atReview());
    const reused = answer(first.state, { status: "IDEMPOTENCY_KEY_REUSED" });
    expect(reused).toMatchObject({ step: "review", notice: "KEY_REUSED" });
    expect(reused.attempt).toBeUndefined();
    const again = press(reused);
    expect(again.plan?.attempt.key).not.toBe(first.plan?.attempt.key);
  });
});

describe("definitive answers", () => {
  it("SLOT_UNAVAILABLE goes back to the times, reads them again and keeps every detail", () => {
    const review = atReview();
    const taken = answer(press(review).state, { status: "SLOT_UNAVAILABLE" });
    expect(taken).toMatchObject({ step: "slot", notice: "SLOT_TAKEN", slotsRevision: review.slotsRevision + 1 });
    expect(taken.slot).toBeUndefined();
    expect(taken.details).toEqual(review.details);
    expect(taken.selection).toEqual([coupe]);

    // A new time, straight back to the review — and a new attempt under a new key.
    const back = run(taken, { type: "CHOOSE_SLOT", slot: three }, { type: "GO_TO", step: "details" }, { type: "REVIEW_DETAILS" });
    expect(back.step).toBe("review");
    expect(back.notice).toBeUndefined();
    expect(press(back).plan?.attempt.request.startsAt).toBe(three.startsAt);
  });

  it("UNKNOWN_SERVICE goes back to the services, which are read again", () => {
    const review = atReview();
    const gone = answer(press(review).state, { status: "UNKNOWN_SERVICE" });
    expect(gone).toMatchObject({ step: "service", notice: "SERVICE_GONE", servicesRevision: review.servicesRevision + 1 });
    expect(gone.selection).toEqual([]);
    expect(gone.details).toEqual(review.details);
  });

  it("INVALID_REQUEST on a customer field shows that field; on anything else, the times again", () => {
    const onEmail = answer(press(atReview()).state, { status: "INVALID_REQUEST", field: "email" });
    expect(onEmail).toMatchObject({ step: "details", refusedField: "email", issues: { email: "invalid" } });
    const onStart = answer(press(atReview()).state, { status: "INVALID_REQUEST", field: "starts_at" });
    expect(onStart).toMatchObject({ step: "slot", notice: "REQUEST_REFUSED" });
  });

  it("UNAVAILABLE says booking is closed — and that it cannot confirm, after an unknown outcome", () => {
    expect(answer(press(atReview()).state, { status: "UNAVAILABLE" }).notice).toBe("CLOSED");
    const uncertain = answer(press(atReview()).state, { status: "ERROR" });
    expect(answer(press(uncertain).state, { status: "UNAVAILABLE" }).notice).toBe("CLOSED_UNCERTAIN");
  });

  it("a refusal at the door never hides an earlier unknown outcome", () => {
    expect(answer(press(atReview()).state, { status: "REJECTED" }).notice).toBe("CLOSED");
    const uncertain = answer(press(atReview()).state, { status: "ERROR" });
    const rejected = answer(press(uncertain).state, { status: "REJECTED" });
    expect(rejected.notice).toBe("UNCERTAIN");
    expect(rejected.attempt?.uncertain).toBe(true);
  });

  it("an answer without a request in flight is ignored", () => {
    const review = atReview();
    expect(answer(review, booked)).toBe(review);
  });

  it("the confirmation is final; a new booking keeps only what the customer typed", () => {
    const done = answer(press(atReview()).state, booked);
    expect(run(done, { type: "GO_TO", step: "review" }, { type: "CHOOSE_SLOT", slot: three })).toEqual(done);
    const again = flowReducer(done, { type: "RESTART" });
    expect(again).toMatchObject({ step: "service", details: done.details });
    expect(again.confirmation).toBeUndefined();
    expect(again.slot).toBeUndefined();
  });
});

describe("services with their public metadata (20261021120000) — still ONE service per booking", () => {
  const soin: BookableService = {
    id: "svc-soin",
    name: "Soin du visage",
    durationMinutes: 75,
    description: "Nettoyage, gommage puis masque.",
    priceCents: 8900,
    category: { id: "cat-visage", name: "Soins du visage", position: 0 },
  };

  it("chooses one service, then another replaces it — never two", () => {
    const first = run(initialFlowState(), { type: "CHOOSE_SERVICE", service: soin, firstDate: "2026-11-16" });
    expect(first.step).toBe("slot");
    expect(first.selection).toEqual([soin]);
    const back = run(first, { type: "GO_TO", step: "service" }, { type: "CHOOSE_SERVICE", service: coupe, firstDate: "2026-11-16" });
    expect(back.selection).toEqual([coupe]);
    expect(back.slot).toBeUndefined();
  });

  it("sends the same request as before: the service id only — never its price, description or category", () => {
    const state = run(
      initialFlowState(),
      { type: "CHOOSE_SERVICE", service: soin, firstDate: "2026-11-16" },
      { type: "CHOOSE_SLOT", slot: two },
      { type: "GO_TO", step: "details" },
      { type: "EDIT_DETAIL", field: "firstName", value: "Marie" },
      { type: "EDIT_DETAIL", field: "lastName", value: "Dupont" },
      { type: "EDIT_DETAIL", field: "email", value: "marie@example.test" },
      { type: "EDIT_DETAIL", field: "phone", value: "06 12 34 56 78" },
      { type: "REVIEW_DETAILS" },
    );
    const plan = planSend(state, () => "key-0000000000000001");
    expect(plan?.attempt.request).toEqual({
      serviceId: "svc-soin",
      startsAt: two.startsAt,
      firstName: "Marie",
      lastName: "Dupont",
      email: "marie@example.test",
      phone: "06 12 34 56 78",
    });
    expect(JSON.stringify(plan)).not.toMatch(/8900|priceCents|description|category/);
  });
});
