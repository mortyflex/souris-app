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

## 10. Immutability

Completed Sales are immutable in V1. There is no edit, delete, refund, or return flow. The session
exposes only `sales`, `getSaleById`, and `completeSale`.

---

## 10b. Appointment Products (« Produits vendus »)

Appointment Details lists the Products sold during the Appointment:

```text
sale.appointmentId === appointment.id
```

rendered EXCLUSIVELY from Sale snapshots (`productName`, `unitPrice`, `quantity`) — never from the
live Product catalog. Several Sales from the same Appointment are merged into one concise list:
identical snapshot lines (same Product, name and unit price) add their quantities; a later
different snapshot stays its own line. A derived `Total produits` closes the list. A Sale of the
same Client without the Appointment id is not shown there. The Product total also feeds the
checkout expected total (`docs/domain/APPOINTMENTS.md` §25b) as a UX helper only.

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
a completed Sale, refunds, returns, discounts, tax/VAT, receipts/invoices, accounting, revenue
dashboard, sales history screen, loyalty, per-sale price editing, image snapshots, cloud sync.
