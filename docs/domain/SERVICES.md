# BeautIzzy — Service Domain

## 1. Purpose

This document defines the Service catalog rules of BeautIzzy.

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
Dose Supplémentaire, Soin Classique, Soin Profond, Traitement SOS. This pilot catalogue is
DEVELOPMENT data only (`src/providers/development-seed.ts`, the `__DEV__` reset): the production
first-run seed is empty (PERSISTENCE.md §5), so a real install never receives it. Once persisted,
the catalog is the only source: a classification change in the legacy adapters affects a
development reset only. The application never reclassifies rendered Services dynamically.

### Onboarding starter services

The ONLY automatic catalogue entries of a real install are the starter prestations the new
onboarding proposes (`src/features/business/setup/starter-services.ts`): a designed base per primary
activity (Coiffure, Onglerie, Esthétique, Cils & sourcils, Maquillage, Barbier, Bien-être — nothing
for Autre), shown ONCE, right after a NEW Business was created, each kept or removed before anything
is written. Only the kept ones are inserted, through the normal Service store, with fresh UUIDs, at
the neutral price `0` the professional sets afterwards; they sync like hand-made prestations. The
onboarding step is the eligibility boundary: there is NO « catalogue empty → seed » rule, so an
existing Business (including one being restored on a new, temporarily empty device) never receives
them. Types follow §3: a SERVICE is one staff-required phase; only work where the client genuinely
waits with something in place is a TECHNIQUE (Application → Temps de pose → Finition), whatever the
profession: Coloration, Balayage, Patine and Soin for Coiffure, « Soin du visage » (the mask) for
Esthétique. Several steps alone never make a Technique — every Onglerie starter (« Pose complète
gel », « Remplissage gel », « Semi-permanent mains / pieds », « Dépose », « Nail art », « Réparation
d’un ongle ») is one SERVICE duration. Presets stay short (at most eight), with 5-minute durations
between 15 min and 2 h, and are only proposed for the profession the new Business chose.

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

The provider hydrates from the persisted snapshot (PERSISTENCE.md §6) — the legacy import only ever reaches a database through the development seed; the raw legacy module state is never mutated.

`deleteService(serviceId)` removes the exact record immutably; the raw legacy sources and the
session seed factory are never mutated by any catalog operation.

---

## 7. Editing and Identity

Editing a catalog Service updates it immutably:

- `id` and `businessId` never change, including renames;
- phase IDs stay stable across edits and reorders;
- the type (`SERVICE` vs `TECHNIQUE`) never changes in V1.

Catalog edits never cascade into `AppointmentItem` snapshots (see `docs/domain/APPOINTMENTS.md §12`).

### 7.1 Official Timing Is Edited Here Only

`Prestations & tarifs` is the ONLY place that modifies official Service timing and price defaults.
Appointment creation, Appointment editing, and Appointment Details adjust the Appointment snapshot only
(5-minute steps, 0 allowed) and never write `Service`, `ServicePhase`, or `ServiceCatalogProvider`.
Catalog validation (positive phase durations) applies to the catalog alone: an Appointment phase may be
0 minutes independently of it.

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

Not in this phase: categories, descriptions, options/variants, discounts, packages, taxes,
online-booking configuration, staff-specific pricing, service drag ordering. §10 records the
smallest safe follow-up for the three the multi-profession work may need.

---

## 10. One Catalogue for Every Profession

The catalogue is generic in the data model and specific in the user experience
(`docs/domain/PROFESSIONS.md`). ONE `Service` model, ONE `Prestations & tarifs` editor, ONE
Services / Techniques taxonomy and ONE Appointment snapshot serve every profession; nothing reads
the Business activity except the two presentation touches below.

### 10.1 What the model already represents

A free name, a price (≥ 0, decimals allowed), a single duration (SERVICE) or ordered phases
(TECHNIQUE) and the active flag represent the three reference catalogues as they are:

```text
HAIRDRESSING   Coupe femme · Brushing · Coloration · Balayage · Patine
NAILS          Pose complète gel · Remplissage gel · Semi-permanent mains · Semi-permanent pieds
               Dépose · Nail art · Réparation d’un ongle
ESTHETICS      Soin du visage · Épilation sourcils · Épilation jambes · Soin du corps · Beauté du regard
```

The professional names her prestations freely; no vocabulary is enforced and nothing is renamed.
Appointment snapshots (`AppointmentItem`) keep working unchanged: they copy the name, type, price
and phases at booking time, whatever the profession.

### 10.2 Services vs Techniques across professions

The distinction is about the CLIENT WAITING, never about hair colour: a TECHNIQUE is a prestation
with a « Temps de pose » (colour, mask, tint…), a SERVICE is one duration during which the
professional stays with the client. A multi-step prestation without unattended time — a gel set,
a wax, a cut — is therefore a SERVICE, for every profession; the Technique chooser says so
(« Plusieurs phases, dont un temps de pose. »). The pose requirement of §3 and §8 is unchanged:
relaxing it (a Technique with no pose) would be a product decision, not a profession need. Category
colours stay the validated violet (Service) / azure (Technique).

### 10.3 The two profession-aware presentation touches

- **Family pictogram** (`src/features/services/prestation-visual.ts`): the ordered keyword table
  keeps every hairdressing family first and unchanged (Coupe, Brushing, Balayage, Couleur, Soin,
  Chignon, Dose, Gloss), then recognises `NAILS` (ongle, nail, gel, semi, remplissage, dépose,
  manucure, pédicure, vernis, capsule, main, pied — never « pose » alone, which also starts hair
  wording), `HAIR_REMOVAL` (épilation, cire), `LASHES_BROWS` (cil, sourcil, regard, rehaussement) and
  `BODY` (massage, modelage, gommage, corps). « Soin » stays the care family for every profession.
  The name alone decides — the Business activity is never read — and the type fallbacks (scissors /
  sparkles) are unchanged.
- **Name placeholder** (`src/features/services/editor/name-placeholder.ts`): the empty « Nom »
  field suggests an example of the Business activity (« Ex. Coupe », « Ex. Pose complète gel »,
  « Ex. Soin du visage », one per stored activity). A hint only: never a default, a rule or a
  stored value.

### 10.4 Not represented yet — smallest safe follow-ups

None of these is needed to represent the three reference catalogues; each needs a persisted field,
so none is added speculatively. If a pilot requires one, the follow-up is the same shape every time:
an additive, nullable local column (forward migration, `docs/architecture/PERSISTENCE.md`), the
same nullable column remotely (hand-applied Supabase migration), the field in the `SERVICE` sync
payload, then the editor.

- **Free categories** — the catalogue has no user-defined category: the only grouping is the type
  taxonomy (`buildCatalogSections`), plus search. Follow-up: `services.category TEXT NULL` (free
  text, no table), grouped under the type sections when present.
- **Description** — no optional description exists on `Service`. Follow-up:
  `services.description TEXT NULL`, trimmed, blank = none (the `clients.notes` pattern), shown on
  Prestation Details and in the editor only.
- **Online-bookable** — no property says whether a prestation may be booked online (the future
  nail pilot needs some bookable, some not). Follow-up for the online-booking MVP:
  `services.online_bookable INTEGER NULL CHECK (0, 1)`, absent = NOT bookable (safe for every
  existing record), one switch in the editor, read ONLY by the future availability layer
  (`CLAUDE.md` §17) — never by manual scheduling.
