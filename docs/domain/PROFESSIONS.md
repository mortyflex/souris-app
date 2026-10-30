# Professions

BeautIzzy is built for several appointment-based beauty professions. This document records how a
profession is represented, which ones are offered, and what an existing Business may rely on.

Reference implementation: `src/domain/business/professions.ts`.

---

## 1. One vocabulary

A profession IS the Business's primary activity, `BusinessActivityType`
(`src/domain/business/types.ts`): the stable, storage-facing vocabulary
`HAIRDRESSING | BARBER | NAILS | ESTHETICS | LASHES_BROWS | MAKEUP | WELLNESS | OTHER`, stored as
plain text remotely (`businesses.activity_type`) and locally (`business_profile.activity_type`).

There is no second identifier, no profession table and no migration. French labels stay
presentation only (`src/features/business/presentation.ts`): Coiffure, Barbier, Onglerie,
Esthétique, Cils & sourcils, Maquillage, Bien-être, Autre.

---

## 2. Availability

`PROFESSIONS` lists the professions BeautIzzy is prepared for, in product order, each with its
availability:

```text
HAIRDRESSING   AVAILABLE      the validated Production workflow (a real hairdresser)
NAILS          AVAILABLE      opened to the pilot professionals (October 2026)
ESTHETICS      AVAILABLE      opened to the pilot professionals (October 2026)
WELLNESS       AVAILABLE      opened to the pilot professionals (October 2026) — Bien-être
```

`AVAILABLE` means a NEW Business may be created with it. Hairdressing is validated in Production;
nail services, esthetics and wellness were opened by an explicit product decision so that real
pilot professionals — a nail technician, an esthetician, a wellness massage practitioner — can
set up their business on their own (`docs/product/LAUNCH_ROADMAP.md`, milestone M1). Their
workflows are validated WITH them, during the pilot.

`COMING_SOON` stays in the model for the next professions: announced « Bientôt disponible », never
selectable. No profession is announced today. An identifier or a label existing never makes a
profession supported.

The four other stored identifiers (`BARBER`, `LASHES_BROWS`, `MAKEUP`, `OTHER`) remain valid stored
values with their labels and pictograms; they are not offered to a new Business.

ONE rule decides what a new Business may be created with: `isProfessionAvailable`. It is applied in
the setup form (`validateBusinessForm` / `buildBusinessSetupInput`) and reflected by the onboarding
cards. Never duplicate the comparison in a screen.

---

## 3. Existing Businesses are never re-checked

Availability is a rule about NEW Businesses only.

- A Business created with any stored value — including one onboarding no longer offers — resolves,
  binds, opens and displays its label exactly as before.
- The app never writes the activity back; a value this build does not know still reads as `OTHER`
  at the boundaries (`toBusinessActivityType`), as documented in `docs/architecture/AUTH.md` §2.
- Nothing about appointments, clients, services, products, sales, cash register, communications or
  subscriptions reads the availability.
- The onboarding starter prestations (`docs/domain/SERVICES.md`) keep a designed base per stored
  activity; only the base of the chosen — hence available — profession is ever proposed.

---

## 4. Onboarding

Step 1 of business setup shows one option card per profession of `PROFESSIONS`
(`src/features/business/setup/activity-options.ts`, `components/ActivityOptionList.tsx`): the
French label, one short supporting line, the pictogram, and either the selection mark or the
« Bientôt disponible » badge. An announced profession's card is disabled and announces both states
to assistive technology; pressing it selects nothing. `Continuer` stays disabled until an available
profession is chosen. Design: `docs/design/DESIGN_OVERRIDES.md` §44.

The developer Playground (`docs/architecture/ARCHITECTURE.md` §4, development builds on Staging only)
previews the same five steps for EVERY profession of `PROFESSIONS`, an announced one included,
through the explicit `ActivityAcceptance = 'every-profession'` of the setup form and the
`comingSoonSelectable` opt-in of the cards. Its actions never create a Business: the availability of
the real onboarding is unchanged by it, and a stored activity can never come from a preview.

The Playground also explores the application for every profession of `PROFESSIONS` on a fictional
in-memory dataset (`docs/product/PLAYGROUND.md`, Step B1). The demo Business carries the profession
as its stored activity inside memory only; no Business is created or bound, and `isProfessionAvailable`
is never consulted or changed by it.

---

## 5. Step 2 — the catalogue (October 2026)

`docs/domain/SERVICES.md` §10 records how ONE catalogue serves every profession: the `Service`
model, the editor, the Services / Techniques taxonomy and the Appointment snapshots are shared and
unchanged; the Business activity only personalises the starter prestations, the family pictogram
keywords and the example of the empty « Nom » field. No column, no sync field and no migration were
added.

## 6. Step 3 — the professional catalogue (October 2026)

`docs/domain/SERVICES.md` §11: business-scoped categories and optional descriptions on real
Services (schema v17, the `SERVICE_CATEGORY` aggregate), and a profession-aware presentation
(`src/features/services/catalogue-presentation.ts`): HAIRDRESSING keeps Services / Techniques;
NAILS and ESTHETICS read one « Prestations » catalogue grouped by the professional's categories,
created as single-duration prestations, with the phased model as an advanced option. (Availability
was unchanged by this step; see §10 for the pilot opening, which also moved WELLNESS here.)

## 7. Step 4 — the appointment experience (October 2026)

The appointment flows (« Nouveau rendez-vous », « Modifier le rendez-vous », Details, the
estimation picker) follow the catalogue organisation through ONE presentation table,
`getAppointmentWording` (`src/features/services/catalogue-presentation.ts`). Nothing is stored,
synced or read by a scheduling rule; enum values, snapshots and timeline calculation are unchanged.

```text
                      SERVICE_TYPES (hairdressing, …)    CATEGORIES (NAILS, ESTHETICS, WELLNESS)
picker                Services / Techniques segment      the professional's categories, « Sans catégorie »
card palette          violet Service, azure Technique    one palette, the type never shown
spoken type           « Service » / « Technique »        none
unattended time       « Temps de pose », « de pose »     « Temps d’attente », « d’attente »
```

« Temps d’attente » says the client waits; it never claims the professional is free (a cure, a
mask) and avoids « pose », which names the work itself in nails (« Pose complète gel »). How a
stored phase name is shown: §8.

A prestation with a description offers it from its picker card (an « i », and a VoiceOver action)
in a read-only sheet titled « Description de la prestation »: catalogue information, never copied
into the Appointment and never confused with its notes. The card tap still selects.

## 8. Step 5 — the name of an unattended phase (October 2026)

The catalogue (« Prestations & tarifs » rows), the prestation editor (its phases, their type
choice and spoken labels, the « au moins un » message, the Details) and the onboarding starters
now use the same words as the appointment flows (§7): « Temps de pose » for SERVICE_TYPES, « Temps
d’attente » for CATEGORIES. « Temps actif » is unchanged everywhere.

- New records: the editor gives a NEW unattended phase `getWaitingPhaseName(organization)` —
  « Temps de pose » as before, « Temps d’attente » in the unified catalogue — and stores it like
  any phase name, so the Appointment snapshot carries it. The esthetics starter facial
  (Application → Temps d’attente → Finition) follows the same rule.
- Existing records are never renamed: no migration, and a save keeps the name an unattended phase
  already has (the editor used to replace it with « Temps de pose »). Snapshots are never touched.
- Display: `getPhaseDisplayName`. The editor has never let anyone type the name of an unattended
  phase, so an UNATTENDED phase named exactly « Temps de pose » is the app's own former default; the
  unified catalogue shows it as « Temps d’attente » — catalogue, editor, Résumé, Modifier,
  Details. Any other name (a worked phase, a different unattended name from an import or sync)
  is the professional's and is shown exactly as stored. SERVICE_TYPES shows every name as stored.
- Never inferred from words: `requiresStaff` decides what a phase is; a prestation's name
  (« Pose complète gel ») is never read as a waiting phase.

Ambiguity, chosen least-destructively: a stored « Temps de pose » cannot be told apart from a
professional who would have meant those exact words for an unattended phase — the editor never
allowed typing it, so it is read as the default. It is only a reading; the stored value stays.

## 9. Realistic workflow fixes (October 2026)

Three corrections after realistic nail and esthetics workflows in the Playground.

- **Long names.** In the appointment Details (prestation rows and their phases) and the Résumé /
  Modifier cards (name and phase timing rows), a prestation or phase name wraps on two lines
  instead of being cut after one; the time, the price, the duration stepper and the chevron keep
  their width. The catalogue rows and picker cards already wrapped.
- **Prestation icons** (`getPrestationFamily(prestation, context)`, presentation only, nothing
  stored). Deterministic priority:
  1. the prestation's name, through the keyword table (unchanged mappings);
  2. CATEGORIES only: its professional category's CURRENT name, through the same table — the
     category is found by id among the Business's categories and only if it belongs to the same
     Business (`findPrestationCategory`); a missing, deleted or foreign category is ignored;
  3. CATEGORIES only: the profession's glyph — the hand (NAILS), the care bubbles (ESTHETICS);
  4. otherwise (hairdressing and every other stored activity) the type fallback, scissors /
     sparkles, exactly as before — the category is not read there.
  « French classique » in « Nail art et modèles » → the palette. Applied in Prestations & tarifs and
  Prestation Details; the onboarding starters have no category and all match by name.
- **Multi-phase examples.** NAILS gains « Dépose par dissolution » (10 min active, 10 min Temps
  d’attente, 15 min active — 35 min); the ESTHETICS facial becomes « Soin du visage avec masque »
  (20 + 15 + 25 = 60 min). The waiting phases are staff-free because the professional genuinely can
  see someone else. Starters reach NEW Businesses only. The Playground prices them (20 €, 65 €),
  files the removal under « Déposes », describes the waiting in the description and books both
  today (nails 12:00; esthetics 9:30, with a brow wax inside the mask's waiting time, 9:50).

## 10. Pilot opening (October 2026)

Milestone M1 of `docs/product/LAUNCH_ROADMAP.md`. Code: `PROFESSIONS`, the WELLNESS card line
(`activity-options.ts`), the WELLNESS presentation and glyph fallback, the reviewed starters.

- **Availability.** NAILS, ESTHETICS and WELLNESS become `AVAILABLE`. HAIRDRESSING is unchanged.
  Nothing is stored or migrated: the identifiers already existed (`businesses.activity_type` is
  free text, `business_profile.activity_type` too).
- **Wellness reads like nails and esthetics.** `CATEGORIES` organisation: one « Prestations »
  catalogue grouped by the professional's categories, « Temps d’attente », never « Technique » or
  « Temps de pose ». The glyph fallback is the body at rest (`figure.mind.and.body` /
  `self_improvement`), the card line « Massages et modelages bien-être, soins relaxants. », the name
  example « Ex. Massage relaxant ». This changes only how a WELLNESS Business READS — including
  one created before Step 1, when onboarding still offered « Bien-être »: its prestations, phases
  and appointment snapshots are untouched, a stored « Temps de pose » simply reads « Temps
  d’attente » (§8), and no rule changes.
- **Starters.** HAIRDRESSING and NAILS unchanged. ESTHETICS splits waxing by zone (sourcils,
  aisselles, maillot, demi-jambes, jambes complètes — the catalogue has no price variants).
  WELLNESS proposes seven single-duration SERVICES, the length in the name because a massage menu is
  priced by duration: Massage relaxant 30 min / 1 h / 1 h 30, Massage du dos, Massage des pieds,
  Massage aux pierres chaudes, Gommage du corps. Still at 0 €, still for NEW Businesses only.
- **Existing Businesses.** Never re-checked, never routed to onboarding, never given a starter —
  covered by tests for every stored activity (`root-route.test.ts`, `BusinessSessionProvider.test.tsx`).
- **Playground.** A WELLNESS demo, « Espace Bien-être Démo » (`docs/product/PLAYGROUND.md`).

## 11. Not implemented yet

- the online-booking visibility of a prestation (designed in SERVICES.md §12);
- any catalogue migration or renaming;
- starter categories, starter prices set during onboarding, a buffer time between two massages.

Do not build these before their dedicated phase. The profession definition is the one place to
extend when they come; nothing speculative is modelled in it today.
