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

Processing details remain available for future appointment details, service configuration, and editing workflows.
