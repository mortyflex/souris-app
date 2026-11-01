# BeautIzzy — Sale Domain

## 1. Purpose

This document defines the Product Sale rules of BeautIzzy Sales V1.

V1 scope: COMPLETED Product sales only, created by the professional, optionally attached to a
Client and optionally to the Appointment they were sold during, decrementing current Product stock
atomically. No pending orders, payment methods on the Sale itself, refunds, returns, discounts,
tax, receipts, revenue dashboard, or loyalty.

Sales exist to make Product retail and stock easier to manage and to give the Client Profile a
real, BeautIzzy-generated purchase history.

---

## 2. Canonical Model

```text
Sale
├── id            stable runtime identity (sale-{timestamp}-{sequence})
├── businessId    explicit business ownership
├── clientId?     OPTIONAL — a walk-in sale has no Client
├── appointmentId? OPTIONAL — the Appointment the Sale was sold during (« Revente »)
├── payment?      OPTIONAL — card / cash received, standalone Sales only (see §4b)
├── completedAt   completion instant (Date)
└── items[]       ordered SaleItem snapshots
    ├── id            stable unique identity ({saleId}-item-{n})
    ├── productId     stable Product identity at sale time
    ├── productName   SNAPSHOT
    ├── unitPrice     SNAPSHOT — finite number >= 0
    └── quantity      integer >= 1
```

There is NO `status`, `total`, `discount`, `tax`, `imageUri`, or `refund` field. V1 only
creates completed Sales, so a status would carry no information.

Totals are DERIVED, never stored:

```text
line total = unitPrice × quantity
sale total = Σ line totals
```

---

## 3. Snapshot Boundary

While a Sale is being drafted, the UI reads CURRENT Product data (name, price, image, stock).
Nothing is snapshotted yet, and nothing is written.

When the Sale is completed, each line snapshots at least:

```text
productId
productName
unitPrice
quantity
```

After completion, changing `Product.name`, `Product.price`, `Product.active`,
`Product.imageUri`, or deleting the Product must NEVER rewrite the historical SaleItem. The
snapshot holds no reference to the Product object.

The Product image is deliberately NOT snapshotted in V1: historical purchase entries stay
understandable from `productName`, `quantity`, and `unitPrice` alone.

---

## 4. Client of a Sale

`clientId` is optional in the canonical model, but the Sale creation flow requires one
(product decision, September 2026). The « Client » row depends on the entry context, decided by
the resolved Appointment id and never by UI state:

- Appointment Details (« Revente »): the Sale belongs to the Appointment's own `clientId`. The
  row is read-only (no chevron, no picker, no removal); a different route Client is ignored.
- Produits → « Nouvelle vente »: no Client at first (« Choisir un client »). The whole row opens
  the shared picker; a selection replaces the current Client. « Valider la vente » stays disabled
  until a Client is chosen.
- Client Profile: that Client is preselected in the same editable row, replaceable.

There is no « Retirer », no walk-in sale and no anonymous Client in the flow. An unknown or
archived supplied id falls back to no Client — nothing is invented.

The Appointment may be persisted on the Sale. `appointmentId` is optional and set ONLY when the
flow was opened from Appointment Details (« Revente ») and the id resolves to an existing
Appointment; a Sale opened from the Client Profile or from Produits keeps `appointmentId`
undefined. An Appointment is never inferred from the Client. The link is plain reference
metadata (no foreign key, no cascade): the Sale snapshot stays valid history even if the
Appointment later disappears, and it never resolves live Appointment data. The Appointment and its Client are fixed together for the whole draft.

`clientId` stays optional in the canonical model so that historical walk-in Sales (created before
the Client requirement) remain valid: they decrement stock and are stored like any other Sale, but
appear on no Client Profile. BeautIzzy never fabricates a "Client de passage" record.

Selecting or replacing a Client in the Sale draft never mutates the Client session. Purchase
history is derived from Sales through `sale.clientId` and never stored on the Client.

---

## 4b. Standalone Sale Payment

A Sale completed from `Produits → Nouvelle vente` (no `appointmentId`) records what the
professional actually received — tracking only, never processing:

```text
SalePayment
├── paidAt            completion instant
├── cardAmountCents   integer cents >= 0
└── cashAmountCents   integer cents >= 0
```

The cents representation and the amount rules are the Appointment checkout ones
(`docs/domain/APPOINTMENTS.md` §25b): card only, cash only, or mixed; when the Sale total is
positive the received total must be positive; the received total may otherwise differ from
the Sale total. Invalid cents or a zero payment on a priced Sale are completion issues
(`INVALID_PAYMENT`) and nothing changes.

A Sale sold during an Appointment (« Revente », `appointmentId` set) NEVER carries a payment:
the Appointment checkout records the whole amount received. A draft that combines both is
refused (`LINKED_SALE_PAYMENT`). Historical Sales keep `payment = undefined`; BeautIzzy never
fabricates a payment method for them.

The Cash Register counts `sale.payment` ONLY for standalone Sales, so the same money is never
counted twice (`docs/domain/APPOINTMENTS.md` §25b).

## 5. Stock Rule

Completing a Sale decrements the current stock of every involved Product by the requested
quantity:

```text
stock 5, sale ×2  →  stock 3
```

Canonical Product stock can never become negative. If the requested quantity of any Product
exceeds its available stock, completion is BLOCKED and the issue names the Product, its
available stock, and the requested quantity. Quantities are never silently clamped.

Stock changes ONLY when a Sale completes successfully. Editing the draft — adding, incrementing,
decrementing, removing lines — never touches the catalog. The draft bounds quantities by current
stock for comfort, but final completion re-checks canonical stock, because the catalog may have
changed while the draft was open.

Lines of the same Product are merged for the stock check: a draft can never pass line by line
while failing as a whole.

---

## 6. Atomic Completion

Sale completion is ONE coherent operation at the session boundary:

```text
validate the WHOLE draft against the CURRENT Product catalog
→ every referenced Product exists and is active
→ every quantity is an integer >= 1
→ every requested quantity <= available stock
→ an optional payment is valid and only present on a standalone draft
→ build the immutable Sale snapshot
→ decrement every involved Product stock
→ add the Sale
```

Any failure leaves BOTH the Sale session and the Product catalog unchanged and returns the
complete list of issues:

```text
EMPTY_SALE
INVALID_QUANTITY      productId, quantity
PRODUCT_MISSING       productId
PRODUCT_INACTIVE      productId, productName
INSUFFICIENT_STOCK    productId, productName, requested, available
INVALID_PAYMENT
LINKED_SALE_PAYMENT   appointmentId
```

The pure domain function (`prepareSaleCompletion`) never applies anything; it returns either
the Sale plus the exact stock decrements, or the issues. The application boundary
(`SaleSessionProvider.completeSale`) then applies the decrements and the Sale in ONE SQLite
transaction — each decrement re-checks the stored quantity of an active Product, and any failure
rolls everything back — before reflecting the committed result in state. There is never a
committed Sale without its decrements nor a decrement without its Sale
(`docs/architecture/PERSISTENCE.md` §8).

---

## 7. Draft Rules

- The same Product is ONE line with a quantity: adding it again increments the line.
- Inactive Products cannot be newly added to a draft.
- A Product with no remaining stock cannot be added; `+` is disabled when the line reaches
  current stock.
- Quantity is an integer >= 1; `−` is disabled at 1 and an explicit remove action deletes the
  line. Zero-quantity lines never exist.
- V1 uses the current `Product.price` as the unit price. There is no per-sale manual price and no
  discount.

---

## 8. Inactive and Deleted Products

Normal Sale selection (search, scan, choice among several barcode matches) uses ACTIVE Products
only. Historical Sales may reference Products that later become inactive or are deleted;
historical SaleItems are never hidden or rewritten for that reason. Product deletion never
cascades into Sales — this is one reason the snapshot exists.

---

## 9. Barcode Scanning in a Sale

Scanning reuses the shared `BarcodeScannerModal` unchanged. Inside a Sale:

```text
one ACTIVE match         → added / incremented immediately
matches, none active     → « Ce produit est inactif. » — nothing added
no match                 → « Produit introuvable » — NO Product creation from a Sale
several ACTIVE matches   → explicit choice among active Products only
```

---

## 10. Immutability and Appointment-linked Product Deletion

Completed Sales are never edited: there is no line editing or price correction. Corrections and
refunds are separate records (§15). Removing a product sold during an Appointment is allowed only
while that Appointment has NOT received its money: `deleteAppointmentProduct(appointmentId, identity)`
is refused once the stored Appointment is settled (`APPOINTMENT_SETTLED` — a final payment, or
completed and fully covered by deposits) or when a matching Sale holds an adjustment
(`SALE_HAS_ADJUSTMENT`). Appointment Details then shows the product rows as buttons that open their
Sale (« Rendez-vous encaissé : touchez un produit pour le corriger ou le rembourser. »).

From Appointment Details the professional removes a **displayed Product row** (§10b) — for
example « Shampoo ×2 » — not a Sale. Deletion is a correction of an entry, not a refund flow:

- it removes **every matching SaleItem snapshot** across the Sales sold during that Appointment
  (`appointmentId` set, `payment` undefined), matched on the snapshot identity
  `productId + productName + unitPrice`. Other Products of those Sales are untouched;
- a parent Sale is deleted **only once it holds no line any more**; a Sale that still contains
  other Products is preserved (trimmed). Underlying Sales therefore remain separate records until
  — and unless — they are emptied. Nothing is ever rewritten merely for display;
- it **restores the summed quantity atomically**: `stock 5 → ×1 + ×1 → stock 3 → delete → stock 5`,
  the exact quantity, never clamped by any editor display limit. The stock restoration, the item
  removal and the empty-Sale cleanup happen in ONE SQLite transaction; a failure leaves the stock,
  every line, every Sale and the session untouched. A Product that no longer exists in the catalog
  aborts the deletion (`PRODUCT_MISSING`) — no line is removed while its stock cannot be restored;
- it never rewrites other Sales, the Product catalog price, or unrelated stock;
- it **never touches the Appointment payment**. When the Appointment was already checked out, the
  expected total decreases and the recorded payment stays exactly as recorded: BeautIzzy cannot know
  whether the money was refunded, genuinely received, or whether the entry was simply wrong.
  `Modifier l’encaissement` remains the correction mechanism. The Cash Register, which counts
  `appointment.payment` and never linked Sales, is therefore unchanged by the deletion;
- eligibility is deliberately narrow (`removeAppointmentProduct`): nothing matching
  (`PRODUCT_NOT_SOLD`) or a matching Sale carrying its own payment (`SALE_HAS_PAYMENT`) is refused,
  because touching a paid Sale would need a payment / Caisse decision this rule does not make. A
  standalone Sale of the same Client and Product is never a candidate.

Worked example — Sale A: Shampoo ×1 + Mask ×1; Sale B: Shampoo ×1. Details shows Shampoo ×2 and
Mask ×1. Deleting Shampoo restores Shampoo +2, keeps Sale A with Mask ×1, deletes the emptied Sale B,
and Details shows Mask ×1. The Client's `Produits achetés` follows the same canonical Sale state.

Once the last linked Sale is emptied and removed, the Appointment permanent-deletion guard is
re-evaluated from the stored references: an Appointment without payment becomes deletable again,
an Appointment with a recorded payment stays blocked (`docs/domain/APPOINTMENTS.md` §28).

---

## 10b. Appointment Products (« Produits vendus »)

Appointment Details lists the Products sold during the Appointment:

```text
sale.appointmentId === appointment.id
```

rendered EXCLUSIVELY from Sale snapshots (`productName`, `unitPrice`, `quantity`) — never from the
live Product catalog. The **Product is the visual unit**: one row per sold Product snapshot, with
the aggregated quantity, the snapshot unit price and the aggregated line total. Identical
snapshots (same `productId`, `productName` and `unitPrice`) sold through several Reventes add their
quantities into ONE row (`getAppointmentProductLines`, `src/domain/appointments`); the same Product
genuinely sold at another snapshot price or under another name stays its own truthful row. No
Sale container, subtotal or « Revente » label is shown — the section title already says what these
are — and there is no visible delete button: each row is swiped to delete (§10). The section badge
counts TOTAL UNITS (Shampoo ×2 + Mask ×1 → 3). A Sale of the same Client without the Appointment
id is not shown there. The linked Sale snapshots also feed the ONE canonical Appointment expected
total — `Total à encaisser` in Details and `Total attendu` in the checkout
(`docs/domain/APPOINTMENTS.md` §25b).

Standalone Sales record their own payment (§4b) and are counted by the Cash Register; a Sale
sold during an Appointment is counted through the Appointment checkout only.

## 11. Client Purchase History

The Client Profile `Produits achetés` section derives from the Sale session:

```text
sale.clientId === client.id
```

sorted newest first, rendered exclusively from snapshots. It exposes its own per-sale total.
The profile previews the three newest Sales; the complete list is the pushed
client purchase history, read from the same derivation. A
Sale adds to the Client `Total dépensé` (`docs/domain/CLIENTS.md` §6) exactly once: a paid
standalone Sale on its own, a Sale sold during an Appointment through that Appointment once it is
COMPLETED. A standalone Sale without a recorded payment is listed here but adds nothing.

Its UI title is « Achats » (November 2026): it counts purchases — Sales, one per transaction
whatever its number of products — never product units. Every purchase, in the preview and in the
complete history, opens the Sale detail (the screen of the Caisse, §15); the complete history
offers the same swipe-revealed « Actions » and the same « Actions de la vente » drawer as the Caisse
sale history (`getSaleActions`). A row's refund state reads the Sale refund summary
(`describeSaleRefundStatus`): an additional refund counts as money given back, a voided entry never.

---

## 11b. Sale History (Caisse « Produits vendus »)

The Caisse « Produits vendus » card ends with « Voir les ventes », which opens the READ-ONLY sale
history of the period the Caisse is showing (`/sales?period=day|month&date=YYYY-MM-DD`); a « Vente »
entry of the Caisse « Encaissements » list opens the detail of that Sale (`/sales/[saleId]`). Both
derive from the Sale session alone (`src/domain/sales/history.ts`):

```text
listSaleHistory(sales, interval)       the Sales whose completedAt falls in [start, end), newest first
describeSaleHistoryEntry(sale)         { sale, channel, paymentRecord, totalCents, unitCount }
summarizeSaleHistory(entries)          sales, units, direct units, Appointment units
findSaleHistoryEntry(sales, saleId)    one Sale, or undefined
```

- **Period.** A Sale belongs to the local civil day / calendar month of its own `completedAt` — the
  SAME intervals as the Caisse card (`getCashRegisterDayInterval`, `getCashRegisterMonthInterval`), so
  the units counted by the card and the Sales listed always agree. The history has the Caisse controls
  (Jour | Mois, the shared DateNavigator and month calendar, the grouped month navigator).
- **Channel.** `DIRECT` (no `appointmentId`) or `APPOINTMENT` (a Sale sold during an Appointment,
  « Pendant un rendez-vous »). Rows and detail name it; nothing else distinguishes them.
- **Payment record.** `SALE_PAYMENT` (a direct Sale with its own card / cash record: « Carte »,
  « Espèces », « Carte + Espèces »), `APPOINTMENT_CHECKOUT` (a Revente: « Avec le rendez-vous », the
  detail leads to the Appointment, or says it is not on this device), `NONE` (a historical direct Sale
  without any record: « Non renseigné » — no method is ever invented). A Sale sold during an
  Appointment is never counted as money of its own here either: the history shows its snapshot total
  and says the Appointment checkout recorded it.
- **Snapshots only.** Lines show `productName`, `quantity`, `unitPrice` and the exact cents line total
  (`getSaleTotalCents`) as sold; a later catalog rename or price change never changes the history.
- **Read-only.** Nothing is stored, cached, edited, refunded or deleted from these screens, and the
  Caisse totals, breakdown, counters and list are unchanged by their existence. Corrections and refunds
  are the next milestone (`docs/product/SALE_ADJUSTMENTS_PLAN.md`).

---

## 12. Legacy Source

There is NO legacy Sale, transaction, order, or purchase dataset in the repository. The legacy
client address book carries only aggregate commercial statistics (`stats.totalSpent`,
`ticketAverage`, `visitNb`, `lastVisitDate`), which are explicitly not imported. The Sale session
therefore starts EMPTY (`[]`) — no fixtures are seeded into the canonical runtime source. Tests
use focused fixtures only.

---

## 13. Domain Independence

`src/domain/sales` is plain TypeScript: no React, React Native, Expo, persistence, camera, or
UI imports. ID generation lives at the application boundary (`features/sales/creation/runtime-ids`),
never in the domain.

---

## 14. Non-Goals

Not in this phase: pending orders, payment providers, card terminal, any automatic money transfer,
line-by-line Sale editing or deletion, deletion of a standalone (paid) Sale, discounts, tax/VAT,
receipts/invoices, credit notes, accounting closures, loyalty, per-sale price editing, image
snapshots. Corrections and refunds exist as Sale adjustments (§15).

---

## 15. Corrections and Refunds (Sale Adjustments)

Source: `src/domain/sales/adjustment.ts`; plan and decisions: `docs/product/SALE_ADJUSTMENTS_PLAN.md`.

A completed Sale is NEVER rewritten or deleted. A correction or a refund is its own record, linked
to the Sale, kept forever, synchronized as its own aggregate (`SALE_ADJUSTMENT`, CLOUD_SYNC.md §28):

```text
SaleAdjustment
├── id                    UUID v4, created ONCE per presentation of the flow (a retry never duplicates)
├── businessId, saleId
├── kind                  REFUND | REVERSAL (a compensation of ONE settled refund)
├── reversesAdjustmentId  REVERSAL only
├── reason                REFUND: NOT_DELIVERED | WRONG_PRODUCT | WRONG_QUANTITY | RETURN
│                         | CUSTOMER_REFUND | SALE_CANCELLED | OTHER
│                         REVERSAL: RECORDED_IN_ERROR | REFUND_RETURNED (its meaning, mandatory)
├── note?                 free text
├── staffMemberId         the operator (features/appointments/current-staff-member.ts)
├── items[]               saleItemId, productId, productName, unitPriceCents (COPIED from the line),
│                         quantity >= 1, restock (the units physically went back to stock)
├── refundCardCents, refundCashCents   integer cents >= 0, by the ACTUAL refund method(s)
├── initialStatus         PENDING | SETTLED
├── status                PENDING | SETTLED | VOIDED
├── refundedAt?           when the money ACTUALLY left — its Cash Register day (present once SETTLED)
├── settledAt?            when that was RECORDED in BeautIzzy (present once SETTLED)
├── voidedAt?
└── recordedAt            when the record was entered
```

**Lifecycle.** `PENDING → SETTLED` (final), `PENDING → VOIDED` (final). A SETTLED refund is never
erased, edited or voided, and a refund that really happened never disappears economically. « Corriger
ce remboursement… » asks what REALLY happened and records at most ONE `REVERSAL`:

- « Je l’ai saisi par erreur : l’argent n’a jamais été rendu » → `RECORDED_IN_ERROR`: mirrors the
  refund (same amounts, same methods) dated ON THE REFUND'S DAY (`refundedAt`), so that day's Caisse
  reads what really happened; recorded now (`recordedAt`, `settledAt`); both records stay listed;
- « L’argent du remboursement m’a été rendu depuis » → `REFUND_RETURNED`: a new receipt of the WHOLE
  refunded amount on the day it came back (never before the refund, never in the future), by the
  method(s) it actually came back with — chosen explicitly, never assumed from the refund;
- « Le remboursement a bien eu lieu et reste acquis » → nothing is recorded.

Either compensation takes the refund's restocked units back (the Sale counts them as sold again).
The single exception to « never void » is a SETTLED record the REMOTE refused (an over-refund
across two devices): it never became authoritative. It is resolved by what REALLY happened (§15.1):
voided when its money was not returned, voided AND carried forward by an exceptional outflow when it was. The auditable history is derived from the instants: recorded (initial status) → settled →
voided — at most one of each, so nothing is lost.

**Money (integer cents, snapshots only).**

- Refundable base: a direct Sale → the payment actually received (0 without one: a historical Sale
  accepts unit / stock corrections, never money); a Sale sold during an Appointment → the exact
  snapshot total of its lines, and only once that Appointment is SETTLED (before, it is removed from
  the Appointment, §10).
- Remaining = base − Σ effective refunds (PENDING and SETTLED, not VOIDED, not reversed). A new refund
  never exceeds it. The method may differ from the original payment (paid by card, refunded in cash).
- Refund method: NEVER deduced in silence. It is preselected only when the original money reliably
  came by ONE method — the direct Sale's own payment; for a Revente, the Appointment's final payment
  and its ACTIVE deposits — and the screen says so (« Payé à l’origine en espèces. Préselectionné :
  vérifiez… »). Mixed or unknown origin: the professional must choose Carte, Espèces or Carte et
  espèces (typing both parts) before the review. The original method never constrains the refund method.
- Only a SETTLED record moves money, on `refundedAt`: a refund negatively, a reversal positively. A
  PENDING refund moves nothing until it is marked as refunded. A record without money (units, stock)
  is SETTLED at once and moves nothing.
- BeautIzzy RECORDS refunds; it never transfers money, and every screen says so.

**Units and stock.** Per Sale line, Σ units of the effective refunds ≤ sold quantity, so the same unit
is never refunded or restocked twice. `restock` is a separate, explicit choice — a money refund never
implies a return to stock. The correction screens start every line with `restock = false`, the full
refund (« Rembourser intégralement », reason `SALE_CANCELLED`) included; only the professional's switch
per line sets it. A restock gives the units back to the Product in the SAME transaction as
the record; a Product no longer in the catalogue refuses a restock (`PRODUCT_MISSING`). Voiding a
PENDING record or reversing a SETTLED one takes its restocked units back (refused, never clamped, when
the stock no longer holds them; skipped for a Product deleted since).

**Enforcement, layered.** Domain (`prepareSaleAdjustment`, `settleSaleAdjustment`, `voidSaleAdjustment`,
`prepareSaleAdjustmentReversal`); the store re-reads the stored Sale, its adjustments and the
Appointment settlement INSIDE its transaction and refuses a duplicate id; the remote enforces the same
ceilings, the immutability and the reversal rule at its transaction boundary, serialised on the Sale
row (CLOUD_SYNC.md §28). Remotely, a Sale that holds adjustments is FROZEN: any change or tombstone of it
is answered `CONFLICT` — the refusal every app build, including those that predate adjustments,
already understands.

**Where it shows.** The Sale detail (« ••• » → « Actions de la vente »; « Remboursements »: the real
money movements, « Total remboursé », « Solde de la vente » and an over-refund warning; every record
with its history in the collapsed « Historique des corrections » — DESIGN_OVERRIDES.md §48.3), the sales history (a status per Sale, a swipe that reveals « Actions » — the same drawer;
both read `getSaleActions`, which adds no rule of its own), the Cash Register
(signed « Remboursement » entries on their day, « Remboursements produits » and « Net produits » in the
Produits vendus card), the Client « Total dépensé » and Tops & tendances (settled money only, on its
date — `docs/domain/CLIENTS.md`). A Sale sold during an Appointment keeps its Appointment payment
untouched: the refund is the one separate movement.

### 15.1 A refund the server refused (two devices offline)

Two devices may each record a locally valid refund of the same Sale while offline. The remote
evaluates them one after the other and REFUSES the one that would make the refunds exceed what the
Sale received (`ADJUSTMENT_CONFLICT`, CLOUD_SYNC.md §28). That refusal protects the Sale's books —
but the money of a refund marked « Déjà remboursé » may REALLY have been handed back. BeautIzzy never
erases it in silence.

**Financial status and synchronization are two separate facts.** « Remboursé » says the money left;
a second line on every record says where it stands with the server: « Pas encore synchronisé »
(waiting on this device), « Synchronisé », or « Refusé par le serveur … Ce remboursement n’est pas
synchronisé. » A refusal is never worded as synchronized. The Caisse lines say it too (« Pas encore
synchronisé », « Refusé par le serveur : à vérifier »). Until it is resolved, a refused SETTLED refund
still counts in that device's Caisse: as far as BeautIzzy knows, that money left.

**The question.** A refused SETTLED refund asks « L’argent a-t-il réellement été rendu au client ? »:

- « Non, l’argent n’a pas été rendu » → the refused record is VOIDED (kept, audited, counted nowhere);
- « Oui, l’argent a été rendu » → in ONE transaction, the refused record is VOIDED and an
  **exceptional outflow** — shown as « Remboursement supplémentaire » — records the real money movement.

A refused PENDING refund (nothing handed back yet) can only be voided: it is not paid out against a
server that will not take it.

**The exceptional outflow** is a SaleAdjustment of kind REFUND, money only (no line: it never moves
stock), SETTLED at once and final, whose identity derives from the refused record:
`<refused id>-outflow` (`getSaleRefundOutflowId`). That identity is the link (traceability, restore)
and makes it ONE per refusal across retries, restarts and devices (primary key, locally and remotely).
It copies the refused record's amounts, methods, refund day (`refundedAt`), reason, note and operator;
it is recorded at the resolution (`recordedAt`, `settledAt`). It moves money like any settled refund —
Caisse by method on its real day, Client « Total dépensé », Tops & tendances — and stands OUTSIDE the
Sale's refundable ceiling: it neither consumes nor frees the room left (`getSaleAdjustmentPosition`
reports it apart, `outflowCents`). It is never voided nor corrected as « saisi par erreur » (the screen does not offer it, the session
refuses it); if the money later comes back, « Le client a rendu cet argent… » compensates it. The original Sale is never touched, no normal
refund is fabricated. The refused record's restocked units, if any, leave the stock again on either
answer.

Rules: `prepareSaleRefundOutflow` (domain), `recordStoredSaleRefundOutflow` (store: the refusal is read
from the sync bookkeeping, a replay writes nothing), `sync_sale_adjustment_breach` +
`sync_sale_refund_outflow_source` (remote, 20261012120000).

**Before confirming a money refund**, the review says that another device not yet synchronized may
refund the same Sale, that the server may then refuse this one, and that nothing will be erased
without the professional's confirmation.
