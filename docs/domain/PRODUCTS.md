# Souris — Product Domain

## 1. Purpose

This document defines the Product catalog rules of Souris V1.

V1 scope: a professional-managed Product catalog + current stock. No Sales, checkout, payments,
purchase history, suppliers, or stock-movement history yet — those belong to the future
Sales/Transactions domain.

---

## 2. Canonical Model

```text
Product
├── id             stable, never regenerated on edit
├── businessId     explicit business ownership
├── name           required text
├── brand?         optional simple text (no Brand entity in V1)
├── category?      optional normalized text (no Category entity in V1)
├── barcode?       optional STRING — leading zeroes preserved, never numeric-only
├── imageUri?      optional local primary-image URI for the current session
├── price          Souris money convention: finite number >= 0
├── stockQuantity  integer >= 0 (whole units, no fractional inventory)
└── active         current catalog availability
```

No `purchasePrice`, margin, supplier, VAT, sales count, revenue, clientIds, or purchase history
fields exist.

---

## 3. Legacy Import Boundary

The real legacy file (`legacy-products.ts`, 50 records) is a ONE-WAY import source normalized
through a pure adapter into canonical `Product[]`.

Actual legacy shape:

```text
_id        → id (stable, preserved verbatim)
title      → name (blank titles excluded with a diagnostic)
type       → category via a deterministic French bucket mapping
             (hair-care → Soin, shampoo → Shampooing, colouring → Coloration,
              styling → Coiffage; unknown buckets map truthfully to their raw text)
brand      → brand
barcode    → barcode (all 50 real records have one; stored as string)
price      → price (must be finite >= 0, otherwise excluded with a diagnostic;
             the two real zero-price records are preserved truthfully)
line/capacity → DISCARDED (legacy-only fields without canonical meaning)
```

Boundary defaults (fields absent from the legacy source): `stockQuantity = 0` (legacy has NO
stock data — current stock starts at zero until the professional enters real counts),
`active = true` (legacy has NO archive state), and `imageUri = undefined` (legacy has NO Product
image). `businessId` is supplied at the seed-composition boundary (the development business
identity). Diagnostics are deterministic and testable.

Barcode reality: every real record has a unique numeric-string barcode: 47 are 13 digits, one is
8 digits (`30163508`), and two are 14 digits (`00884486453280`, `00884486453273`). The dataset does
not prove a uniqueness CONTRACT — no uniqueness validation is enforced in V1. Duplicates remain
possible until real usage justifies a rule.

---

## 4. Runtime Catalog

One in-memory session source — `ProductCatalogProvider` — owns the canonical `Product[]`:

```text
legacy-products ── pure adapter ──> Product[] ──> ProductCatalogProvider
                                                       │
                                              Produits tab
                                          (future Sales reads activeProducts)
```

API: `products`, `activeProducts`, `getProductById`, `addProduct`, `updateProduct`,
`setProductActive`, `setProductStock`, `deleteProduct`. The seed is deep-copied per session;
the raw legacy module is never mutated. New runtime identities follow the session-ID pattern
(`product-{timestamp}-{sequence}`).

---

## 5. Stock Semantics

`stockQuantity` is DIRECT current-stock state in V1. There is no stock-movement history:
adjustments edit the quantity in place. The future Sales/Inventory transaction domain will
introduce movements and history.

A zero-stock Product remains in the catalog and is displayed with a restrained
`Stock épuisé` treatment. No low-stock thresholds, alerts, or reorder suggestions exist in V1.

---

## 6. Active / Inactive

`active` controls catalog management grouping. Inactive Products stay in the catalog (visible
under Inactifs) and will be hidden from future Sale product selection once Sales exists. State
changes never touch any other domain.

## 7. Permanent Deletion

`Supprimer définitivement` removes the catalog record only (mistakes/duplicates). Since Sales
does not exist yet, there are no historical relationships to preserve. Future transaction
snapshots will define historical retention later.

## 8. Future Sales Direction

Future Sales/Transactions will reference Products through the stable `productId` and will
likely snapshot relevant commercial data (name/price at purchase time) so catalog edits never
rewrite historical purchases. This snapshot model is deliberately NOT implemented in V1 —
the canonical model simply stays referenceable by stable id.

## 9. Search and Order

Search covers name, brand, category, and barcode: case-insensitive, accent-insensitive,
substring; barcodes match exactly as entered (leading zeroes preserved). The directory order
is deterministic French alphabetical by name. No manual product reordering in V1.

## 10. Barcode Scanning

Scanning is an input/lookup boundary, not Product domain state. A scanned value is trimmed and kept
as a string; it is never converted to a number, so leading zeroes remain significant.

Catalog lookup is pure and exact (`findProductsByBarcode`) and returns every matching Product:

- one match may open that Product;
- zero matches may seed a new Product form with the exact barcode;
- multiple matches must remain visible for explicit selection because uniqueness is not a rule.

In create/edit forms, a scan updates only the local draft. Cancelling leaves the canonical Product
unchanged; saving follows the existing Product form boundary. Scanning never modifies
`stockQuantity`, creates stock movement, or introduces Sales behavior.

## 11. Product Image Semantics

`imageUri` represents one optional primary Product image. It is a simple URI string: the Product
domain does not know about Expo, camera permissions, files, Apple Vision, MIME types, thumbnails,
or remote storage, and it does not impose a URI-format rule beyond the existing optional-text
normalization at the form boundary.

Image acquisition is draft-owned. Selecting, taking, replacing, processing, or removing a photo
does not call `ProductCatalogProvider`. Create commits the draft image only with `addProduct`; Edit
commits it only with `updateProduct`. Cancel restores the original canonical image. All other
Product fields, including stable `id`/`businessId`, stock, and active state, follow their existing
rules.

The current picker/processed URI is local to the app and coherent with the in-memory Product
session. There is deliberately no promise of survival across session reseed, reinstall, or future
persistence migration. Apple Vision background removal is an optional presentation/infrastructure
enhancement and does not change the canonical Product model; failure keeps the original URI.

## 12. Non-Goals

Not in this phase: sales, checkout, payments, client purchase history, automatic stock
decrement from sales, suppliers, purchase orders, cost/margin, VAT, variants, ecommerce,
persistence, image galleries, remote image storage, image synchronization.
