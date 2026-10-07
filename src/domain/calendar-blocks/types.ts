// BeautIzzy — Calendar Block domain types
//
// Source: docs/domain/CALENDAR_BLOCKS.md
//
// A Calendar Block is a period during which the professional is UNAVAILABLE
// for something that is not a client Appointment (a break, travel, admin
// work, training…). It is calendar availability and nothing else:
//
//   client Appointment  → client / services / pricing / payment lifecycle
//   Calendar Block      → staff member + interval + reason
//
// It is deliberately NOT an Appointment variant: there is no client, no
// service item, no price, no discount, no payment and no status. Its whole
// lifecycle is "exists" or "deleted". Financial and client logic cannot see
// it because nothing here could ever be summed, paid or attributed.
//
// Framework-independent. `startAt` / `endAt` are exact instants, like
// `Appointment.startAt`; the local-day semantics belong to the callers.

export interface CalendarBlock {
  readonly id: string;
  readonly businessId: string;
  /** The professional who is unavailable. Conflicts are scoped to her alone. */
  readonly staffMemberId: string;
  readonly startAt: Date;
  /** Exclusive end, strictly after `startAt`. */
  readonly endAt: Date;
  /** Normalized free text, never blank. Quick suggestions are a UI shortcut, not a vocabulary. */
  readonly reason: string;
}
