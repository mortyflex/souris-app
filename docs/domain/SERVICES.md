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
├── active      current catalog availability
├── categoryId? a ServiceCategory id (§11) — absent = « Sans catégorie »
└── description? optional plain text (§11) — absent = none

ServicePhase
├── id            stable across edit/reorder
├── name
├── durationMinutes
└── requiresStaff
```

The `Service` model has no colour, options, variants, or aggregate duration. Its optional
category and description (§11) are catalogue metadata: they never reach an `AppointmentItem`
snapshot, the timeline, a price or availability. Total duration is always derived from ordered phases. Phase order is array order — no separate order property exists.

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

A processing phase has ONE canonical user-facing identity: `Temps de pose` (`Temps d’attente` in
the unified catalogue of nails, esthetics and wellness — PROFESSIONS.md §8). Its name is never
user-entered — the editor shows only `Durée` and `Type` for it; a phase that becomes unattended
receives the canonical name, and a save keeps the name an unattended phase already has (a stored
name is never rewritten). Switching an active phase to processing keeps the previous draft name only in
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
waits with something in place is a TECHNIQUE (a worked phase → the waiting phase → a worked
phase), whatever the profession: Coloration, Balayage, Patine and Soin for Coiffure (Application →
Temps de pose → Finition), « Soin du visage avec masque » for Esthétique (Nettoyage et pose du
masque 20 min → Temps d’attente 15 min → Retrait du masque et finition 25 min), « Dépose par
dissolution » for Onglerie (Préparation et pose des papillotes 10 min → Temps d’attente 10 min →
Retrait et finition 15 min). Their waiting phase is staff-free only because the example genuinely
lets the professional see someone else (the wraps soak, the mask sets). Several steps alone never
make a Technique — every other Onglerie starter (« Pose complète gel », « Remplissage gel »,
« Semi-permanent mains / pieds », « Dépose », « Nail art », « Réparation d’un ongle ») is one
SERVICE duration. Starters only reach a NEW Business; no existing catalogue changes. Presets stay short (at most eight), with 5-minute durations
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

Not in this phase: options/variants, discounts, packages, taxes, online-booking configuration,
staff-specific pricing, service drag ordering. Categories and descriptions arrived with
multi-profession Step 3 (§11); the online-booking visibility is designed, not built (§12).

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
               Dépose · Dépose par dissolution · Nail art · Réparation d’un ongle
ESTHETICS      Soin du visage avec masque · Épilation sourcils · Épilation jambes · Soin du corps · Beauté du regard
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
  opens with three body-area families that no hairdressing prestation names — `FEET` (pied,
  pédicure, orteil), `FACE` (visage), `BODY` (corps) — then keeps every hairdressing family in its
  original order (Coupe, Brushing, Balayage, Couleur, Soin, Chignon, Dose, Gloss), then the nail
  acts before the nail material: `NAIL_ART` (art, décor, strass, modèle), `NAIL_REMOVAL` (dépose,
  retrait), `NAIL_REPAIR` (réparation), then `NAILS` (ongle, nail, gel, semi, remplissage, manucure,
  vernis, capsule, main — never « pose » alone, which also starts hair wording), `HAIR_REMOVAL`
  (épilation, cire), `LASHES_BROWS` (cil, sourcil, regard, rehaussement) and `BODY` (massage,
  modelage, gommage). « Soin » stays the care family unless a body area is named (« Soin du
  visage » is a face). A recognised name always decides. When it tells nothing, the unified
  catalogue (nails, esthetics) reads the prestation's own category name through the same table,
  then falls back on the profession's glyph (the hand, the care bubbles) — PROFESSIONS.md §9; the
  Services / Techniques experience keeps the type fallbacks (scissors / sparkles) unchanged. A professional category reads through the same
  table (`getCategoryVisual`, Catégories screen), with a neutral grid as its fallback.
- **Name placeholder** (`src/features/services/editor/name-placeholder.ts`): the empty « Nom »
  field suggests an example of the Business activity (« Ex. Coupe », « Ex. Pose complète gel »,
  « Ex. Soin du visage », one per stored activity). A hint only: never a default, a rule or a
  stored value.

### 10.4 Not represented yet — smallest safe follow-ups (Step 2; categories and descriptions done in §11)

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

---

## 11. Categories, descriptions and the profession-aware catalogue (multi-profession Step 3, October 2026)

### 11.1 Model

```text
ServiceCategory                         src/domain/services/categories.ts
├── id          stable (UUID); Services reference it — never the mutable name
├── businessId  ownership
├── name        required, one line, trimmed (≤ 60)
├── description? optional plain text (the Service description rule)
└── position    the professional's order (0…n-1; ties by id)

Service.categoryId?   absent = « Sans catégorie »; an id no category carries reads the same
Service.description?  src/domain/services/description.ts — trimmed, blank = none, \r\n → \n,
                      line breaks kept, ≤ 1000, plain text never interpreted as markup
```

- Categories are FREE: the UI shows the profession's example as a placeholder, never a vocabulary,
  and BeautIzzy never creates a category — not for an existing Business, not at onboarding.
- Renaming moves nothing (the id is the reference). Reordering writes only the moved categories.
- Deleting a category never deletes a Service: in ONE transaction its Services become
  uncategorized (each a SERVICE upsert) and the category is removed (SERVICE_CATEGORY delete). The
  confirmation says so.
- The reference is metadata, never a constraint (no foreign key, locally or remotely): a Service
  pushed before its category, or naming a category removed on another device, simply reads as
  « Sans catégorie ».
- Snapshots are untouched: `createAppointmentItemSnapshot` copies name, type, price and phases
  only; category and description stay in the catalogue (tested).

### 11.2 Profession-aware presentation (`src/features/services/catalogue-presentation.ts`)

ONE editor, ONE catalogue screen, ONE picker; a small table decides how they read.

```text
SERVICE_TYPES   HAIRDRESSING (and BARBER, LASHES_BROWS, MAKEUP, OTHER — every
                existing Business keeps exactly what it had)
                Services / Techniques segment and type chooser, unchanged. « Catégorie » and
                « Description de la prestation (facultative) » come after the timing.
                Categories, once assigned, only subdivide a segment.
CATEGORIES      NAILS, ESTHETICS, WELLNESS (since its opening to the pilots, October 2026 —
                PROFESSIONS.md §10)
                One « Prestations » list grouped by the professional's categories, then
                « Sans catégorie », then « Inactives »; search covers everything. Creation opens
                the form directly as a single-duration prestation: Nom → Catégorie →
                Description de la prestation → Durée → Prix. The phased model (internally TECHNIQUE) is the
                creation-only option « Plusieurs phases avec temps d’attente », explained by what
                it does (the client waits without you and you can take someone else). The words
                « Service » / « Technique » are never shown; Prestation Details names the
                structure only for a phased prestation (« En plusieurs phases »).
```

The appointment prestation picker (creation, editing, estimation) follows the same organisation:
category-titled grids for the unified catalogue, the established segment otherwise. Cards,
selection and snapshots are unchanged.

A nail technique is not an internal TECHNIQUE: a gel application is one SERVICE duration; the
phased option is only for real waiting time where the professional is free. The SERVICE /
TECHNIQUE rules of §3 and §8 are unchanged, including the required waiting phase of a phased
prestation. Since multi-profession Step 5 a NEW waiting phase of the unified catalogue is named
« Temps d’attente », and a stored « Temps de pose » there reads « Temps d’attente » without being
rewritten (PROFESSIONS.md §8).

### 11.3 Management

« Prestations & tarifs › Catégories » (`src/features/services/categories/`) is THE place where
categories are managed; the Prestation form only chooses among them (« Aucune » first) and, when
there is none yet, says where they are created.

- One grouped list with the app's list management: the shared drag handle reorders (press and
  hold, drag, release — `SortableRowList`, its drag haptics and its adjustable accessibility
  actions « Déplacer vers le haut / vers le bas »); a swipe to the right deletes (`SwipeToDeleteRow`,
  its one-time hint).
- A tap edits the row in place: « Nom de la catégorie », « Description de la catégorie
  (facultative) », « Enregistrer », « Supprimer » (the gesture-free deletion).
- Deletion always asks first and says that the prestations become « Sans catégorie »; no
  prestation, appointment or price is deleted. A swiped row closes again until the confirmation.
- Its « + » opens the inline « Nouvelle catégorie » card at the top of the list directly (once:
  pressing it again keeps the card). Cancelling closes the card and stays on the screen.
- The « + » of Prestations & tarifs opens the shared floating menu: « Nouvelle prestation » (the
  Prestation form) and « Nouvelle catégorie » (this screen, the card already open —
  `/services/categories?create=1`).

Every mutation passes the business write guard.

### 11.4 Persistence and sync

Schema v17 (`docs/architecture/PERSISTENCE.md`), the `SERVICE_CATEGORY` aggregate and the two
SERVICE keys (`docs/architecture/CLOUD_SYNC.md` §27), the hand-applied Supabase migration
`20261010120000_add_service_categories_and_descriptions.sql` (`supabase/README.md`).

---

## 12. Online booking visibility — design only (NOT implemented)

> Sprint 3B (November 2026): the BOOKABLE opt-in exists server-side only, as
> `business_bookable_services (business_id, service_id)` — absent = not bookable — read only by
> the availability engine (`docs/architecture/ONLINE_BOOKING.md` §8.3). The synced column below
> was NOT added: it needs a SERVICE sync change that the sprint excluded. Which representation
> is final, and the professional's editor, are open decisions.

The future online-booking MVP needs to say, per prestation, whether a customer may see it and
book it. Nothing below exists yet; it is recorded so the field is added once, correctly.

```text
ServiceOnlineVisibility = 'PRIVATE' | 'VISIBLE' | 'BOOKABLE'
  PRIVATE    internal only — never published (the DEFAULT, and the meaning of NULL)
  VISIBLE    shown on the public page with its description and price, not bookable online
  BOOKABLE   shown and bookable through the availability layer
```

Smallest safe integration, when the booking phase is requested:

1. Domain: `Service.onlineVisibility?: ServiceOnlineVisibility`, absent = `PRIVATE`; read ONLY by
   the future availability / publication layer (`CLAUDE.md` §17) — never by manual scheduling.
2. Local: `services.online_visibility TEXT NULL CHECK (… IN ('PRIVATE','VISIBLE','BOOKABLE'))`,
   forward migration, every row NULL.
3. Remote: the same nullable column + CHECK; the SERVICE push keeps the stored value when the key
   is absent (the §27 rule); the build that writes it defers until a pull proves the column (the
   same readiness proof, with its own key in the pull).
4. Public read path: a dedicated, read-only, owner-independent RPC or view exposing ONLY
   `VISIBLE`/`BOOKABLE` services of a published Business — never the owner sync RPCs, never a
   `PRIVATE` row, never client data.
5. Editor: one segmented choice in the unified catalogue's « Planification avancée », defaulting
   to « Privée ».

Categories and descriptions are already shaped for it: a public page groups by category and shows
descriptions as plain text. Not designed here: service variants / options (`serviceOptionId`
exists on snapshots, no catalogue model), add-on prestations, deposits for online bookings.
