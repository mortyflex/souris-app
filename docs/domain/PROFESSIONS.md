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

---

## 5. Step 2 — the catalogue (October 2026)

`docs/domain/SERVICES.md` §10 records how ONE catalogue serves every profession: the `Service`
model, the editor, the Services / Techniques taxonomy and the Appointment snapshots are shared and
unchanged; the Business activity only personalises the starter prestations, the family pictogram
keywords and the example of the empty « Nom » field. No column, no sync field and no migration were
added.

## 6. Not implemented yet

- free service categories, descriptions and the online-bookable property (the smallest safe
  follow-up of each: SERVICES.md §10.4);
- profession-specific terminology beyond the touches above;
- any catalogue migration or renaming;
- making `NAILS` or `ESTHETICS` available.

Do not build these before their dedicated phase. The profession definition is the one place to
extend when they come; nothing speculative is modelled in it today.
