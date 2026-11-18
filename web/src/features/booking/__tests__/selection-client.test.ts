import { describe, expect, it, vi } from "vitest";

import {
  createSelectionAvailabilityReader,
  selectionAvailabilityUrl,
  selectionBookingEndpoint,
  submitSelectionBooking,
} from "../booking-client";
import type { SelectionBookingRequest } from "../selection-request";

const KEY = "0123456789abcdef0123456789abcdef";
const request: SelectionBookingRequest = {
  serviceIds: ["tech-couleur", "svc-coupe"],
  startsAt: "2026-11-16T13:00:00Z",
  fingerprint: "d".repeat(64),
  firstName: "Marie",
  lastName: "Dupont",
  email: "marie.dupont@example.test",
  phone: "06 12 34 56 78",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("submitSelectionBooking — ONE request for the whole selection", () => {
  it("posts the ids in her order, the time, the fingerprint and the key to the website's selection endpoint; the token in its header", async () => {
    const fetchImpl = vi.fn(async () => json({ status: "SELECTION_CHANGED" }));
    const answer = await submitSelectionBooking("chez-amelie", request, KEY, "token-1", { fetchImpl });
    expect(answer).toEqual({ status: "SELECTION_CHANGED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/booking/chez-amelie/selection");
    expect(url).toBe(selectionBookingEndpoint("chez-amelie"));
    expect((init.headers as Record<string, string>)["X-Turnstile-Token"]).toBe("token-1");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      service_ids: ["tech-couleur", "svc-coupe"],
      starts_at: "2026-11-16T13:00:00Z",
      selection_fingerprint: "d".repeat(64),
      first_name: "Marie",
      last_name: "Dupont",
      email: "marie.dupont@example.test",
      phone: "06 12 34 56 78",
      idempotency_key: KEY,
    });
    expect(JSON.stringify(body)).not.toContain("token-1");
  });

  it("an unknown outcome is ERROR; a refusal at the door without an answer is REJECTED", async () => {
    expect(await submitSelectionBooking("chez-amelie", request, KEY, "t", { fetchImpl: vi.fn(async () => Promise.reject(new TypeError("offline"))) })).toEqual({
      status: "ERROR",
    });
    expect(await submitSelectionBooking("chez-amelie", request, KEY, "t", { fetchImpl: vi.fn(async () => new Response("<html>", { status: 502 })) })).toEqual({
      status: "ERROR",
    });
    expect(await submitSelectionBooking("chez-amelie", request, KEY, "t", { fetchImpl: vi.fn(async () => new Response("", { status: 413 })) })).toEqual({
      status: "REJECTED",
    });
    expect(await submitSelectionBooking("chez-amelie", request, KEY, "t", { fetchImpl: vi.fn(async () => json({ status: "RATE_LIMITED" }, 429)) })).toEqual({
      status: "RATE_LIMITED",
    });
    expect(await submitSelectionBooking("chez-amelie", request, KEY, "t", { fetchImpl: vi.fn(async () => json({ status: "CHALLENGE_FAILED" }, 403)) })).toEqual({
      status: "CHALLENGE_FAILED",
    });
  });
});

describe("the selection availability — the order is part of the question", () => {
  it("sends each id as a repeated `service` parameter in her order", () => {
    expect(selectionAvailabilityUrl("chez-amelie", { serviceIds: ["b", "a"], date: "2026-11-16" })).toBe(
      "/api/booking/chez-amelie/selection/availability?service=b&service=a&date=2026-11-16",
    );
  });

  it("reads the answer with the shared parser, and reports an older read as STALE", async () => {
    let release: (value: Response) => void = () => undefined;
    const slow = new Promise<Response>((resolve) => (release = resolve));
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => slow)
      .mockImplementationOnce(async () => json({ status: "UNAVAILABLE" }));
    const reader = createSelectionAvailabilityReader("chez-amelie", fetchImpl as unknown as typeof fetch);
    const first = reader.read({ serviceIds: ["svc-coupe"], date: "2026-11-16" });
    const second = await reader.read({ serviceIds: ["svc-coupe", "tech-couleur"], date: "2026-11-16" });
    release(json({ status: "OK", availability: {} }));
    expect(second).toEqual({ status: "UNAVAILABLE" });
    expect(await first).toEqual({ status: "STALE" });
  });

  it("an answer it does not understand is an ERROR, never an empty day", async () => {
    const reader = createSelectionAvailabilityReader("chez-amelie", vi.fn(async () => json({ status: "OK", availability: { status: "SLOTS" } })) as unknown as typeof fetch);
    expect(await reader.read({ serviceIds: ["svc-coupe"], date: "2026-11-16" })).toEqual({ status: "ERROR" });
  });
});
