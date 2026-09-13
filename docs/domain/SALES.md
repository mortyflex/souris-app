# Souris — Sale Domain

## 1. Purpose

This document defines the Product Sale rules of Souris Sales V1.

V1 scope: COMPLETED Product sales only, created by the professional, optionally attached to a
Client and optionally to the Appointment they were sold during, decrementing current Product stock
atomically. No pending orders, payment methods on the Sale itself, refunds, returns, discounts,
tax, receipts, revenue dashboard, or loyalty.

Sales exist to make Product retail and stock easier to manage and to give the Client Profile a
real, Souris-generated purchase history.

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

## 4. Optional Client

`clientId` is optional. An entry context may PREFILL it: opening the Sale flow from a Client
Profile or from Appointment Details preselects that Client (the Appointment's `clientId`) in the
draft, and the professional may still change or remove it before completion. An unknown
supplied id falls back to no Client — nothing is invented.

The Appointment may be persisted on the Sale. `appointmentId` is optional and set ONLY when the
flow was opened from Appointment Details (« Revente ») and the id resolves to an existing
Appointment; a Sale opened from the Client Profile or from Produits keeps `appointmentId`
undefined. An Appointment is never inferred from the Client. The link is plain reference
metadata (no foreign key, no cascade): the Sale snapshot stays valid history even if the
Appointment later disappears, and it never resolves live Appointment data. Changing or removing
the Client in the draft does not change the Appointment link — it records where the Sale happened.

`clientId` is optional in the canonical model. A walk-in Product sale is a valid Sale: it decrements stock and is stored
in the session like any other Sale, but it appears on no Client Profile. Souris never fabricates
a "Client de passage" record.

Selecting or removing a Client in the Sale draft never mutates the Client session. Purchase
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
refused (`LINKED_SALE_PAYMENT`). Historical Sales keep `payment = undefined`; Souris never
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

Completed Sales are never edited: there is no line editing, refund, return, or price correction.
The session exposes `sales`, `getSaleById`, `completeSale`, and ONE explicit correction:
`deleteAppointmentProduct(appointmentId, identity)`.

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
  expected total decreases and the recorded payment stays exactly as recorded: Souris cannot know
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

sorted newest first, rendered exclusively from snapshots. It exposes its own per-sale total. It
does NOT change the Appointment-derived `Total dépensé` metric, which stays the sum of
AppointmentItem snapshot prices for COMPLETED appointments only.

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

Not in this phase: pending orders, payment providers, card terminal, payment correction on
a completed Sale, line-by-line Sale editing or deletion, deletion of a standalone (paid) Sale,
refunds, returns, discounts, tax/VAT, receipts/invoices, accounting, revenue dashboard, sales
history screen, loyalty, per-sale price editing, image snapshots, cloud sync.
