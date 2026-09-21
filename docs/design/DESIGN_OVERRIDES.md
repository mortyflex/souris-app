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
  date card). The time is a creation draft: a restrained « Changer l'horaire » reveals the inline start-time
  wheels (hours + 5-minute minutes, see « Appointment start time — wheels ») on the same local date, bounded
  by the operational Agenda day;
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

Archived records (Clients today) share one restrained treatment: the row keeps its structure,
name and avatar drop to `foregroundSoft` on the neutral `surface`, metadata gains a leading
`Archivée` mention, and the group eyebrow uses `foregroundMuted`. Never rose/error styling,
never strikethrough, never a hidden row — archived is a quiet state, not a failure. The
lifecycle actions follow the existing hierarchy: reactivate as the secondary action in the
identity block, archive as tertiary soft text after the history, permanent deletion as tertiary
rose text (`rose600`) reachable only from the archived state.

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

---

## 11. Product Image Presentation

Products use one consistent primary-image treatment across catalog, details, and the shared form:

- catalog images remain compact square thumbnails and never turn management rows into ecommerce cards;
- normal photographs use `cover` in the small catalog thumbnail, while detail/form previews use
  `contain` so an isolated transparent Product is not clipped;
- transparent or letterboxed content rests on the approved soft lavender Product surface;
- Products without images use a quiet lavender square with the existing package symbol in catalog/form;
- Product Details renders no large placeholder when an image is absent, preserving the textual hierarchy;
- image surfaces use restrained Souris radii with no decorative outer border.

---

## 12. Native Runtime Typography — Plus Jakarta Sans

The native runtime replaces the export’s Inter (see DESIGN.md §3) with **Plus Jakarta Sans**, loaded through
`@expo-google-fonts/plus-jakarta-sans` in four weights only: 400 / 500 / 600 / 700. The
exported reference keeps Inter as historical documentation.

- One family, one place: `src/shared/ui/theme/typography.ts` owns the scale and the
  `fontFamilies` weight → family mapping. `AppText`, tab labels, and every native `TextInput`
  read that mapping; no screen names a font family directly.
- The hierarchy is slightly larger and more editorial than the export: screen titles 30 (iOS) /
  27 (Android), sheet titles 21, section titles 18 / 700, key values 23, row titles 16.5, controls
  and CTAs 16, body 16 with a 24 line height, metadata 13.5, chips 12, tabs 11 (iOS) / 12
  (Android). Agenda hour and quarter labels keep their compact operational sizes.
- Tracking stays gently negative on titles and neutral on body; uppercase eyebrows remain the
  selective brand detail described in §10.

## 13. Product Sticker Presentation and Scanner Framing

Extends §11.

- An isolated Product image (the transparent PNG written by the optional iOS background-removal
  module, or any PNG) is presented as a **sticker**: a clean white contour drawn from offset copies
  of the silhouette and a soft navy silhouette shadow, resting on the lavender Product surface with
  an inner inset so nothing is clipped. Catalog thumbnails use a lighter contour (four copies, no
  blur) to stay cheap in long lists; details and the form use the full contour and the soft shadow.
- Photographs that are not isolated keep the flat §11 presentation. Android, where Vision is
  unavailable, therefore keeps photographs flat without any special casing.
- Sizing comes from the processed file, never from a UI zoom: the native module crops the cutout
  to the subject bounds plus a transparent margin of 4 % (minimum 8 px), and every surface renders it
  with `contain` inside the same inset box. Detail uses a 320 px surface and the form a full-width
  264 px tile (near square / 4:3 on a phone) so a typical bottle fills most of the box; the catalog
  keeps its 52 px thumbnail and row height. Form and details rest on the `surfaceMedia` lavender
  (lav200), dense enough for the white contour to read; the thumbnail keeps the quiet lav050.
- In the Product form the image area is the interaction. Without a photo it is one soft lavender
  media tile with the camera symbol and `Ajouter une photo`; with a photo it shows the sticker with a
  small `Modifier` pill. Tapping opens a compact bottom sheet (`Photo du produit`: camera, library,
  and remove when a photo exists, plus `Annuler`). No explanatory paragraph, no second CTA.
- `Prendre une photo` dismisses the source sheet first, then presents a dedicated Product camera in
  its own native large sheet (iOS `pageSheet`, full screen on Android): navy surface, close button,
  a preview that fills the available height with nothing drawn over it, `Placez le produit au
  centre`, one shutter. One modal is active at a time; sheets are never stacked and the camera is
  never embedded in a drawer. No barcode framing or scanner language.
- Every small bottom drawer (confirmations, pickers, action lists, forms) uses the shared
  `BottomSheet` primitive: one navy scrim (`scrim`, canonical navy at 16 %) that fades in while
  the sheet slides up from the bottom edge and fades out while it slides down. No frosted or white
  veil, no blur, no scrim that travels with the sheet, and no per-screen backdrop definitions.
  The complete overlay contract is §16.
- When a photo is added, replaced, or finishes background removal in the Product form, the visual
  reveals with a short scale/fade settle (spring, ≈ 240 ms) and a small activity badge while the
  transparent version is being prepared. Reduced motion renders the final state directly.
- The barcode scanner fills the screen with the camera, adds a navy scrim with a rounded
  landscape cut-out window, white corner brackets, a subtle lavender pulse around the window, and
  a glass instruction pill. Close and torch are circular glass buttons inside the top safe area;
  the status bar stays light while the scanner is presented.

## 14. Sale Creation — Operational Selection

The exported reference contains no Sale flow. Sales V1 reuses existing Souris patterns rather than
introducing a POS visual language:

- `Nouvelle vente` is a primary action beside a secondary `Ajouter un produit` on the Produits
  tab — no new tab, no KPI, no cash-register surface;
- Sale creation is one native form sheet in the canonical Souris shell (§16: white surface,
  Souris grabber, `SheetHeader` with eyebrow / title / tertiary `Annuler`, sticky
  `SheetActionBar` with `Valider la vente`, no swipe-to-dismiss), like the Product editor — never
  a full-screen modal that would collide with the status bar;
- Product selection is operational: tapping a search or scan result adds the Product IMMEDIATELY
  (or increments its single line) with a selection haptic and no intermediate confirmation. The
  scroll position stays stable so several additions can follow each other;
- a Sale line is a borderless lavender card: thumbnail, name in deep brand violet, `prix / unité`,
  a quiet `Stock N` hint, a `−  n  +` stepper (disabled sides communicate the bound: 1 and current
  stock) and the line subtotal; removal is an explicit small close control, never a hidden swipe;
- the total is a stronger lavender surface with the summary value typography; completion issues
  use the rose surface and text, never a blocking dialog;
- scan results inside a Sale use the shared `BottomSheet` (unknown / inactive / several matches)
  and never offer Product creation;
- `Vendre un produit` is a secondary `AppButton` in the Client Profile identity block. In
  Appointment Details the same action is `Revente`: a borderless full-width lavender pill with the
  shopping-bag symbol and violet label, placed ABOVE `Terminer` and the lifecycle row, without a
  heading or divider — a contextual business action that never competes with the primary
  lifecycle action and is never grouped beside `Absence` / `Annuler`. Produits keeps
  `Nouvelle vente`.

---

## 15. Brand Foundation V1 — Identity Integration

The exported reference shows the logos only inside a web launcher and an onboarding mock. The native
runtime integrates the SAME canonical assets (`assets/brand/logo-mark.png`, `logo-wordmark.png`,
`logo-lockup.png` — transparent PNGs, never modified) at deliberate brand moments only:

- **iOS app icon (flat)** — `assets/brand/Souris.icon`, an Apple Icon Composer document
  referenced by `ios.icon`; Xcode compiles it and renders every size, appearance and pre-26 fallback
  from it. Direction: the approved symbol, flat and crisp on clean white — no glass, no shadow, no
  glow, no relief. One layer: `logo-mark.png` copied byte-identical into the document (never
  resized, recoloured or cropped), scale 1.05, translation (−15, −6) pt so the artwork spans ≈ 71 %
  of the canvas width and is centred on its own bounding box; white `#FFFFFF` document fill; glass
  off, shadow none, translucency off. Dark appearance: no specialization (system dark background).
  Mono / tinted: system rendering from the layer alpha. No wordmark in the icon. The layered sources
  in `assets/brand/icon-source/` are retained but unused: `02-mouse-mark.png` has a halo baked into
  its pixels that rendered blurry at Home Screen size (see the README there).
- **Fallback raster icon** — `assets/images/icon.png` stays as the top-level `icon` for Expo Go,
  web metadata and any tooling that needs a flat PNG. It is not the iOS icon. **It still shows the
  previous identity** (navy mouse on `#E1D6F9`) until an approved flat export of the new icon is
  supplied; the same applies to `assets/images/favicon.png`.
- **Android icon** — adaptive icon (`android-icon-foreground.png`, `android-icon-monochrome.png`,
  `backgroundColor` `#E1D6F9`), platform-appropriate, no glass imitation. **These files still show
  the previous identity** until approved Android exports of the new icon are supplied.
- **Native splash** — `expo-splash-screen`: white `#FFFFFF` background (identical to the Agenda
  first frame). iOS shows the canonical `assets/brand/logo-lockup.png` directly at `imageWidth`
  333 (no derived splash PNG any more). Android shows `logo-mark.png` alone at `imageWidth` 288,
  because the Android 12+ system splash masks the image to a circle that would clip the lockup; the
  mark's artwork spans 45 % of its canvas, so it stays inside the safe circle. No spinner, text, or
  animation beyond the short native fade (`duration.settle`).
- **Bootstrap** — the splash stays visible until Plus Jakarta Sans and the SQLite bootstrap are both
  settled and the router is committed; the root view shares the splash white and the boot surface
  renders the same lockup at the same 333 dp, so no intermediate unbranded surface or flash exists.
- **Welcome** — the lockup is the hero: box width 472 dp on the 393 dp reference screen (artwork
  ≈ 265 dp), scaled with the screen width (capped at 430 dp); it stays the single accessible
  "Souris". Around it, `WelcomeMotifs` floats the six approved PNGs of
  `assets/brand/welcome-floating/` (hairdryer, scissors, mirror, brush, comb, nail polish) — drawn as
  supplied with `contain`, no plate, no shadow, boxes of 58–90 dp (hairdryer largest, nail polish
  smallest), staggered around the logo and never over the word. A short hero pulls the objects in
  and shrinks them rather than the logo. Idle: each object drifts on its own 5.2–7.4 s sine loop
  (±5–7 dp vertical, ±2–4 dp horizontal, ±2–3.5° tilt), fading out while the object is in flight.
  Touch: the hero — and only the hero — owns a pan gesture, and every object is a small physical
  body (`welcome-physics.ts`): a finger within 130 dp pushes it away and hands it a share of its
  own velocity, so a slow finger nudges and a fast swipe throws (≈ 135–160 dp in free space). A thrown
  object coasts on a light drag, bounces softly off the hero's edges (artwork radius included) and
  off the logo (an ellipse), is reined in past 110 dp from rest, then drifts home on a pull that
  firms up as it slows and settles without wobbling (≈ 4 s). It leans with its horizontal speed,
  per object (scissors most, mirror and nail polish least), never spinning. One frame callback per
  object, running only between the first touch and the return home; everything else stays on the
  UI thread with no React render while the finger moves. Helpers called by a worklet are
  module-level worklets, never functions declared inside a worklet (the React Compiler would hoist
  them out as non-worklets — guarded by `worklet-closures.test.ts`); the physics rules are
  unit-tested, the feel is validated by hand on simulator / device. The logo leans ≤ 2.5 dp. The
  headline uses `semanticColors.brandForeground` (`brand.plum` `#5F1852`, the measured plum of the
  word in `logo-lockup.png`, 12.1:1 on white); the subtitle keeps `foregroundSoft`. Reduce Motion:
  still scene, touch field off. Decorative, pointer-transparent, hidden from assistive technology;
  the hero clips its content so nothing draws over the copy or the buttons. The splash and boot
  surface are unchanged (lockup at 333 dp).
- **Account state screens** — `<BrandMark variant="mark" size={126} decorative />` (compact symbol
  above the state title).
- **Plus** — a compact identity block at the bottom of the screen:
  `<BrandMark variant="wordmark" size={150} />` (the single accessible "Souris"), then
  `Version x.y.z` from the Expo manifest in muted metadata. It never competes with the management
  rows.
- **Sizing** — the canonical PNGs carry generous transparent padding (artwork ≈ 56 % of the lockup
  width, 45 % of the mark, 61 % of the wordmark). `size` is the rendered box width; the height
  follows the intrinsic ratio (lockup and wordmark 3:1, mark 3:2) with `resizeMode="contain"`, so
  nothing is ever stretched. The PNGs are transparent and coloured: they sit directly on the white
  background with no cream or tinted plate behind them, and there is no white-on-light variant.
- **Where logos do NOT appear** — Agenda, Clientes, Produits, Prestations, details, sheets, forms,
  headers. Titles stay `Agenda` / `Clientes` / `Produits` / `Plus`; never `Souris — Agenda`.
- **Display name** — the installed app is named `Souris` (`expo.name`); `souris-app` remains only
  the technical slug / package name.
- Dark logo variants, alternative palettes, and new artwork are out of scope: the three canonical
  assets are the identity.

---

## 16. Overlay Consistency V1 — Sheets, Dialogs, Keyboard, Main-Screen Identity

Every Souris overlay now shares ONE visual and behavioral language. The reference is the
Plus › Compte sheet (drawers) and the permanent Client deletion dialog (confirmations).

### Bottom sheet (`src/shared/ui/BottomSheet.tsx`, `SheetScreen.tsx`)

- **Shell** — full-width satin overlay surface (§20; formerly flat white), `radii.ios.sheet` top
  corners, the Souris grabber (40 × 5, translucent navy `overlayMaterial.grabber`), platform gutter, bottom safe area. The same shell
  serves the JS drawer (`BottomSheet`, a Modal) and every sheet route (`SheetScreen`; native
  `formSheet` for workflows, transparent route + shared `SheetPresentation` for content-fit
  sheets — see §20 Geometry; configured once in
  `src/providers/sheet-route-options.ts`: overlay-surface `contentStyle`, `sheetCornerRadius`, system
  grabber hidden so the Souris grabber is the only one). Workflow sheets use the system's large detent (`sheet.workflowDetent`, §20 — the only detent
  iOS 26 keeps attached to the screen edges);
  read-first sheets (Appointment details, Product / Service details) use `fitToContents` so a
  short detail never leaves a blank middle area, capped at the same detent (`sheet.detent`).
- **Header** — `SheetHeader`: optional purple uppercase eyebrow (rose for lifecycle /
  destructive sheets), large navy multiline title, one tertiary text action top-right
  (« Fermer » / « Annuler »). No decorative borders; an optional hairline only under tall
  workflow headers.
- **Action area** — `SheetActionBar`: no divider and no fill of its own, so body, actions and
  bottom safe area read as one continuous material (§20), with the platform gutter,
  anchored below the scrolling body, safe-area cleared by the shell. One predictable behavior
  everywhere: with the keyboard open the whole sheet lifts (iOS `padding`), the body scrolls,
  and the bar stays reachable; the bottom safe-area inset is dropped while the keyboard is up so
  there is never a double inset.
- **Motion** — open = slide up + scrim fade in; close = slide down + scrim fade out, THEN the
  Modal unmounts and `onDismissed` fires (chaining a second presentation is always safe).
  A sheet never disappears instantly. `duration.panel` with the sheet easing; reduced motion
  renders end states directly.
- **Scrim** — exactly one canonical `scrim` (navy 16 %) for sheets and dialogs. No white veil,
  no ad-hoc opacities. Native form sheets use the system dim (platform-owned). A nested drawer
  (Client form over the Client picker, a dialog over a sheet) adds its own scrim — accepted as
  a natural second layer, never a third.
- **Gesture policy** — explicit per sheet: `dismissOnBackdropPress`, `dismissOnPanDown`,
  `dismissOnHardwareBack`. Pan-to-dismiss lives ONLY on the grabber/header zone, so body
  scrolling always wins. Scroll-safe sheets (Client form, Client picker) and every workflow
  route (Appointment creation / editing, Product and Service creation, Sale creation) disable
  the swipe entirely (`gestureEnabled: false`); Product / Service details allow it while
  reading and disable it while editing. Leaving a workflow is always an explicit « Annuler ».
- **Keyboard** — presenting a drawer, form or sheet NEVER opens the keyboard: no `autoFocus`,
  no imperative focus. The keyboard opens only when a field is tapped; the focused field stays
  visible inside the bounded, keyboard-safe scroll (`keyboardShouldPersistTaps="handled"`).

### Confirmation dialog (`src/shared/ui/ConfirmationDialog.tsx`)

- The ONE Souris-owned confirmation: near-full-width centered card (`dialog.maxWidth`),
  `radii.large`, the overlay material with NO outline (§20), `scrim` backdrop, fade in/out. Uppercase eyebrow, large
  navy title, soft body, then full-width stacked actions: soft lavender secondary
  (« Retour » / « Annuler ») above the confirm.
- `tone="destructive"` — rose eyebrow, a whisper-rose surface and a soft rose-FILLED confirm
  (`danger`: `rose100` fill, `rose700` text, no outline) — never an outlined button, never a
  solid danger slab. Used for permanent Client, Product, Service and Appointment
  deletion and for discarding a Sale or Appointment-edit draft.
- `tone="neutral"` — accent eyebrow and a primary confirm: sign-out, Product / Service
  deactivation, and explanation-only dialogs (single « Compris »).
- Wording stays feature-owned; the primitive never names an entity. React Native `Alert` is
  not used for Souris-owned confirmations — it remains only for error reports
  (`alertPersistenceFailure`), permission explanations, and the development-only reset.

### Main-screen identity (`src/shared/ui/ScreenWatermarkIcon.tsx`)

- Each main tab carries ONE large, low-contrast semantic symbol anchored in the top-right
  corner and partially cropped by the right edge so it reads as embedded in the page surface:
  Agenda `calendar`, Clientes `person.2`, Produits `shippingbox`, Plus `gearshape` (Material
  equivalents on Android). `watermark.size` / `watermark.opacity` / `watermark.crop*` and one
  position for all four — anchored to the title block by `MainScreenHeader` (§17), never to the
  device edge. Symbols do not fill their box the same way, so a symbol may carry a restrained
  optical scale and rise (`screenWatermarkOptics`: the two people of Clientes grow and lift so
  the heads and shoulders stay readable above the search field); the shared anchor, the
  right-edge crop and the opacity never change per screen.
- Decoration only: absolutely positioned under the content, `pointerEvents="none"`, hidden from
  accessibility, no layout impact, never a button or a card, never competing with the title.

### Related controls introduced by this pass

- **Birthday selector** (`BirthdayField` + `BirthdayWheelPicker`) — the Client form asks for
  a day + month only, inline, with a two-column native-feeling wheel (Jour / Mois, French month
  names, February offers 29, a shorter month resolves the day to its last valid one). No year
  column, no typing, no nested overlay; « Effacer » removes it. See §17 and
  `docs/domain/CLIENTS.md` §2.
- **Stock stepper** (`StockStepper`) — Product stock is chosen with a `[−] n [+]` control
  (0–30, hold to repeat) instead of a text field. A legacy quantity above 30 is shown exactly and
  can only be lowered one unit at a time; saving unrelated fields never clamps it.

---

## 17. Main-Screen Composition, Floating Creation and Short Sheets (UI Consistency V1 polish)

### Main-screen header — Produits is the reference

`MainScreenHeader` (`src/shared/ui/MainScreenHeader.tsx`) is the ONE header composition of the
main tabs and of every screen that wants the same identity:

```text
Produits                                  [watermark, cropped by the right edge]

[ Rechercher un produit                                             scanner ]
```

- one large screen title on the platform gutter, `spacing.md` below the top safe area;
  Produits and Clientes carry NO uppercase eyebrow — the title is never repeated. Agenda carries
  none either: the Jour / Semaine switch already says which view this is, and the selected date
  belongs to the day navigator (§21); Plus keeps its approved content;
- optional trailing content inside the gutter (Agenda's view switcher);
- the decorative watermark is anchored to the TITLE BLOCK — a full-width, unpadded view — so
  its right crop and its vertical relationship to the title are identical on every screen and
  the status bar, the Dynamic Island and the rounded corners never move it. No per-screen top
  offsets: the block is rendered after the safe area (`Screen`'s `header` slot, or directly
  under the screen's `SafeAreaView`);
- the search field, when present, sits `spacing.base` under the title with the same field
  dimensions everywhere (`SearchField`). No inline creation buttons in the header area.

### Floating creation action (`src/shared/ui/FloatingCreateButton.tsx`)

- The ONE creation entry of screens whose primary action is « ajouter / créer »: a violet
  circle (`floatingAction.size` 56) with a white plus, fixed bottom-right on the platform
  gutter, `floatingAction.inset` above its own bottom safe-area edge (so it sits above the tab
  bar in a tab and above the home indicator on a pushed screen), the light lavender
  `nativeShadows.floating` elevation, a subtle press scale and one selection haptic. No text,
  no Material FAB, no card.
- Never part of the scrolling content; lists keep `bottomClearance` bottom padding so the last
  row scrolls above it.
- Reveal on focus: because several screens carry the + in the same place, a tab switch must
  never read as the button sliding from one screen to the next. The button starts hidden and
  unavailable (no touches, not announced); `floatingAction.revealDelay` after the screen gains
  focus it fades and rises `floatingAction.revealRise` into place over `duration.state` — no
  bounce, no overshoot. Losing focus hides it at once, closes any menu and resets the reveal.
  Reduced motion shows it immediately.
- A single flow opens directly: Clientes → the shared Client form; Agenda → Appointment
  creation on the selected day; Prestations & tarifs → Service creation.
- Several flows expand into a compact menu anchored above the button (fade + rise + light
  scale, `duration.disclosure`; reduced motion renders the end state): right-aligned pills with
  the label and a lavender icon disc, a transparent outside-tap layer, the plus rotating to a
  cross while open. Choosing an option closes the menu first, then runs the flow; leaving the
  screen closes it. No scrim, no drawer, no native action sheet. Produits: « Nouvelle vente »
  (`bag`) and « Ajouter un produit » (`shippingbox`).

### Short sheets are content-fit

A chooser or a short form presented as a native sheet uses the `editorSheet` route options
(`fitToContents`) with `SheetScreen fit="content"`: the New Service type chooser
(« Prestation simple » / « Prestation technique ») ends after its options with normal
breathing room and never fills the screen with an empty lower half. The height still caps at
the canonical detent when a form grows, and the swipe stays disabled while a draft is edited.

### Client form action bar

Client create and edit share the same `SheetActionBar` inside the shared `BottomSheet`: the
canonical `spacing.base` breathing room below the action, above the sheet's bottom safe area
(dropped while the keyboard is up, so the action stays reachable and never doubles the inset).
No Client-specific margins.

### Appointment start time — wheels

The Appointment START time is chosen on two adjacent wheels — **Heures** and **Minutes** —
instead of the former ±5 stepper: reaching 19:00 is one flick, not a series of + presses. ONE
implementation serves Appointment creation (context row and Summary step) and Appointment
editing: `StartTimePicker` (appointments) on the shared `TimeWheelPicker` /
`WheelColumn` (`src/shared/ui/`), the very mechanics of the birthday wheel.

- 24-hour, no AM/PM, two-digit labels; minutes on the 5-minute grid (00, 05 … 55). Native
  inertial scrolling, rows snap to the centered band; the selected row is strong, its neighbours
  progressively fade. Each wheel owns its scroll: moving one never moves the other.
- The wheels open on the current start time. A start that is off the grid (an Appointment
  created « now » at 11:26) is never silently rounded: that exact minute stays on the wheel, in
  order, until another one is picked.
- Hours: creation offers the operational day (08 → 23, latest start 23:55, same local date);
  editing offers the whole day (00 → 23) on the Appointment's own date — the date only changes
  through « Changer la date », and an Appointment that then ends after midnight runs into the
  next day as before. The rules are pure functions (`setStartTimeOfDay`,
  `setAppointmentLocalTime`).
- Haptics: one selection haptic when « Changer l'horaire » opens the wheels, then one per value a
  wheel ACTUALLY snaps to — never per scroll event, never when it settles back on the same row.
- Accessibility: each wheel is one adjustable element announcing « 19 heures » / « 5 minutes »;
  increment / decrement move one row.
- Durations are NOT chosen here: service, phase and processing times keep their own ± controls
  (APPOINTMENTS.md §14.2).

### Birthday wheel

The Client birthday is chosen with `BirthdayWheelPicker`: two snapping columns (Jour / Mois),
the centered row highlighted on the lavender band, French month names, no year column, no
keyboard. The day column only lists the days of the selected month (February: 29); a month
shorter than the selected day resolves it to the last valid day and the wheel settles there.
One selection haptic per row change while scrolling, never per pixel. The model stays
`{ month, day }` (SQLite v4, no fake year).

---

## 18. Main Navigation — Native Tabs (Liquid Glass)

The four main tabs — **Agenda · Clientes · Produits · Plus**, in that order, static for the whole
app lifetime — live on the platform's own tab bar through Expo Router `NativeTabs`
(`src/app/(app)/(tabs)/_layout.tsx`). The JavaScript tab bar of the export (`.tabs`, DESIGN.md §5)
is no longer reproduced natively.

- **iOS**: UIKit's tab bar. On iOS 26, with a binary compiled by Xcode 26+, it is Apple's native
  Liquid Glass — the system material, sampling the page beneath it. Older iOS shows the standard
  system tab bar. Souris never fakes the glass **of the bar**: no BlurView, no translucent view, no
  gradient, no opaque forced background, no version-conditional custom bar. (The small light-glass
  controls of §21 are Souris-drawn surfaces that echo this material; they never replace or
  imitate the bar itself.)
- **Android**: native Material bottom navigation, with Material icons — not an imitation of
  Liquid Glass.
- **Icons / labels**: system symbols, visible native labels, native selected state.
  Agenda `calendar` / `calendar_month`; Clientes `person.2` → `person.2.fill` / `group`;
  Produits `shippingbox` → `shippingbox.fill` / `inventory_2`; Plus `ellipsis` / `more_horiz`
  (« Plus » is more than settings, so no gear). No icon package.
- **Tint**: the selected tab uses the Souris accent (`semanticColors.accent`) and nothing else is
  restyled — the system owns the material, layout and typography of the bar.
- **Theme**: the tabs are wrapped in the Souris navigation theme
  (`src/providers/navigation-theme.ts`, light only), whose background is the canonical white
  screen, so a tab switch never flashes a foreign colour behind the glass.
- **Scroll edge**: `disableTransparentOnScrollEdge` is set because every main screen keeps its
  fixed `MainScreenHeader` above its list — UIKit's scroll-edge detection therefore never finds
  the list and, on iOS 18 and earlier, would draw a permanently transparent bar. Liquid Glass
  ignores bar backgrounds, so iOS 26 keeps its native behaviour.
- **Minimize on scroll**: NOT enabled. The bar stays stable while the professional works; the
  minimize behaviour is evaluated separately later.
- **Content under the bar (iOS)**: the bar overlays the page. The main lists (Agenda day / week,
  Clientes, Produits) opt into the system content inset (`contentInsetAdjustmentBehavior`), and
  keep `bottomClearance` above it so the last row scrolls above the floating +. Plus does not
  scroll and pads its content by the tab's bottom safe area. No tab-bar height is measured,
  hardcoded or guessed.
- **Floating creation** stays the `FloatingCreateButton` of §17, positioned by its own bottom
  safe-area edge — inside a native tab that edge already includes the system bar plus the home
  indicator. The Produits mini-menu anchors above the + and closes when the tab loses focus.
  Creation is never a tab: the bar is navigation, the + is contextual action.
- **Reselect**: native behaviour (pop to the tab root / scroll to top where the system finds a
  scroll view); no custom reselect logic.

---

## 19. Agenda Visual Language — Pastel Planning Cards, Gloss, Floating +

This section supersedes the « calmer operational exception » wording of §10 for Agenda appointment
cards, the flat violet circle of §17 and the « nothing else is restyled » wording of §18, for
presentation only. Occupancy, segments, statuses and navigation behave exactly as before.

- **Palette**: appointment cards use the fifteen approved families of the « Appointment Card
  Color Palette » reference — mint, sage, aqua, sky blue, powder blue, soft indigo, lilac,
  lavender, soft rose, coral, peach, apricot, sand, soft yellow, pistachio
  (`appointmentPastels` in `src/shared/ui/theme/colors.ts`). Each family is four explicit tokens:
  `background` (solid pastel fill), `accent` (solid left border), `title` (dark same-hue client
  name) and `subtitle` (same-family secondary text). They are design-system constants: never
  derived with HSL / OKLCH or any runtime colour maths. Washed-out grey is never an active colour.
- **Flat fills only**: a card is a solid background, a solid accent border and solid text. No
  linear or radial gradient, no translucent overlay, no sheen, no glossy tint, no colour
  interpolation across the card.
- **Assignment — colour identifies the client.** Appointment colour identifies the client within
  the calendar. Appointments belonging to the same client share a colour family: main
  appointment, reprise, every segment, large and compact card alike. The Day agenda resolves
  visible client colour collisions across the available 15-family palette
  (`resolveAgendaAppointmentPalettes` in `src/features/agenda/appointment-palette.ts`):
  - the identity is the stable `clientId`, never the mutable name and never the Appointment id;
  - each client prefers one family, `hash(clientId) % 15`, so it tends to keep its colour from
    day to day;
  - the clients visible on one day are visited in sorted-id order (never appointment order):
    each preferred family goes to the first client asking for it, the others probe forward to
    the next free family. The order of `appointmentPastels` is part of the design — neighbours
    are deliberately contrasting, so a displaced client lands on a clearly different colour;
  - up to 15 visible clients are therefore all different; beyond 15 every family is taken and
    the remaining clients reuse their preferred family;
  - an Appointment without a client id (not expected: `clientId` is required) falls back to its
    own id as identity, so it still resolves to one valid, deterministic family;
  - pure presentation logic: never random, nothing persisted, nothing synced. A client's colour
    can differ between two days when another visible client claims its preferred family.
  The Week list resolves the same per-day colours for its row markers, so a marker matches the
  Day card; Week stays an editorial list without coloured cards.
- **Status**: scheduled / confirmed / in-progress are written in their family; completed keeps
  the family `background` and `accent` under soft text and loses the card shadow; cancelled /
  no-show are desaturated neutral (they do not occupy the operational Agenda today, §5).
- **Text**: a live card is written in its own family — client name in the family `title` tone,
  service line, phase and reprise in the family `subtitle` tone. Hierarchy comes from weight and
  lightness, never from a generic navy or grey. Completed, cancelled and no-show keep
  `foregroundSoft`. `title` is ≥ 4.6:1 and `foregroundSoft` ≥ 7:1 on every background (covered by
  `appointment-palette.test.ts`). The approved `subtitle` equals the `accent` and measures
  2.1:1 (soft yellow) to 4.1:1 (soft indigo) on its background — below the 4.5:1 target for
  small text. It is an accepted decision of the approved palette, to be re-checked on device.
- **Shape**: `radii.small` (8), reduced on short blocks (a quarter of the height, minimum 3) so
  a quarter-hour card never reads as a pill.
- **Depth**: the barely-there `nativeShadows.card` under live cards, nothing else. The former
  card sheen (a top-down white gradient plus a one-pixel highlight, `gloss.card`) is removed: it
  read as a washed gradient across the pastel fill. No blur, no glassmorphism.
- **Floating +**: same size, placement, hit target, reveal and behaviour (§17). Its finish is no
  longer the glossy candy violet circle first introduced here: it is the light-glass circle with a
  violet plus described in §21 (`GlassSurface`), and the `gloss.candy` tokens are removed. What
  remains from this section: the whole finish lives in ONE circular clip (radius = half the
  button), nothing but the round shadow is ever drawn outside the circle, and the button is
  shared, so Agenda, Clientes, Produits and Prestations carry the same finish.
- **Bottom bar — iOS 18 and earlier**: NativeTabs asks UIKit for its thinner system material
  (`blurEffect="systemThinMaterial"`) so the page reads through the bar more. Still the system's
  own material — no BlurView, no custom bar.
- **Bottom bar — iOS 26 (Liquid Glass)**: the glass material is NOT tunable. Every bar-material
  prop of NativeTabs / react-native-screens (`backgroundColor`, `blurEffect`, `shadowColor`) is
  ignored by the system there (verified in the simulator: a forced red bar changes iOS 18, not
  iOS 26), and no glass variant or opacity prop exists. What Souris controls is what the glass
  samples: iOS 26 lays a dimming scroll-edge fog over scroll content under the bar, which greys
  the pastel cards before the glass refracts them. The Agenda day and week scroll views hide that
  bottom edge effect through `TabBarGlassScrollEdge` (`src/shared/ui/`, UIKit's own
  `UIScrollEdgeEffect` via `ScrollViewMarker` from `react-native-screens/experimental`), so the
  bar refracts crisp, luminous content. The system keeps icons and labels legible by itself.
  That entry point is marked experimental upstream: the wrapper is its single consumer and must
  be rechecked on every react-native-screens upgrade. Clientes and Produits keep the default
  edge effect until decided otherwise.

---

## 20. Overlay Material — Satin Sheets, Drawers and Dialogs

Supersedes the « white surface » wording of §16 for presentation only. Sizes, spacing, radii,
scrim, motion, gestures and dismissal policies of §16 are unchanged.

- **One material, three primitives.** `BottomSheet`, `SheetScreen` (+ `sheet-route-options`
  `contentStyle`) and `ConfirmationDialog` share the same surface and the same finish, so every
  consumer inherits it. No feature paints its own sheet or dialog background.
- **Surface** — `overlayMaterial.surface` (`lavender.lav025`): near-white lavender instead of
  flat `#FFF`, still lighter than `surfaceLavender`, so lavender, neutral AND white inner cards
  all read on it. **Opaque on purpose**: without a blur, even 3 % translucency lets the page
  ghost through the text (verified in the simulator). Souris adds no blur view for this; the
  glass feel comes from light, not from see-through.
- **Finish** — `SurfaceGloss` (`src/shared/ui/`), rendered first inside the surface under its
  content: a full-width highlight that starts at the very top edge and dissolves to nothing
  (`gloss.surface.sheen`, `sheenHeight`) — it has no lower edge, so it can never read as a
  rectangle inside the surface — plus ONE bright top hairline (`gloss.surface.topLight`) drawn as
  an inset shadow so it follows the top corners. Nothing is drawn along the sides or the bottom and
  no surface carries an outline: the material is edged by light and depth only. Clipped to the
  surface shape, decoration only (no touches, hidden from accessibility, no layout).
- **Depth** — restrained: `nativeShadows.sheet` lifts a drawer off the dimmed page,
  `nativeShadows.lifted` carries the dialog. Native form sheets keep the system's own shadow and
  dim. No glow.
- **Grabber** — translucent navy, so it takes the tint of the material it sits in, inside the
  highlight.
- **Dialogs** — same material, no outline around the card or any action. `destructive` leans the
  surface a whisper toward rose (`overlayMaterial.surfaceDestructive`), uses a `rose700` eyebrow
  (≥ 4.5:1 on that tint) and the rose-filled `danger` confirm (`rose700` on `rose100`, ≥ 6:1);
  cancel stays the soft lavender fill. The same `danger` button serves the cancellation / no-show
  drawers.
- **Geometry** — a sheet is attached to the screen: full width, flush with the bottom edge, top
  corners only, bottom safe area INSIDE the surface, no divider between body, actions and safe
  area. The JS `BottomSheet` guarantees this on every iOS version. Native form sheets depend on
  the system: iOS 26 floats every sheet below the large detent as an inset card (side margins,
  gap below, four rounded corners) and UIKit offers no opt-out in portrait
  (`prefersEdgeAttachedInCompactHeight` is landscape-only). Therefore:
  - **workflow routes** (Appointment creation / editing, Sale creation) stay NATIVE form sheets
    on the large detent, the one detent iOS 26 keeps attached (`<SheetScreen fit="fill">`);
  - **content-fit routes** (Appointment details, Product / Service details and creation) are
    TRANSPARENT-MODAL routes whose sheet Souris draws itself (`<SheetScreen fit="content">`),
    with the very same `SheetPresentation` as every `BottomSheet` — scrim, slide, material,
    grabber-zone pan, safe area. They are identical to a drawer on every iOS version.
- **Leaving a content-fit route** — nothing special in the screens: `router.back()`, a hardware
  back or a reset is HELD (`usePreventRemove`) while the sheet slides down and the scrim fades,
  then the same action goes through; the route never vanishes instantly. Swipe-down and
  outside-tap follow `dismissible` (off while a Product / Service draft is edited — the former
  `gestureEnabled` rule). A native workflow sheet pushed from a content-fit route (« Modifier »)
  presents above it normally. Error states of a NATIVE route use the native shell
  (`fit="fill"`), never a sheet inside the sheet.
- **Every appearance is a transition** (`SheetPresentation`, so drawers and sheet routes alike):
  - the first surface slides up only once it is REALLY laid out natively. Started at mount, the
    slide runs while the UI thread is still mounting the screen: its clock advances unseen and
    the first displayed frame already shows the sheet almost in place (measured: ~90 % of the
    travel gone 70 ms after the tap) — it reads as « appears instantly ».
    `sheet.layoutWaitFallback` only covers a layout event that never comes;
  - second-level flows that replace the content of a mounted sheet (Product details → edit,
    Service type chooser → form, Service details → edit, and back) declare a `contentKey`. A
    change brings the new content as a NEW surface sliding up over the previous one, which keeps
    its last content, takes no touches, is hidden from assistive tech and slides away beneath it
    at the very moment the new one starts. Same duration and easing as the opening. Never an
    instant swap, never a flash. Reduced motion swaps directly.
- **Bottom safe area** — kept inside the surface as plain padding from the window metrics known
  at launch (Souris is portrait-locked), a resting probe only ever raising it. A native
  safe-area view mounted while a modal is still being presented measures 0 and never recomputes
  — actions then sit on the home indicator.
- **Destructive action placement** (Appointment details) — « Supprimer » sits as low as the
  sheet allows: a flexible spacer (never less than `spacing.xl`) separates it from the primary
  actions, the content container grows with the sheet, and the breathing room sits ABOVE it, not
  under it. It stays in the scroll flow, so a tall appointment simply scrolls to it.
- **Keyboard accessory** — a pad keyboard with `returnKeyType="done"` gets React Native's own iOS
  accessory button, hardcoded « Done »; any such input must set
  `inputAccessoryViewButtonLabel="OK"` (Checkout amounts). No English string in Souris-owned UI.
- **Not part of the material** — main screens, cards, fields, the camera / scanner full-screen
  modals and the floating-create menu keep their own surfaces: not everything is glass.

---

## 21. Light Glass Controls — Back, Agenda Arrows, Floating +, Jour / Semaine

Supersedes, for presentation only, the « glossy candy » floating + of §19, the bare chevrons of
the pushed-screen top bars and of the Agenda week navigation, and the neutral Jour / Semaine
switcher. Navigation, hit targets, test IDs, accessibility and behaviour are unchanged.

- **One material** — `GlassSurface` (`src/shared/ui/`, tokens `gloss.glass`): an almost-white,
  barely see-through fill, a hairline navy-alpha contour that follows the control's own outline,
  a soft reflection from the top edge and a moulded rim, clipped to the control's shape. Depth is
  one short neutral shadow (`nativeShadows.glass`, `glassFloating` for the +). No halo, no thick
  border, no heavy drop shadow, no decorative glassmorphism: the control reads nearly white on a
  light page, with just enough depth to stand off it.
- **No blur view, no version-gated API.** The material evokes the system Liquid Glass of the tab
  bar (§18) but is drawn with plain layers, so it is identical on every supported iOS version and
  stays a clean light surface on Android. The floating + uses the denser `fillFloating` so list
  rows never ghost through it. The native tab bar itself is untouched.
- **Glass icon button** — `GlassIconButton` (`src/shared/ui/`): a 44 pt circle, the glass
  material, one thin navy glyph centred in it. Used by the back button of Fiche cliente,
  Prestations & tarifs and Caisse (`glassIcons.back`) and by the Agenda previous / next arrows in
  both Jour and Semaine and the Caisse previous / next arrows in both Jour and Mois
  (`glassIcons.previous` / `next`). Only the symbol changes.
- **Day navigator** — `DateNavigator` (`src/shared/ui/`): the ONE single-day navigation, shared
  by Agenda Jour and Caisse Jour. Previous day, ONE selected date, choose a date
  (`glassIcons.calendar`), next day — the three controls are `GlassIconButton`s. The date is
  ONE `sectionTitle` line without the year and with an abbreviated month — « Mercredi 16 sept. »
  (`formatNavigatorDate`, the single formatter of both screens). When the width measured between
  the controls is genuinely too narrow, the weekday shortens (« Mer. 16 sept. »): the date never
  wraps and never drops to a metadata size. It replaces the Agenda seven-day strip, which is gone
  from the Day view. Under it, one quiet violet `metadata` line: « Aujourd’hui » as plain text on today,
  « Revenir à aujourd’hui » as the way back elsewhere. The calendar opens `DayPickerSheet`
  (`src/shared/ui/`): the canonical date picker of Appointment editing — native wheel in the
  shared BottomSheet on iOS, native dialog on Android. The sheet has no heading: the wheel and
  its « Annuler » / « Confirmer » actions only. Agenda Semaine and Caisse Mois keep their
  own previous / next rows.
- **Day timeline top inset** — hour labels are centred on their grid line, so the first one
  (« 08:00 ») rises above the canvas. The scroll content starts `agenda.timelineTopInset` lower so
  it is shown whole; the inset moves the WHOLE canvas, so labels, grid lines, blocks, the
  tap-to-create surface and the now line keep their exact relationship.
- **Floating +** — same size, placement, reveal, menu and hit target (§17). The circle is the
  glass material; the plus keeps its symbol and becomes Souris violet — the button's only accent.
- **Segmented switches — Agenda Jour / Semaine, Caisse Jour / Mois** — ONE shared primitive,
  `SegmentedControl` (`src/shared/ui/`): a glass capsule (`radii.pill`), a touch lighter than the
  circles because it covers more area (`fillCapsule`, `borderCapsule`,
  `nativeShadows.glassCapsule`). The selected option lets the glass read through: a whisper of
  accent tint with a hairline accent contour and a violet label, echoing the selected tab of the
  bar; the others are plain `foregroundSoft` labels on the glass. Never a large opaque slab.
  The visible options are compact (36 pt iOS / 40 dp Android, 15 pt label); a vertical hit slop
  restores the platform touch target.
