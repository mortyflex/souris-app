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
NAILS          COMING_SOON    announced — « Bientôt disponible » — never selectable
ESTHETICS      COMING_SOON    announced — « Bientôt disponible » — never selectable
```

`AVAILABLE` means the profession's workflows were validated with a real professional. A
`COMING_SOON` profession is announced so the professional knows BeautIzzy is coming for them; it
becomes `AVAILABLE` only by an explicit product decision, once its workflows (catalogue, services,
online booking where needed) have been validated. An identifier or a label existing never makes a
profession supported.

The five other stored identifiers (`BARBER`, `LASHES_BROWS`, `MAKEUP`, `WELLNESS`, `OTHER`) remain
valid stored values with their labels and pictograms; they are not offered to a new Business.

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
previews the same five steps for EVERY profession of `PROFESSIONS`, the announced ones included,
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
created as single-duration prestations, with the phased model as an advanced option. Availability
is unchanged: NAILS and ESTHETICS stay « Bientôt disponible ».

## 7. Step 4 — the appointment experience (October 2026)

The appointment flows (« Nouveau rendez-vous », « Modifier le rendez-vous », Details, the
estimation picker) follow the catalogue organisation through ONE presentation table,
`getAppointmentWording` (`src/features/services/catalogue-presentation.ts`). Nothing is stored,
synced or read by a scheduling rule; enum values, snapshots and timeline calculation are unchanged.

```text
                      SERVICE_TYPES (hairdressing, …)    CATEGORIES (NAILS, ESTHETICS)
picker                Services / Techniques segment      the professional's categories, « Sans catégorie »
card palette          violet Service, azure Technique    one palette, the type never shown
spoken type           « Service » / « Technique »        none
unattended time       « Temps de pose », « de pose »     « Temps d’attente », « d’attente »
```

« Temps d’attente » says the client waits; it never claims the professional is free (a cure, a
mask) and avoids « pose », which names the work itself in nails (« Pose complète gel »). Stored
phase names are always shown as stored.

A prestation with a description offers it from its picker card (an « i », and a VoiceOver action)
in a read-only sheet titled « Description de la prestation »: catalogue information, never copied
into the Appointment and never confused with its notes. The card tap still selects.

## 8. Not implemented yet

- the online-booking visibility of a prestation (designed in SERVICES.md §12);
- profession-specific terminology beyond the touches above (the catalogue list and editor still
  word an unattended phase « Temps de pose »);
- any catalogue migration or renaming;
- making `NAILS` or `ESTHETICS` available.

Do not build these before their dedicated phase. The profession definition is the one place to
extend when they come; nothing speculative is modelled in it today.
