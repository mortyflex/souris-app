# Souris — Service Domain

## 1. Purpose

This document defines the Service catalog rules of Souris.

Appointment scheduling rules live in `docs/domain/APPOINTMENTS.md`. This document defines the catalog that feeds Appointment selection; it deliberately does not duplicate the full Appointment timeline documentation.

---

## 2. Canonical Model

The canonical catalog model is the framework-independent `Service` / `ServicePhase` defined in the Appointment domain:

```text
Service
├── id          stable, never regenerated on edit
├── businessId  explicit business ownership
├── name
├── type        SERVICE | TECHNIQUE
├── price       plain number, EUR
├── phases[]    ordered ServicePhase values
└── active      current catalog availability

ServicePhase
├── id            stable across edit/reorder
├── name
├── durationMinutes
└── requiresStaff
```

The `Service` model has no category, color, options, variants, or aggregate duration. Total duration is always derived from ordered phases. Phase order is array order — no separate order property exists.

---

## 3. SERVICE vs TECHNIQUE

`SERVICE` — the professional is occupied for the whole duration; it has NO pose. Canonically
represented by one staff-required phase:

```text
Coupe
    Coupe · 45 min · requiresStaff = true
```

The management UI presents this as a single `Durée` field. The professional never edits "phases" for a simple service, and a Service can never acquire a processing phase (the type is immutable).

`TECHNIQUE` — an ordered phase list containing at least one processing phase under the current
product rule:

```text
Application · 30 min · active
Temps de pose · 45 min · processing
Finition · 30 min · active
```

A technique cannot be saved without a `Temps de pose`, and an existing technique cannot save after
losing its final processing phase. The low-level Appointment timeline engine still understands
arbitrary ordered phases and `requiresStaff` — the pose requirement is a catalog creation/validation
rule, not a timeline constraint.

User-facing wording: `Temps actif` (`requiresStaff = true`, professionnelle occupée) and `Temps de pose` (`requiresStaff = false`, professionnelle disponible). The picker sections are `Services` / `Techniques` — the raw enum values are never exposed.

A processing phase has ONE canonical user-facing identity: `Temps de pose`. Its name is never
user-entered — the editor shows only `Durée` and `Type` for it, and saving always records the
canonical name. Switching an active phase to processing keeps the previous draft name only in
form-session state so switching back can restore it; the canonical `Service` model never stores
that temporary name. Switching a processing phase back to active always requires a real name —
an active phase can never silently save as `Temps de pose`.

`requiresStaff` is authoritative: processing is never inferred from names, types, or the word "pose".

---

## 4. Active / Inactive

`active = true` makes a Service selectable for NEW Appointment additions.

`active = false` keeps the Service visible in Prestations & tarifs management but excludes it from new Appointment selection.

Inactivation never touches existing `AppointmentItem` snapshots: historical appointments remain valid and displayed even when their Service is inactive or absent from the catalog.

---

## 4.1 Permanent Deletion

`Supprimer définitivement` removes the catalog record from `ServiceCatalogProvider` immutably. It is a data-correction action (mistake, duplicate, genuinely unwanted record), NOT a lifecycle substitute.

The semantics are strictly catalog-only:

- deletion never deletes or rewrites any Appointment, AppointmentItem, price, name, phase, Agenda timeline, or Client history value;
- retained `AppointmentItem` snapshots keep every booked value and remain renderable after their catalog Service is gone;
- the deleted Service simply disappears from catalog management and can no longer be newly added in Appointment Creation or Editing;
- deletion works for active and inactive services alike — `Désactiver` first is never required;
- unknown ids are a no-op, matching the current session conventions.

`Désactiver` / `Réactiver` remain the recommended non-destructive catalog actions.

---

## 5. Legacy Import Boundary

The two legacy files (`legacy-services.ts`, `legacy-techniques.ts`) are ONE-WAY import sources normalized through pure adapters (`src/features/services/adapters`) into canonical `Service[]`. Categories and colors are legacy metadata that never cross the boundary.

Mapping rules:

- legacy `duration` on a simple service → one staff-required phase;
- legacy technique `duration` → active phase; positive legacy `break` → one `Temps de pose`
  processing phase (`TECHNIQUE`);
- legacy technique `break === 0` → the record is continuous professional-occupied work and is
  normalized as `SERVICE` with a single staff-required phase. No fake zero-minute processing phase
  is created to preserve a legacy source bucket;
- non-numeric prices (e.g. `Multiprix`) are excluded with a diagnostic, never invented as zero;
- `businessId` is supplied at the seed-composition boundary (the development business identity), never invented per service;
- every imported Service is `active: true`.

### Deterministic imported IDs

Imported IDs derive from the stable source identity:

```text
service-{category-slug}-{name-slug}
technique-{category-slug}-{name-slug}
phase: {serviceId}-phase | {serviceId}-active | {serviceId}-processing
```

The same legacy input always normalizes to the same canonical identities. No random generation occurs at import time.

Classification is timing-based, never name-based: legacy source buckets do not dictate the type.
IDs remain stable even where the corrected classification differs from the legacy filename — a
zero-break record keeps its deterministic `technique-…` id while its canonical `type` is `SERVICE`.
Changing ids would unnecessarily break identity stability.

The current fresh-session import yields **8 Services / 8 Techniques**: Services = Brushing 1/2/3,
Coupe Femme / Homme, Chignon, Coupe Brushing 1/2/3; Techniques = Balayage 1/2/3, Couleur Racines,
Dose Supplémentaire, Soin Classique, Soin Profond, Traitement SOS. The catalog is seeded once per
`ServiceCatalogProvider` mount — a development session started before a classification change keeps
its old in-memory seed until a full reload/restart; the application never reclassifies rendered
Services dynamically.

---

## 6. Runtime Catalog

One in-memory session source — `ServiceCatalogProvider` — owns the canonical `Service[]`:

```text
legacy-services ───┐
                   ├── pure adapters ──→ Service[] → ServiceCatalogProvider
legacy-techniques ─┘                                    │
                                        ┌───────────────┴───────────────┐
                                        ↓                               ↓
                                Prestations & tarifs              Appointment flows
```

It exposes only what this phase needs: `services`, `activeServices`, `getServiceById`, `addService`, `updateService`, `setServiceActive`. New runtime identities follow the existing session-ID pattern (`service-{timestamp}-{sequence}`).

The provider seeds a fresh, deep-copied import on every session start; the raw legacy module state is never mutated.

`deleteService(serviceId)` removes the exact record immutably; the raw legacy sources and the
session seed factory are never mutated by any catalog operation.

---

## 7. Editing and Identity

Editing a catalog Service updates it immutably:

- `id` and `businessId` never change, including renames;
- phase IDs stay stable across edits and reorders;
- the type (`SERVICE` vs `TECHNIQUE`) never changes in V1.

Catalog edits never cascade into `AppointmentItem` snapshots (see `docs/domain/APPOINTMENTS.md §12`).

### 7.1 Defaults Adjusted During NEW Appointment Creation

Service defaults may also be adjusted during NEW Appointment Creation (price and phase durations, from the
Résumé step's expanded cards). These adjustments:

- live in the creation draft — nothing is written to the catalog on keystrokes;
- are committed to `ServiceCatalogProvider` only when Appointment creation succeeds, using the same stable
  Service id and phase ids/order (`updateService`, never a new record);
- are dropped entirely when creation is abandoned, cancelled, or the modified Service is deselected;
- never retroactively affect existing AppointmentItem snapshots.

Existing Appointment EDITING remains snapshot-specific and never writes the catalog.

---

## 8. Validation

Service form rules:

- name non-empty;
- price: finite, >= 0 (`42`, `42,5`, `42,50`);
- simple duration: positive integer minutes;
- SERVICE: exactly one staff-required phase, never a processing phase (the UI never exposes phases for it);
- TECHNIQUE: at least one phase; each phase has a non-empty name (active) and a positive integer duration;
- TECHNIQUE: at least one processing phase — a technique with no `Temps de pose` is invalid, and removing/changing away the final processing phase blocks saving. The type never converts automatically.

---

## 9. Non-Goals

Not in this phase: persistence, categories, options/variants, discounts, packages, taxes, online-booking configuration, staff-specific pricing, service drag ordering.
