# BeautIzzy — Product Sale Corrections and Refunds: Implementation Plan

Status: **milestones 1 and 2 implemented in the app (October 2026); the Supabase migration is
PREPARED, NOT APPLIED. Not Production-ready before the Staging validation (§6) and real-device checks.**

Origin (October 2026, P0): a professional charged a customer for a wrong retail product on a PAID
direct Sale. The Cash Register offered no way to inspect that Sale, no way to correct it and no way
to reflect a refund, while Appointment payments had a (destructive) correction. This document keeps
the audit conclusions and the product decisions so that every later milestone implements the SAME
model. It overrides nothing in `CLAUDE.md`; it refines `docs/domain/SALES.md`.

---

## 1. Audit conclusions (what the code does today)

- **Source of truth.** SQLite is the operational database; the cloud is a synced copy. A direct Sale
  is one `sales` row (`paid_at`, `card_amount_cents`, `cash_amount_cents`) plus `sale_items`
  (`unit_price_cents`, `quantity`, snapshot name). A Sale sold during an Appointment (« Revente ») never
  carries a payment: the money is in `appointments.card/cash_amount_cents`. The Caisse derives
  everything on demand from payments by `paidAt`; nothing is stored.
- **Sales V1 is immutable by design** (`SALES.md` §14): no status, no refund, no total stored, no
  deletion of a paid Sale. `removeAppointmentProduct` hard-deletes Revente lines (and the emptied Sale),
  restores stock and refuses a Sale with its own payment (`SALE_HAS_PAYMENT`). `updateAppointmentPayment`
  rewrites card/cash in place without a trace. Voiding a deposit removes it from the totals of the day
  it was counted on (documented V1 limit).
- **Sync.** A `SALE` aggregate is pushed as « row + complete child set replaced »: any child added
  under `sale_items` would be erased by an older build pushing the Sale. A correction must therefore be
  its OWN aggregate (the `APPOINTMENT_DEPOSIT` precedent, `CLOUD_SYNC.md` §21). The push RPC enumerates
  the aggregate types: a new type needs a Supabase migration replacing the three RPCs in place.
- **Money.** Integer cents in storage, payments and sync. The domain `SaleItem.unitPrice` is a euro
  number: totals in cents go through `getSaleTotalCents`, never through `getSaleTotal` + a conversion.
- **Compliance (BOFiP BOI-TVA-DECLA-30-10-30, 25/03/2026).** A professional subject to VAT serving
  consumers with software that « mémorise et enregistre extra-comptablement des paiements reçus » is in
  scope (§1, §10, §30, §40), unless exempt (franchise en base, §25). §90 requires corrections by
  « plus » and « moins » operations, never by direct modification of the original data. Remaining gaps,
  NOT claimed to be solved by this plan: in-place « Modifier l’encaissement » (§3 below), destructive
  Revente line deletion after checkout, deposit voiding changing a past day, no daily / monthly / yearly
  closures with cumulative totals (§170), no chaining or signature (§100, §140), no open-format archive
  export (§230, §250), no certificate and no publisher attestation. BeautIzzy never claims compliance.

## 2. Product decisions (approved)

1. Corrections apply to BOTH direct paid Sales and Appointment-linked Revente items.
2. An Appointment-linked adjustment must never be counted twice: the Sale snapshot line and the
   Appointment expected total stay as recorded; the adjustment is its own movement.
3. Statuses `PENDING` → `SETTLED`, and `VOIDED`; a SETTLED refund is never erased or silently voided.
4. Every status transition is kept as auditable history (who, when, from → to).
5. Once an Appointment resale is financially settled, corrections are traceable, never destructive:
   the physical deletion of Revente lines is reserved to financially open Appointments.
6. Refund ceilings and per-item quantity limits are enforced locally AND server-side, including
   concurrent devices (`FINANCIAL_CONFLICT` pattern of `CLOUD_SYNC.md` §21.2).
7. Both the real refund date (`refundedAt`, the Caisse day) and the recording timestamp
   (`recordedAt`) are preserved; status transitions carry their own instants.
8. Appointment payment auditability (`updateAppointmentPayment` in place) is a REQUIRED
   pre-commercial-release issue, handled by this plan (§3, milestone 4).

## 3. Target model

```text
SaleAdjustment                               own aggregate SALE_ADJUSTMENT, own table
├── id                 UUID v4, created ONCE per sheet presentation (idempotent retries)
├── businessId
├── saleId             the original Sale (plain reference locally; remote composite FK RESTRICT)
├── staffMemberId      operator — the ONE source `features/appointments/current-staff-member.ts`
├── reason             NOT_DELIVERED | WRONG_PRODUCT | WRONG_QUANTITY | RETURN | CUSTOMER_REFUND | OTHER
├── note?              free text
├── items[]            saleItemId, productId, productName, unitPriceCents (COPIED from the line),
│                      quantity >= 1, restock (bool)
├── refundCardCents    >= 0
├── refundCashCents    >= 0
├── status             PENDING | SETTLED | VOIDED
├── refundedAt?        when the money was actually given back — present iff SETTLED
├── voidedAt?          present iff VOIDED
├── recordedAt         when it was entered on the device
└── transitions[]      { from, to, at, staffMemberId } — append-only, part of the aggregate payload
```

**Rules (one module, `src/domain/sales/adjustment.ts`, nothing else sums or compares):**

- Refundable base: direct Sale → the payment actually received (`sale.payment`); Revente → the exact
  snapshot total of its lines (`getSaleTotalCents`). Remaining = base − Σ non-VOIDED refunds
  (PENDING included). Never more than the remaining; never current catalog prices.
- Restockable per line = sold quantity − Σ quantities already restocked by non-VOIDED adjustments.
  `restock = false` touches no stock (a money-only refund). A Product no longer in the catalog can be
  refunded but not restocked, and the UI says so.
- `PENDING` (« À rembourser », e.g. a card refund to perform on the terminal) counts against the
  remaining but NOT in the Caisse. `SETTLED` counts negatively in the Caisse on `refundedAt`, by method.
  `VOIDED` counts nowhere and stays visible « Annulé »; a SETTLED adjustment cannot be voided — an
  opposite movement is recorded instead (decision 3). Nothing is ever deleted.
- The app never moves money and says so on screen (« remboursement enregistré », never « effectué »).
- Scenarios: A (not delivered) and E (return) = refund + restock; B = refund only; C (wrong
  product) = adjustment of the wrong line (restock + refund) then a normal new Sale; D (wrong
  quantity) = adjustment of the excess quantity.

**Store (one transaction, deposit pattern):** re-read the stored Sale, lines and adjustments; verify
ceilings, quantities and a duplicate id; insert the adjustment, its items and the transition; restore
the stock of `restock` lines; mark `SALE_ADJUSTMENT` and each `PRODUCT` in the outbox. Failure = nothing
written. A Sale with an adjustment becomes undeletable (local guard + remote FK RESTRICT).

**Caisse:** `CashRegisterSummary` gains `grossCents`, per-method `refundCents`, `refundCount`;
`totalCents` becomes the net. New entry kind `REFUND` (negative, on `refundedAt`) opening the Sale.
The « Produits vendus » card shows gross, refunds, net. `Total dépensé` and Insights subtract SETTLED
refunds through the same rule (`src/domain/clients/spending.ts`).

**Appointments:** `removeAppointmentProduct` limited to financially open Appointments; after checkout,
an adjustment. `updateAppointmentPayment` keeps its bounds but records an append-only
`appointment_payment_revisions` trace (previous card/cash, at, staffMemberId) — its own aggregate.

## 4. Schema and synchronization changes (prepared by hand, applied by hand, Staging first)

- **SQLite v18**: `sale_adjustments`, `sale_adjustment_items`, `sale_adjustment_transitions`
  (or transitions as JSON in the row — decide at implementation; the remote carries them in the
  payload), rebuild of `sync_outbox` / `sync_state` by the v11 procedure to add `SALE_ADJUSTMENT`
  (and later `APPOINTMENT_PAYMENT_REVISION`), pull cursor cleared.
- **Supabase** `2026101112xxxx_create_sale_adjustments.sql` (strictly after the highest existing
  timestamp): parent table `(business_id, id)` with composite FK RESTRICT to `sales`, child tables,
  revision trigger, owner-only RLS without DELETE, least-privilege grants; the three RPCs replaced in
  place — count, push accepting `SALE_ADJUSTMENT` with the server-side ceiling check
  (Σ non-VOIDED refunds ≤ base, per-line restock ≤ sold) answering `FINANCIAL_CONFLICT`, pull with a
  `sale_adjustments` family. PGlite harness (`supabase/README.md` policy) before any application.
- **Rollout safety**: the push worker DEFERS `SALE_ADJUSTMENT` writes until a pull proves the remote
  knows the family (`REMOTE_SCHEMA_PENDING`, the §27.1 pattern) — money must never be acknowledged by a
  remote that drops it. Older builds ignore the family and can neither overwrite nor delete it.
- **Rollback**: server — keep the previous RPC bodies; dropping the tables loses adjustments, so only
  before any entry. SQLite — forward-only, no down migration (project rule).

### 3.1 As implemented (milestone 2) — deviations from the target above

- **Transitions are derived, not stored as a child list.** The lifecycle allows at most ONE of each
  transition (recorded → settled → voided), so the instants `recordedAt`, `settledAt`, `voidedAt` (plus
  `initialStatus`) ARE the complete auditable history (`getSaleAdjustmentHistory`). No third table.
- **Operator.** `staffMemberId` on the record (single professional today); not repeated per transition.
- **One exception to « never void a SETTLED record »:** a record the REMOTE refused and never
  acknowledged (an over-refund across two devices) may be voided explicitly — it never became
  authoritative, and that void is how the conflict is resolved. Anything else settled is compensated.
- **Compensations have an explicit meaning** (hardening, October 2026): « saisie erronée »
  (`RECORDED_IN_ERROR`, mirrored on the refund's own day) or « argent rendu » (`REFUND_RETURNED`, the
  whole amount on the day it came back, by the method chosen). « Annuler ce remboursement » no longer
  exists; a refund actually paid never disappears.
- **Refund method never deduced in silence**: preselected only from a single reliable original method
  (direct payment; Appointment payment + ACTIVE deposits for a Revente), to be chosen otherwise.
- **Older builds**: a Sale holding adjustments is FROZEN remotely and any change of it is answered
  `CONFLICT`, a status every build parses; the Production build keeps that entry pending and goes on.
- **Corrections without money** (units / stock only) are SETTLED at once and move no money.
- **Historical direct Sales without a payment** accept unit / stock corrections, never money.
- **Revente** is refundable once its Appointment is settled (final payment, or completed and fully
  covered by deposits); before that it is removed from the Appointment as before. After that, removal is
  refused (`APPOINTMENT_SETTLED`) and Details opens the Sale instead.
- **Swipe.** A reveal-only `SwipeActionRow` on the sales history (never on a delete gesture); the
  Appointment Details products of a settled Appointment are buttons, not swipeable.
- **Server.** Ceilings, units, immutability and the reversal rule are enforced by `sync_push_aggregate`
  under a Sale-row lock; refusals answer `ADJUSTMENT_CONFLICT`; the client defers every adjustment until
  a pull proves the migration (`REMOTE_SCHEMA_PENDING`).

## 5. Milestones

1. **Read-only sale history** (DONE, October 2026): « Produits vendus » card → history on the Caisse
   period; « Vente » entries → Sale detail; channel and payment record shown as stored; nothing
   financial changes. `docs/domain/SALES.md` §11b.
2. **DONE (app side), October 2026 — milestones 2 and 3 together** (`docs/domain/SALES.md` §15,
   `CLOUD_SYNC.md` §28): domain, SQLite v18, store, session, correction flow, Sale detail records,
   history swipe, Caisse, spending and Insights, the SALE_ADJUSTMENT sync with deferral and conflicts,
   and the Supabase migration PREPARED and verified in PGlite (49 checks) — NOT applied anywhere.
   Originally planned as: **Domain + local store + Caisse**: `SaleAdjustment` rules and tests; SQLite v18; the refund sheet
   from the Sale detail (line, quantity, restock, amount, method, « Remboursé maintenant » /
   « À rembourser »); PENDING → SETTLED and VOID actions with transitions; Caisse net totals, `REFUND`
   entries, card figures; spending and Insights. Feature-flagged OFF until milestone 3 is applied.
3. **Remaining for release**: apply the migration on Staging by hand, run §6, real-device checks,
   then Production by hand before shipping the build. Originally planned as **Sync**: Supabase migration + harness; aggregate payload, remote-apply, restore, pull family,
   push deferral, server-side ceiling; conflict surfaces. Staging validation (two devices, offline
   retries, restore). Then enable the sheet.
4. **Appointment payment auditability**: append-only revision trace for « Modifier l’encaissement »;
   Revente line deletion limited to open Appointments. Pre-commercial-release.
5. **Later**: closures and cumulative totals, archive export — only with an explicit product
   decision; never claim compliance.

## 6. Validation procedure (Staging) for milestones 2–3

Apply the migration on Staging after the PGlite harness; install the build; direct mixed Sale →
partial SETTLED refund → PENDING refund then SETTLED → refund with restock → Revente refund; check
Caisse Jour / Mois, methods, client profile, Insights; offline entry then reconnect: ONE movement;
restore on a second device: identical totals; two devices refunding the same Sale offline: the second
push refused with `FINANCIAL_CONFLICT`, nothing lost.

## 7. The affected real sale

Only from the professional's device, after the validated release: Caisse → Produits vendus → the
Sale → « Rembourser » (line, quantity, restock according to whether the product was handed back,
amount, method, settled now or pending). No SQL, no edit of the original Sale, no Production access.
