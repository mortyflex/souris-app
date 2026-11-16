import { describe, expect, it, vi } from "vitest";

import { createAvailabilityReader, newIdempotencyKey, submitBooking } from "../booking-client";
import { flowReducer, initialFlowState, planSend, type FlowState } from "../booking-flow";
import { isIdempotencyKey, type BookingRequest } from "../booking-request";

const request: BookingRequest = {
  serviceId: "svc-coupe",
  startsAt: "2026-11-16T13:00:00Z",
  firstName: "Marie",
  lastName: "Dupont",
  email: "marie@example.test",
  phone: "06 12 34 56 78",
};
const KEY = "0123456789abcdef0123456789abcdef";
const bookedWire = {
  status: "BOOKED",
  booking: {
    reference: "4b0a1d0e-3c1f-4f7a-9d39-2a8f4f1c6e21",
    service: { id: "svc-coupe", name: "Coupe", duration_minutes: 45 },
    starts_at: "2026-11-16T13:00:00Z",
    ends_at: "2026-11-16T13:45:00Z",
    local_date: "2026-11-16",
    local_time: "14:00",
    time_zone: "Europe/Paris",
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const html = (status: number) => new Response("<html>oops</html>", { status, headers: { "Content-Type": "text/html" } });
type Fetch = typeof fetch;

describe("newIdempotencyKey", () => {
  it("draws a key the engine accepts, different every time", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(200);
    for (const key of keys) expect(isIdempotencyKey(key)).toBe(true);
  });
});

describe("submitBooking", () => {
  it("posts exactly the request and its key to the website's own endpoint", async () => {
    const fetchImpl = vi.fn(async () => json(bookedWire));
    const response = await submitBooking("chez-amelie", request, KEY, { fetchImpl: fetchImpl as unknown as Fetch });

    expect(response).toMatchObject({ status: "BOOKED", booking: { localTime: "14:00", timeZone: "Europe/Paris" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/booking/chez-amelie");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      service_id: "svc-coupe",
      starts_at: "2026-11-16T13:00:00Z",
      first_name: "Marie",
      last_name: "Dupont",
      email: "marie@example.test",
      phone: "06 12 34 56 78",
      idempotency_key: KEY,
    });
  });

  it.each<[string, () => Promise<Response>, string]>([
    ["a network failure", async () => Promise.reject(new TypeError("Failed to fetch")), "ERROR"],
    ["the website's ERROR", async () => json({ status: "ERROR" }, 502), "ERROR"],
    ["a gateway error page", async () => html(504), "ERROR"],
    ["an unreadable success", async () => html(200), "ERROR"],
    ["a booking it does not understand", async () => json({ status: "BOOKED", booking: {} }), "ERROR"],
    ["a 404 page (no booking flow)", async () => html(404), "REJECTED"],
    ["a request timeout page", async () => html(408), "ERROR"],
    ["a rate limit", async () => json({ status: "RATE_LIMITED" }, 429), "RATE_LIMITED"],
    ["the creation switch off", async () => json({ status: "UNAVAILABLE" }), "UNAVAILABLE"],
  ])("reads %s as %s — never as a success", async (_label, respond, status) => {
    const response = await submitBooking("chez-amelie", request, KEY, { fetchImpl: vi.fn(respond) as unknown as Fetch });
    expect(response.status).toBe(status);
  });

  it("gives up after its timeout with an UNKNOWN outcome", async () => {
    const never = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    const response = await submitBooking("chez-amelie", request, KEY, { fetchImpl: never as unknown as Fetch, timeoutMs: 20 });
    expect(response).toEqual({ status: "ERROR" });
  });
});

describe("repeated submission and retry after an uncertain response", () => {
  it("re-sends the identical body under the identical key until a definitive answer, never more than one at a time", async () => {
    const bodies: string[] = [];
    let call = 0;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(init.body as string);
      call += 1;
      if (call === 1) throw new TypeError("Failed to fetch"); // the booking may or may not exist
      if (call === 2) return html(504); // still unknown
      return json(bookedWire); // the engine replays the booking
    }) as unknown as Fetch;

    // A customer at the review step.
    let state: FlowState = [
      { type: "CHOOSE_SERVICE", service: { id: "svc-coupe", name: "Coupe", durationMinutes: 45 }, firstDate: "2026-11-16" },
      { type: "CHOOSE_SLOT", slot: { startsAt: request.startsAt, endsAt: "2026-11-16T13:45:00Z", localTime: "14:00" } },
      { type: "GO_TO", step: "details" },
      { type: "EDIT_DETAIL", field: "firstName", value: request.firstName },
      { type: "EDIT_DETAIL", field: "lastName", value: request.lastName },
      { type: "EDIT_DETAIL", field: "email", value: request.email },
      { type: "EDIT_DETAIL", field: "phone", value: request.phone },
      { type: "REVIEW_DETAILS" },
    ].reduce((current, action) => flowReducer(current, action as Parameters<typeof flowReducer>[1]), initialFlowState());

    const drawn: string[] = [];
    const newKey = () => {
      const key = newIdempotencyKey();
      drawn.push(key);
      return key;
    };

    for (let press = 0; press < 3; press += 1) {
      const plan = planSend(state, newKey);
      expect(plan).toBeDefined();
      state = flowReducer(state, { type: "SENDING", attempt: plan!.attempt });
      // A double press while in flight sends nothing.
      expect(planSend(state, newKey)).toBeUndefined();
      const response = await submitBooking("chez-amelie", plan!.attempt.request, plan!.attempt.key, { fetchImpl });
      state = flowReducer(state, { type: "ANSWER", response });
      if (state.step === "done") break;
      expect(state.notice).toBe("UNCERTAIN");
    }

    expect(state.step).toBe("done");
    expect(drawn).toHaveLength(1);
    expect(bodies).toHaveLength(3);
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]).idempotency_key).toBe(drawn[0]);
  });
});

describe("createAvailabilityReader — never a stale day", () => {
  const day = (date: string, localTime: string) =>
    json({
      status: "OK",
      availability: {
        time_zone: "Europe/Paris",
        slot_minutes: 15,
        first_date: "2026-11-16",
        last_date: "2026-12-15",
        services: [{ id: "svc-coupe", name: "Coupe", duration_minutes: 45 }],
        status: "SLOTS",
        service: { id: "svc-coupe", name: "Coupe", duration_minutes: 45 },
        date,
        slots: [{ starts_at: `${date}T13:00:00Z`, ends_at: `${date}T13:45:00Z`, local_time: localTime }],
      },
    });

  it("reports an answer that arrives after a newer read as STALE, and aborts the older read", async () => {
    let releaseSlow: (response: Response) => void = () => undefined;
    const signals: AbortSignal[] = [];
    const fetchImpl = vi.fn((url: string, init: RequestInit) => {
      signals.push(init.signal!);
      if (url.includes("2026-11-16")) return new Promise<Response>((resolve) => (releaseSlow = resolve));
      return Promise.resolve(day("2026-11-17", "15:00"));
    }) as unknown as Fetch;
    const reader = createAvailabilityReader("chez-amelie", fetchImpl);

    const slow = reader.read({ serviceId: "svc-coupe", date: "2026-11-16" });
    const fast = reader.read({ serviceId: "svc-coupe", date: "2026-11-17" });
    expect(signals[0].aborted).toBe(true);

    const latest = await fast;
    expect(latest).toMatchObject({ status: "OK", availability: { date: "2026-11-17" } });
    releaseSlow(day("2026-11-16", "14:00"));
    expect(await slow).toEqual({ status: "STALE" });
  });

  it("asks without any cache, through the website's endpoint", async () => {
    const fetchImpl = vi.fn(async () => day("2026-11-16", "14:00")) as unknown as Fetch;
    await createAvailabilityReader("chez-amelie", fetchImpl).read({ serviceId: "svc-coupe", date: "2026-11-16" });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/booking/chez-amelie/availability?service=svc-coupe&date=2026-11-16");
    expect(init.cache).toBe("no-store");
  });

  it("reads anything it does not understand as ERROR, never as an empty day", async () => {
    const reader = createAvailabilityReader("chez-amelie", vi.fn(async () => json({ status: "OK", availability: { slots: [] } })) as unknown as Fetch);
    expect(await reader.read({ serviceId: "svc-coupe", date: "2026-11-16" })).toEqual({ status: "ERROR" });
  });
});
