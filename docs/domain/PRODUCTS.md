# BeautIzzy — Product Domain

## 1. Purpose

This document defines the Product catalog rules of BeautIzzy V1.

V1 scope: a professional-managed Product catalog + current stock. Completed Product sales
(Sales V1) reference Products through the stable `productId` and decrement current stock
atomically — see `docs/domain/SALES.md`. No checkout, payments, suppliers, or stock-movement
history yet.

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
├── photoPath?     the ONE shared Product photo: a stable Storage object path (§11)
├── imageUri?      LEGACY device-local image, display-only fallback, never synced (§11)
├── price          BeautIzzy money convention: finite number >= 0
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

One persistent session source — `ProductCatalogProvider` — owns the canonical `Product[]`,
hydrated from SQLite at launch (see `docs/architecture/PERSISTENCE.md`):

```text
legacy-products ── pure adapter ──> Product[] ──> ProductCatalogProvider
                                                       │
                                              Produits tab
                                          Sale creation (activeProducts)
                                          SaleSessionProvider (completion)
```

API: `products`, `activeProducts`, `getProductById`, `addProduct`, `updateProduct`,
`setProductActive`, `setProductStock`, `applyCommittedStockDecrements`, `deleteProduct`.
`addProduct` and `updateProduct` are asynchronous: a new photo (an explicit `ProductPhotoChange`)
is normalized and uploaded, then the row is written, then state changes; a photo that cannot be
stored refuses the whole save with `ProductPhotoSaveError` and writes nothing. `applyCommittedStockDecrements` only mirrors
in memory a batch already committed by the Sale completion transaction; it throws before any
change when a Product is missing or stock would become negative. The legacy module feeds the
database once, on first launch, and is never mutated. New runtime identities follow the
session-ID pattern (`product-{timestamp}-{sequence}`) and are persisted as-is.

---

## 5. Stock Semantics

`stockQuantity` is DIRECT current-stock state in V1. There is no stock-movement history:
manual adjustments edit the quantity in place, and a completed Sale decrements it by the sold
quantity (never below zero). A future inventory domain may introduce movements and history.

A zero-stock Product remains in the catalog and is displayed with a restrained
`Stock épuisé` treatment. No low-stock thresholds, alerts, or reorder suggestions exist in V1.

---

## 6. Active / Inactive

`active` controls catalog management grouping. Inactive Products stay in the catalog (visible
under Inactifs) and are hidden from Sale product selection: they cannot be newly added to a
Sale, while existing Sale snapshots remain untouched. State changes never touch any other
domain.

## 7. Permanent Deletion

`Supprimer définitivement` removes the catalog record only (mistakes/duplicates). Deletion
never cascades into Sales: historical SaleItems keep their own `productName` / `unitPrice`
snapshot and remain readable after the Product disappears.

## 8. Sales Relationship

Sales reference Products through the stable `productId` and snapshot `productName` and
`unitPrice` at completion time, so catalog edits never rewrite historical purchases. Sale
drafts read live Product values (name, price, image, stock) for presentation only. The Product
model itself stores no sales count, revenue, or purchase history — see `docs/domain/SALES.md`.

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
`stockQuantity` or creates stock movement. Inside a Sale draft, the same lookup adds an active
Product to the draft; stock still changes only at Sale completion.

## 11. Product Photo Semantics

A Product has ONE authoritative photo for the whole Business, identified by the Product `id` —
never by its barcode, a SKU or its name. Two devices showing the same Product id end up showing
the same photo.

- `photoPath` is that photo: the stable object path of the image in the private Business media
  storage, `<business_id>/products/<product_id>/<photo_id>.<jpg|png>` (the same `business-media`
  bucket and owner-only rules as Client photos, `docs/architecture/CLOUD_SYNC.md` §23). Never a
  device file URI, a signed URL or image bytes. It is synced with the PRODUCT aggregate. Every new
  photo is a NEW object, so the path changes with the photo.
- `imageUri` is LEGACY: a device-local file under `<documents>/products/` written by builds that
  predate `photoPath`. It is never synced and NEVER uploaded — two devices may hold two different
  legacy images for the same Product, and promoting either would be an arbitrary race. It survives
  (untouched by schema v14) only as a display-only fallback on the device that holds it.

Display precedence — ONE rule, `selectProductImageUri`, used by every Product image (catalogue,
details, form, Sale rows):

```text
photoPath set   → the shared photo (the device's cached copy, or one download); while it cannot
                  be had, the no-photo placeholder — a legacy image NEVER overrides it
no photoPath    → the legacy local `imageUri`, if this device has one
neither         → the no-photo placeholder
```

Photo acquisition is draft-owned and shared with Client photos (`PhotoSourceFlow`: camera
permission on « Prendre une photo », the system picker, the photo camera). Selecting, taking,
processing (optional Apple Vision cut-out) or removing a photo only changes the form draft
(`current` / `new` / `removed`). Cancel changes nothing. Save applies an explicit change:

```text
new photo  normalize (orientation, ≤ 1080 px longest side, aspect kept, no crop; JPEG 0.85, or PNG
           for a transparent cut-out) → upload a new object → write the Product with its photoPath
           (legacy imageUri cleared) → remove the replaced object and the obsolete legacy file,
           best effort
removal    write the Product without photoPath / imageUri → remove the object and the legacy file,
           best effort
none       both photo fields are kept exactly as they are
```

A photo that cannot be prepared or uploaded (offline, no cloud) refuses the whole Save: nothing is
written, the previous photo stays, and the form keeps its draft with « Impossible d’enregistrer la
photo. ». A failed row write after the upload removes the new object. Deleting a Product removes
its object. A legacy image becomes irrelevant the moment the Product has a shared photo: only an
explicit new photo creates one.

## 12. Non-Goals

Not in this phase: checkout, payments, suppliers, purchase orders, stock-movement history,
cost/margin, VAT, variants, ecommerce, image galleries, several photos per Product, automatic
migration of legacy local images. Completed Sales, their stock decrement, and Client purchase history live
in the Sale domain (`docs/domain/SALES.md`).
