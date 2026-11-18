import "server-only";

import type { BookableService } from "@/features/availability/availability";
import { getAvailability } from "@/features/availability/get-availability";
import { getSelectionAvailability } from "@/features/availability/get-selection-availability";

import type { BookingMode } from "./booking-flow";

export interface BookingCatalog {
  /**
   * `selection`: the database has the multi-service contract (20261022120000)
   * — 1 to 8 services in ONE appointment, through the selection endpoints, the
   * ONE booking path then, even for one service. `single`: it does not (yet) —
   * the deployed single-service flow, unchanged.
   */
  readonly mode: BookingMode;
  readonly services: readonly BookableService[];
  readonly firstDate: string;
  readonly lastDate: string;
  readonly timeZone: string;
}

/**
 * The bookable services and window of a page, and which booking it supports
 * — read on the server before the flow renders. `null` when the page does not
 * accept bookings. Throws when the read fails.
 *
 * The capability is the server's own answer: the multi-service read is asked
 * first, and ONLY PostgREST's explicit "no such function" (PGRST202) falls
 * back to the single-service read. Any other failure is a failure — never a
 * reason to offer the older flow.
 */
export async function getBookingCatalog(slug: string): Promise<BookingCatalog | null> {
  const selection = await getSelectionAvailability(slug, null, null);
  if (selection.status === "UNAVAILABLE") return null;
  if (selection.status === "OK") {
    const { services, firstDate, lastDate, timeZone } = selection.availability;
    return { mode: "selection", services, firstDate, lastDate, timeZone };
  }

  const availability = await getAvailability(slug, {});
  if (availability === null) return null;
  const { services, firstDate, lastDate, timeZone } = availability;
  return { mode: "single", services, firstDate, lastDate, timeZone };
}
