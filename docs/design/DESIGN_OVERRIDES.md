# Souris — Design Overrides

This document records deliberate product/design decisions that override the exported visual reference.

The original design export under `docs/design/reference-export/` must remain unchanged.

When an implementation detail conflicts with this document, this document takes precedence over the exported HTML/CSS/JS reference.

---

## 1. Existing Service — Read Mode Actions

The exported `Prestations` reference currently shows:

- `Fermer`
- `Enregistrer`

for an already-existing service.

Do NOT reproduce this behavior.

An existing service initially opens in read mode.

Primary actions:

- `Modifier`
- `Supprimer`

### Modifier

`Modifier` switches the service screen into edit mode.

### Supprimer

`Supprimer` is a destructive action.

It must not immediately delete the service.

A destructive confirmation must be shown before deletion.

Suggested French copy:

**Supprimer cette prestation ?**

Cette action est définitive.

Actions:

- `Annuler`
- `Supprimer`

Services & Pricing V1 keeps `Modifier`, adds `Désactiver` / `Réactiver`, and replaces the
exported destructive primary with a tertiary `Supprimer définitivement` — see §9.

---

## 2. Existing Service — Edit Mode Actions

After the professional explicitly enters edit mode, the actions become:

- `Annuler`
- `Enregistrer les modifications`

`Annuler` discards unsaved edits and returns to read mode.

`Enregistrer les modifications` persists the current edits and returns to read mode.

Do not use the generic label:

- `Enregistrer`

when editing an existing service if the more explicit wording fits the layout.

---

## 3. Source-of-Truth Priority

For visual implementation, use the following priority:

1. explicit current product/task instructions;
2. `CLAUDE.md`;
3. approved product/domain documentation;
4. this `DESIGN_OVERRIDES.md`;
5. `DESIGN.md`;
6. `DESIGN-HANDOFF.md`;
7. exported HTML/CSS/JS references.

The HTML/CSS/JS export is a visual and behavioral reference.

It is NOT runtime source code for the React Native application.

Do not port web implementation details such as:

- hover states;
- CSS media queries;
- container queries;
- DOM structure;
- browser-specific interaction;

when a native interaction is more appropriate.

Translate the intended behavior into native React Native patterns instead.

---

## 4. Future Overrides

Only add entries here when a deliberate Souris product/design decision differs from the exported reference.

Do not use this file as a miscellaneous design notes document.

The goal is to keep exceptions explicit and rare.

---

## 5. Operational Agenda — Professional Occupancy

The exported Agenda design shows unattended processing as a peach striped section inside an event.
The operational Souris Agenda intentionally overrides that treatment:

- a phase with `requiresStaff = false` remains part of the Appointment domain timeline;
- it contributes to elapsed duration and appointment end time;
- it does not render as an appointment-colored or peach striped block in the day Agenda;
- the normal grid gap represents time during which the professional is available;
- a later staff-required phase reappears as a separate visual reprise;
- overlap columns are calculated from visible staff-required segments, not whole Appointment elapsed intervals;
- visible segments use a restrained set of approved pastel families, with every segment from one Appointment
  preserving the same family;
- the reprise remains explicitly identifiable whenever the segment has enough space for readable text.
- client identity is primary, service is secondary, and phase is tertiary;
- duplicate service and phase labels are shown only once;
- short active segments use a compact single-line identity instead of becoming blank;
- reprise content preserves service continuity.

The exported design does not define the approved smartphone Week view. Souris uses a vertical list of seven day
sections rather than a compressed seven-column calendar. Week rows summarize appointments once, keep the Day/Week
palette identity, and do not render processing or reprise phases. Tapping a day opens its detailed Day view; a
future larger-screen layout may use a multi-day grid but is outside this phase.

The first Appointment Details experience is a native read-only modal route. Service sections are collapsed by
default and expand locally; processing phases are explicitly visible there even though the operational Day Agenda
leaves them visually free.

Processing details remain available in Appointment Details and in future service configuration and editing workflows.

## 6. Existing Appointment Service Editing

Appointment Details remains read-first. Its restrained `Modifier` action opens a dedicated native editing screen;
price fields, processing steppers, reorder handles, and removal actions are not shown in read mode.

The editing screen reuses the compact selected-service accordion and sortable interaction from Appointment Creation:
cards start collapsed, only one card expands at a time, and the explicit drag handle appears only with multiple
services. The final remaining service cannot be removed through this editor; removing a service is not appointment
deletion.

---

## 7. Appointment Creation Flow

The exported Agenda reference shows creation as a single form sheet (`Nouveau rendez-vous` with a Cliente field,
a Prestation select, date/heure fields, and a Déroulé preview). The implemented Souris creation experience
deliberately differs:

- three steps with a connected stepper — `Cliente → Prestations → Résumé`;
- the Agenda-selected date/time is pinned as a compact appointment-context row on every step (never a large
  date card). The time is a creation draft: a restrained `Modifier` reveals an inline ±5-minute control on
  the same local date, bounded by the operational Agenda day;
- the client picker searches the complete normalized address book with a virtualized list and no display cap;
  its search field uses a symbol icon and a clear `Rechercher une cliente` placeholder instead of field
  instructions;
- Prestations reads the single shared active Service catalog as a compact wrapping two-column grid grouped
  by type — `Services` / `Techniques` — with borderless tinted selectable cards (name, concise
  duration with quiet `dont X de pose` context, price; selected = stronger lavender surface + small check
  indicator, no outline). No selected-services stack lives on this step. The SAME shared grid is used by
  existing Appointment Editing INLINE — embedded directly below the retained AppointmentItem stack on the
  same scrollable screen with a tight vertical rhythm (one standard spacing transition between the stack and
  the search field, no giant gap). Tapping a catalog card IMMEDIATELY appends a new Appointment draft: no
  `Ajouter la prestation` / `Ajouter N prestations` confirmation. A catalog card whose Service is already in
  the draft shows the added state and cannot create a duplicate; removing the Appointment item releases the
  card again. Retained snapshot items never appear as grid selections;
- the Appointment Editing context surface carries explicit restrained violet actions:
  `Modifier la cliente` (client reassignment through the shared picker), `Changer la date`,
  `Changer l'heure` — no generic `Modifier` wording;
- selection feedback lives in the BOTTOM ACTION AREA: a restrained deep-violet, medium-weight count line
  (`2 prestations sélectionnées`, correctly pluralized) sits directly above the navigation buttons inside
  the same sticky footer — never floating inside the grid content;
- the Résumé step hosts the selected services as a vertical ordered stack of borderless soft-lavender
  accordion cards (strong name, concise duration, price, small purple disclosure chevron, muted explicit
  drag handle). Cards start collapsed, at most one card is expanded at a time, and dragging operates on the
  compact collapsed representation. The SAME stacked accordion card system is used by existing Appointment
  Editing (with the removal action and last-service protection);
- expanded Résumé cards expose quick adjustments only: `Prix` and `Durée` for a simple Service, `Prix` and a
  compact per-phase `Durées` editor for a TECHNIQUE — no structural phase changes (those belong to
  Prestations & tarifs). A quiet line states « Les modifications seront enregistrées pour les prochains
  rendez-vous. »;
- adjusted price and phase-duration values are committed to the Service catalog ONLY when creation
  succeeds, as one coherent action with the Appointment snapshot; abandoning or deselecting never touches
  the catalog;
- Résumé keeps the structured `Temps` summary (Temps actif / Temps de pose / Durée totale / Total) and
  subtle `Modifier` actions returning to the relevant step;
- the explicit dismiss action is `Annuler`, kept restrained next to the native sheet grabber.

---

## 9. Service Management V1 — Activation Instead of Deletion

The exported Prestations reference offers `Supprimer` with a destructive confirmation. Services &
Pricing V1 originally had no permanent Service deletion: appointment snapshots preserve
historical reality regardless. V1 now exposes BOTH catalog actions with distinct semantics:

- `Désactiver` / `Réactiver` — temporary, non-destructive catalog management. The details sheet
  closes after confirmation and the service moves to the matching list group.
- `Supprimer définitivement` — permanent catalog-record removal for mistakes, duplicates, or
  genuinely unwanted services. It is a tertiary rose text action (no filled destructive
  background, no decorative outer border, 44pt touch area) placed below the primary actions.
  Confirmation explicitly states that existing Appointments remain unchanged. Deletion never
  cascades into Appointment snapshots.

`Désactiver` uses non-destructive copy — « La prestation ne sera plus proposée lors de la création
d’un rendez-vous. » — followed by a confirmation. Deactivation only removes the service from NEW
Appointment selection; existing Appointment snapshots are never changed.

Prestations & tarifs management groups the canonical catalog into `Actives` / `Inactives` groups,
each visually separated into `Services` and `Techniques` subsections (only non-empty
subsections render). Legacy categories never reappear. Rows use light surfaces with a restrained
deep brand-violet service name (`lav700`, not full-strength action purple), strong foreground
price, soft secondary duration metadata, and subtle chevrons. The editor uses
`Prestation simple` / `Prestation technique` wording rather than raw enum vocabulary, and phases
use `Temps actif` (professionnelle occupée, light neutral/lavender) and `Temps de pose`
(professionnelle disponible, soft peach).

The TECHNIQUE phase editor is an accordion: exactly one phase is expanded at a time, adding a
phase collapses the current one and expands the new one, and collapsed phases show a compact
identity row (index, name, semantic type, duration, drag handle). Dragging collapses the expanded
phase so reordering always works on the compact representation. A processing phase has the
canonical name `Temps de pose` and no custom name field.

Read-only phase presentation is concise: an active phase shows its name with `Temps actif`
semantics, a processing phase shows `Temps de pose` and its duration on the peach surface —
the wording `professionnelle occupée` / `professionnelle disponible` belongs to the editor type
selector only and never appears on read-only detail surfaces.

---

## 10. Native Runtime Visual Language Refresh

The current React Native runtime adopts **soft editorial beauty productivity** as the newer approved visual
direction. For native runtime presentation, this section takes precedence over the original exported design;
the export remains preserved as the historical brand and interaction reference.

- The canonical deep navy, Souris purple, lavender, rose, peach, warm white, and cool neutral palette remains
  unchanged. Runtime semantic tokens assign those approved values to layered screen, elevated, neutral,
  lavender, rose, and peach surfaces rather than introducing new colors.
- Appointment detail, creation, and editing surfaces may use a near-white lavender page tint. Elevated white,
  soft neutral, and pastel surfaces create grouping; borders are reserved for focus, selection, or a boundary
  that would otherwise be unclear.
- Appointment surfaces whose tint already provides grouping remain borderless. Compact Agenda blocks use the
  small radius, Details cards use the medium radius, and Creation/Editing cards keep the larger form rhythm;
  identity accents, timeline lines, separators, fields, selection/focus states, and modal boundaries remain.
- Client Profile activity, next-appointment, information, and appointment-history surfaces follow the same
  borderless grouping rule; internal content dividers and screen separators remain where they add structure.
- Lavender identifies service structure and selection, rose carries the Appointment Details brand accent and
  destructive meaning, and peach remains dedicated to processing / unattended time.
- Section hierarchy uses title-case editorial titles with optional count chips. Uppercase eyebrows remain a
  selective Souris brand detail, not the default heading treatment.
- All service disclosures use the same small purple line chevron and the same soft rotation behavior. Drag
  handles remain separate, neutral, and visually quieter than disclosure controls.
- Native feedback is fast and restrained: press states, 150–240 ms disclosure transitions, drag lift/settle,
  and semantic haptics only for drag activation/drop and successful Appointment creation or save.
- Appointment Details is the runtime reference surface: rose identity accent, strong client hierarchy,
  softly layered date/time and lavender service structures, explicit peach processing, and a strong total.
- Agenda remains the calmer operational exception. Day keeps a neutral grid and restrained appointment
  families; Week remains a compact editorial list with subtle separators and markers rather than pastel day
  cards.
