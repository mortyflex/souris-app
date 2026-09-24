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
the name drops to `foregroundSoft`, the initials fallback drops to `foregroundSoft` on the neutral
`surface` (a Client photo is shown as it is, never greyed), and metadata gains a leading
`Archivée` mention. *(The muted « Archivées » group eyebrow is superseded by the « Archivées » tab
of §36.)* Never rose/error styling,
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
- image surfaces use restrained Souris radii with no decorative outer border;
- the catalog thumbnail geometry (52 pt rounded square, `radii.medium`) is the shared list
  thumbnail that Clientes rows also use (§36).

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
- Sale creation is one content-fit sheet route in the canonical Souris shell (§16, §20
  `<SheetScreen fit="content">`: Souris grabber, the §30 editing header « Annuler | Nouvelle
  vente » (no eyebrow), sticky `SheetActionBar` with the summary and `Valider la vente`, no
  swipe-to-dismiss, no outside tap), like the Product editor — never a full-screen modal that
  would collide with the status bar. An empty sale opens COMPACT, sized by its content (client,
  a small « Aucun produit ajouté » note, search + scan, then the summary right below); the sheet
  grows with lines and results up to `sheet.detent`, where the ONE body scroll takes over and the
  action bar stays pinned. With the keyboard up the sheet shrinks above it; the hardware back of
  a draft with lines asks « Abandonner la vente ? » (the shell's `onLeaveAttempt`);
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
  `Nouvelle vente`. Product Details ends with ONE primary `Vendre ce produit` (bag glyph) in its
  sticky action bar — the draft starts with one unit of that Product; the button is disabled when
  the Sale draft would refuse it (inactive, no stock). `Modifier` moved into the `•••` drawer,
  first, above `Désactiver` / `Réactiver` and `Supprimer`. A sheet route under another route (these
  details under « Nouvelle vente ») ignores the keyboard: only the focused route reacts.

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
  (« Retour » / « Annuler ») above the confirm. For Product and Client administration — deactivate,
  archive, permanently delete — the secondary that aborts the pending action is always
  « Annuler ».
- `tone="destructive"` — rose eyebrow, a whisper-rose surface and a soft rose-FILLED confirm
  (`danger`: `rose100` fill, `rose700` text, no outline) — never an outlined button, never a
  solid danger slab. Used for permanent Client, Product, Service and Appointment
  deletion and for discarding a Sale or Appointment-edit draft.
- `tone="neutral"` — accent eyebrow and a primary confirm: sign-out, Product / Service
  deactivation, Client archiving (reversible actions always confirm first, never in rose), and
  explanation-only dialogs (single « Compris »).
- **Client archiving** — `ARCHIVAGE` · « Archiver cette cliente ? » · « La cliente restera dans
  votre répertoire mais sera déplacée dans les clientes archivées. Vous pourrez la restaurer plus
  tard. » · `Annuler` / `Archiver`. Nothing is written before « Archiver »; the profile stays open.
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
- **Directory birthday** — *(Superseded by §36: Clientes rows end with the Produits chevron and
  show no birthday; the Client Profile shows it.)*
- **Profile birthday glyph** — the Client Profile shows the cake glyph (`shared/icons/birthday-icon.ts`,
  16 pt, accent violet) before the « Anniversaire » value of the `Informations` surface.
- **Birthday today** — the birthday identity is BLUSH on lavender: `rose100` fill with `rose700`
  text / glyph (never `rose600`, which stays the error and destructive rose). Never emoji: the shared
  cake glyph carries it.
  - *Reminder card* (`BirthdayNotice`, Client Profile and Appointment creation / editing): `lav050`
    surface, no border, large radius, a 36 pt `rose100` badge with the glyph, `lav700`
    title, soft-foreground supporting text; the optional action is a white secondary button, also
    borderless. The copy is one accessible element; the action is a separate button. Never an
    alert, an error or a popup.
  - *Compact reminder* (`BirthdayNotice compact`, Cliente step of Appointment creation, under the
    context row): same card with `md` / `sm` padding, a 28 pt badge with a 14 pt glyph, the sentence
    as a `control` title and one supporting line; no action.
  - *Confetti* (`BirthdayConfetti`, Client Profile and Appointment creation — the ONE implementation,
    never a larger variant): 26 small paper pieces fan out from the top
    of the screen, flutter down and fade in 2.2 s, then unmount. Palette: accent violet, lilac,
    lavender, soft rose, `rose200`, `peach200`, one soft gold — no rainbow, no neon. One shared
    value on the UI thread, pointer-transparent, hidden from assistive technology, skipped with
    Reduce Motion, with one `success` haptic. Played once per profile entry (mount) and once per
    explicit birthday-Client selection in creation — never on a re-render.
  - *Appointment Details*: a static 14 pt glyph + « Anniversaire de la cliente » (`metadata`,
    `rose700`) under the date line.
- **Sale glyph on the Client Profile** — « Vendre un produit » carries the bag glyph of the
  « Revente » action of Appointment Details (`shared/icons/sale-icon.ts`: `bag.fill` /
  `shopping_bag`). `AppButton` takes an optional leading `icon`, 18 pt: accent violet on the
  lavender `secondary` fill (as on « Revente »), otherwise tinted like its title (disabled
  included); a button without an icon is unchanged.
- **Client notes** — `TextField` gains a `multiline` mode (same label, shell, focus and colours;
  96 pt minimum, grows with its content instead of scrolling inside the form, Return inserts a
  line break, autocorrect on). The Client form ends with a quiet optional `Notes` field; the
  Client Profile shows a `Notes` section (elevated surface, `body` text, selectable, line breaks
  preserved, never truncated) only when a note exists. Notes never appear in directory rows.
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
- A single flow opens directly: Clientes → the shared Client form; Prestations & tarifs →
  Service creation.
- Several flows expand into a compact menu anchored above the button (fade + rise + light
  scale, `duration.disclosure`; reduced motion renders the end state): right-aligned pills with
  the label and a lavender icon disc, a transparent outside-tap layer, the plus rotating to a
  cross while open. Choosing an option closes the menu first, then runs the flow; leaving the
  screen closes it. No scrim, no drawer, no native action sheet. Produits: « Nouvelle vente »
  (`bag`) and « Ajouter un produit » (`shippingbox`). Agenda: « Nouveau rendez-vous »
  (`calendar.badge.plus` — Appointment creation on the selected day, unchanged), « Résumé du
  jour » in Jour or « Résumé de la semaine » in Semaine — the summary follows the mode, never both
  (`shared/icons/day-summary-icon`, §25) — and « Tops & tendances »
  (`shared/icons/insights-icon`, §34).

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
  - **workflow routes** (Appointment creation / editing) stay NATIVE form sheets
    on the large detent, the one detent iOS 26 keeps attached (`<SheetScreen fit="fill">`);
  - **content-fit routes** (Appointment details, Product / Service details and creation, Sale
    creation) are TRANSPARENT-MODAL routes whose sheet Souris draws itself (`<SheetScreen fit="content">`),
    with the very same `SheetPresentation` as every `BottomSheet` — scrim, slide, material,
    grabber-zone pan, safe area. They are identical to a drawer on every iOS version.
- **Leaving a content-fit route** — nothing special in the screens: `router.back()`, a hardware
  back or a reset is HELD (`usePreventRemove`) while the sheet slides down and the scrim fades,
  then the same action goes through; the route never vanishes instantly. Swipe-down and
  outside-tap follow `dismissible` (off while a Product / Service draft is edited — the former
  `gestureEnabled` rule). A screen guarding a draft against the hardware back (Sale creation)
  passes `onLeaveAttempt` to the shell rather than a second `usePreventRemove` — both would fire,
  and the sheet would slide away under the confirmation. While the keyboard is up, a tall sheet
  keeps the detent's top gap and shrinks above the keyboard (its body scrolls) instead of pushing
  its header off the screen. Only the TOP sheet reacts to the keyboard (`sheet-layers.tsx`): a
  sheet covered by a drawer presented from inside it (« Encaisser la vente » over « Nouvelle
  vente », a picker over an Appointment form) stays exactly where it is, so its fixed actions
  never surface behind the active sheet. A native workflow sheet pushed from a content-fit route (« Modifier »)
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
- **Keyboard accessory** — the decimal / number pad has no return key. Checkout amounts use the
  shared `KeyboardDismissAccessory`: the native `InputAccessoryView`, drawn on the sheet's own
  overlay material (so the strip reads as the bottom of the active sheet and never uncovers what
  lies beneath), holding ONE compact right-aligned pill « OK » (≥ 44 pt, `surfaceLavenderStrong`
  fill, lavender hairline, plum label, « Fermer le clavier » for assistive tech). It only
  dismisses the keyboard: values stay, nothing is submitted. iOS binds one accessory view to ONE
  input (React Native attaches it to the first input carrying its `nativeID`, once, at mount), so
  every amount field (Carte, Espèces) renders its own instance with its own stable id — same
  component, same look; moving Carte ⇄ Espèces swaps two identical pills and never closes the
  keyboard. An input still relying on React
  Native's own accessory (`returnKeyType="done"`, hardcoded « Done ») must set
  `inputAccessoryViewButtonLabel="OK"` (Appointment deposit). No English string in Souris-owned UI.
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
  wraps and is never scaled down — no `adjustsFontSizeToFit`; full and compact share the same
  `sectionTitle` size, and text growth is capped (`navigatorDateMaxFontScale`) instead. It replaces the Agenda seven-day strip, which is gone
  from the Day view. Under it, one quiet violet `metadata` line: « Aujourd’hui » as plain text on today,
  « Revenir à aujourd’hui » as the way back elsewhere. The date itself and the calendar button
  open `MonthCalendarSheet` (`src/shared/ui/`, replacing the former `DayPickerSheet` wheel): the
  month of the selected day, Monday first, its month row the shared `PeriodNavigator` with the
  same glass « Mois précédent » / « Mois suivant » arrows; adjacent-month days muted but
  tappable; a tap selects the day and closes — no « Valider ». Selected = the `lav100` fill and a
  violet number; today = a violet ring. The calendar is domain-agnostic: each caller decorates
  the days with presentation data only. Agenda: ONE quiet violet dot on days holding
  appointments. Caisse: a soft 44 pt halo behind the number (`calendarIntensity` low / medium /
  high — the Souris violet at 16 / 30 / 48 %, never red / green, never a gradient), relative to
  the best day of the DISPLAYED month (> ⅔ of it high, > ⅓ medium, otherwise low), none on zero
  days nor on adjacent-month days; the halo sits behind the selected fill and the today ring,
  and an unselected today keeps a navy number on a halo. No amount is written in a cell;
  VoiceOver speaks it (« Samedi 29 août, 115 euros encaissés »). Caisse only: on the first
  opening, a compact white card (`radii.large`, hairline border, `raised` shadow) floats over the
  lower part of the days — « Intensité du chiffre d’affaires », one sentence that the tint is
  relative to the other days of the month, a Faible / Moyen / Élevé legend drawn with the
  calendar's own halo (`MonthCalendarIntensitySwatch`), and « Compris ». Understood once per
  device (`souris_metadata`, never synced); a quiet plum ⓘ under the grid, outside the glass
  month row, reopens it. Every appearance materialises in place (opacity 0 → 1, scale 0.96 → 1,
  10 pt → 0 on a nearly critically damped spring, the three legend samples fading in 35 ms
  apart); « Compris » leaves faster (160 ms fade, scale 0.98, 4 pt down). Reduce Motion: a short
  fade only. Agenda Semaine and Caisse Mois keep their own previous / next rows.
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

---

## 22. Appointment UX Polish — Explicit Sheet Close, Service Type Colours, Selected Names

Three independent presentation decisions. Data, editing, deletion, pricing, navigation, sheet
gestures, sheet sizing and card geometry are unchanged.

- **Appointment details — explicit « Fermer ».** The swipe on the grabber and the outside tap stay
  exactly as they are (§16); they are joined by the visible « Fermer » text action of every Souris
  sheet — the tertiary `AppButton` that `SheetHeader` uses (§16) — at the right of the identity
  header. Never an icon-only ✕: sheets say « Fermer » / « Annuler » in words. It is the SAME way
  out as the gestures: one `router.back()`, which `SheetScreen` holds while the close transition
  plays. No haptic, no state reset of its own.
- **Service picker cards — colour is the service TYPE.** *(Superseded by §28: mint / lavender
  cards are gone; the shared card catalogue uses the §27 category colours.)* Supersedes the « borderless, stronger
  lavender surface, no outline » wording of §7 for the shared `ServiceSelectionGrid` (Appointment
  creation and editing). `serviceCardColors` (tokens) resolved by
  `features/appointments/editor/service-card-palette.ts` from the Service `type` field — never
  from its name:
  - `SERVICE` (simple) → **mint**: `mint050` surface, `mint200` border, `mint700` name, `mint650`
    duration. A category colour, never a success / validation colour.
  - every other type (`TECHNIQUE`) → the existing **lavender**: `lav050` surface, `lav200` border,
    `lav700` name, `foregroundSoft` duration.
  - **Selected** stays inside the family: stronger surface (`mint100` / `lav100`), stronger border
    (`mint600` / `accent`), check badge in that same strong tone. Green never means « selected ».
  - The `mint` scale mirrors the lavender OKLCH lightness steps at hue 160; its 600 / 700 sit on
    the approved mint planning-card accent / title (§19). Price stays navy and « dont X de pose »
    stays peach on both families. The 1.5 pt border lives inside the card box and the padding
    gives it back, so content position and card size are unchanged.
  - Prestations & tarifs, the Résumé accordion cards and Appointment details keep their lavender
    language: they do not compare types side by side.
- **Selection footer names the services.** Completes §7: under the violet count line of the
  creation footer, ONE quiet `metadata` line in `foregroundSoft` lists the selected Service names
  in selection order — « Balayage 3 · Coupe brushing · Reprise ». Names only (no duration, no
  price, no type colour), two lines at most with an ellipsis beyond, hidden while nothing is
  selected; the count always stays whole. Appointment Editing needs no such line: its selected
  Services are the named stack above the grid.
- **Clientes count.** *(Superseded by §36: « Clientes » is a plain title again; the counts live in
  the « Actives » section header or the Actives / Archivées tabs.)* `MainScreenHeader` takes an
  optional `count`: the number of ACTIVE Clients
  (the session's `activeClients`, never the search results) sits beside the untouched « Clientes »
  title as white `chip` figures in a small soft-violet pill (`appointmentPastels.lilac.accent` —
  the lightest approved violet that keeps white readable, 4.9:1; same geometry as the
  `SectionHeader` count chip).
- **Watermarks on Caisse and Prestations & tarifs.** The §16 main-screen watermark (same size,
  opacity, right crop and rise) also identifies the two pushed management screens, with the
  symbols of their Plus rows (`banknote` / `payments`, `scissors` / `content_cut`). Their title
  scrolls with the content, so the icon lives in `PushedScreenWatermark`: a full-width zero-height
  anchor under the top bar, lowered to where the title starts, outside the scroll view — never
  clipped by it, and the content scrolls over it. Prestations section headers lose their
  (invisible, non-sticky) page-coloured fill so the glyph is not cut by a band. Caisse later
  quiets its banknote (§31).

---

## 23. Appointment Discount — « Réduction »

A discount is a normal professional action, never an error or a warning: no rose, no strike-through
price, no badge on Agenda cards (their geometry and content are unchanged).

- **Secondary by default.** In the Résumé step and in « Modifier le rendez-vous », « Réduction » is
  ONE collapsed row on the neutral `surface` (`radii.large`): a 16 pt accent price-tag glyph
  (`shared/icons/discount-icon`: `tag` / `sell`, decorative, hidden from accessibility, row height
  unchanged), the `control` title, a quiet `metadata`
  value (« Aucune » in `foregroundSoft`; `-20 % · -20,00 €` or `-15,00 €` in `lav700` once set) and
  the shared `DisclosureChevron`. It opens expanded only when the Appointment already has a discount.
- **Open.** The shared `SegmentedControl` with two options, `%` and `€` (spoken « Réduction en
  pourcentage » / « Réduction en euros »), then the ten presets as chips — five per row, 40 pt high
  with vertical hit slop up to the platform touch target, `radii.medium`, white on the neutral
  surface with a `borderSubtle` hairline. `%` chips show the bare number (the switch carries the
  unit); `€` chips show `15 €`. Tabular figures throughout.
- **Selected chip.** `lav100` fill, 1.5 pt `accent` border, `control` weight, `lav700` text, plus
  `accessibilityState.selected` — and the chosen value is always written in the row header, so
  selection never relies on colour alone. Each chip is spoken « Réduction de 20 pour cent » /
  « Réduction de 15 euros ».
- **Removal.** Once a discount is set, the footer shows `Total après réduction` and, under it, the
  accent text action « Aucune réduction » (spoken « Supprimer la réduction »). Switching `%` ↔ `€` alone
  changes nothing until a value is tapped.
- **Final amount.** The label `Total après réduction` stays quiet `metadata`; only the AMOUNT is
  stronger — `control` weight in `lav700`, tabular, right-aligned. Same hierarchy everywhere the
  discounted total shows: `summaryValue` for « TOTAL À ENCAISSER » (Details) and « Total » (Résumé),
  `control` for « Total attendu » (checkout), always above quiet `metadata` discount lines. The
  discount never outweighs the amount to charge.
- **Haptics.** ONE `haptics.selection()` per real change: a newly chosen preset, the removal, and
  the `%` / `€` switch (given by `SegmentedControl` itself, only when the mode changes). Re-tapping
  the selected preset or the current mode does nothing. No success / warning feedback here.
- **Ticket.** Appointment Details keeps the « Prestations » banner as the GROSS amount and adds ONE
  restrained `metadata` line above « TOTAL À ENCAISSER »: `Réduction -20 %` (or plain `Réduction`)
  with the negative amount in `lav700`. The Résumé step shows the same two lines (`Prestations`,
  `Réduction …`) above its total; the checkout sheet lists the line in its expectation block. None
  of these lines exists without a discount.

---

## 24. Calendar Blocks — « Indisponible »

Personal unavailability (`docs/domain/CALENDAR_BLOCKS.md`) must be recognised instantly on the Agenda
WITHOUT looking like a client Appointment, and must read as the same product: calm, premium, obvious,
fast — never a technical admin form, never a grey disabled state.

- **One dedicated family — mauve.** `mauve` in `theme/colors.ts`, derived like every Souris scale from
  OKLCH, at hue 326: between the structural lavender (300) and the brand plum (336).

  ```text
  mauve050  #FBEFFB  oklch(0.965 0.020 326)   form / details / conflict surface
  mauve100  #F2D8F2  oklch(0.910 0.045 326)   Agenda block fill, icon badge
  mauve200  #EAC4EA  oklch(0.865 0.065 326)   pressed fill
  mauve600  #823F84  oklch(0.48 0.13 326)     accent: left border, glyph, Week marker
  mauve700  #68376A  oklch(0.42 0.10 326)     reason text
  title     brand.plum #5F1852                « Indisponible »
  ```

  Screens use the SEMANTIC token `calendarBlockColors` (`background`, `backgroundPressed`, `accent`,
  `title`, `subtitle`, `surface`), never the scale and never a HEX.
- **Same colour = availability block.** Every block uses this one family whatever its reason; client
  pastels (§19) keep identifying clients. The fill is further from every client pastel (ΔE_ok ≥ 0.037)
  than those pastels are from one another (0.006–0.023), and no client palette can resolve to it
  (tested). Contrast on the fill: title 9.1:1, reason 6.8:1, accent 5.3:1.
- **Not a status, not a warning.** Flat solid fill like the planning cards — no gradient, no neon, no
  red, no hatching, no opacity trick.
- **Agenda Day card.** The Appointment card construction (flat fill, 3 pt solid left accent,
  height-following radius, `cardPressedScale`), so it belongs to the same planning language:

  ```text
  ≥ 32 pt    [glyph] Indisponible     rowTitle, plum          two lines
             Déplacement              metadata, mauve700
  16–32 pt   Indisponible · Pause     chip + metadata         ONE line — 15 to 25 minute blocks
  < 16 pt    colour only                                      never a squeezed or smaller font
  ```

  The densities are the Appointment card thresholds (`getAgendaSegmentDensity`). « Indisponible » is
  the primary information, the reason secondary. No client, service, price or birthday line.
- **Glyph.** `shared/icons/calendar-block-icon`: `calendar.badge.clock` / `event_busy`, 12 pt on the
  card, 13 pt in the Week row, 16–18 pt in a 28 / 36 pt `mauve100` pill badge on sheets. Always
  decorative and hidden from accessibility: recognition never depends on it, nor on colour — the word
  « Indisponible » is always written, and the block is announced
  « Indisponible, Déplacement, de 10 heures à 11 heures 30 ».
- **Agenda Week row.** The Week Appointment row construction (3 × 26 marker, 54 pt time column, two
  lines, 56 pt minimum): mauve marker, glyph + « Indisponible » in plum, then
  « Déplacement · jusqu'à 11:30 » in `mauve700`. Pressed: `mauve050`. Blocks are never counted in
  « n rendez-vous »; the day header says « 1 créneau indisponible » to assistive technologies.
- **Creation — « Cliente | Personnel ».** The shared light-glass `SegmentedControl` (§21), directly
  under the sheet header; no new switch style. Spoken « Rendez-vous cliente » / « Rendez-vous
  personnel ». Both modes share the editing header of §27 (« Annuler » leading, one title): « Nouveau
  rendez-vous » in « Cliente », « Indisponible » in « Personnel » — no eyebrow. In « Personnel » the
  stepper, the context row, every step and the step action bar are replaced by ONE form, in the same
  row language as the Cliente step:
  - `CRÉNEAU` (`eyebrow`, `foregroundSoft`) over ONE `GroupedSurface` of three `GroupedDataRow`s:
    **Date** read-only (calendar glyph, « Mar. 25 août », no chevron, not a button, spoken « Date,
    mardi 25 août »), then **Début** and **Fin** (clock glyph, tabular time, chevron; spoken « Début,
    14 heures 30 »). Tapping one turns its chevron and opens the shared `TimeWheelPicker` (5-minute
    step) inside the group, with the usual « Terminer » text action; one picker at a time. An end
    that is not after the start says so in `rose600` `metadata` under the group. No context card;
  - **Motif** — pill chips, 40 pt high with vertical hit slop up to the touch target, white on the
    sheet with a `borderSubtle` hairline. Selected: `surfaceLavender` fill, 1.5 pt `accent` border,
    `accent` text, `accessibilityState.selected` (radio). « Autre » reveals the shared `TextField`
    (« Précisez le motif »), focused only when the professional tapped it;
  - the primary `AppButton` « Bloquer le créneau » in the shared `SheetActionBar`.
- **Conflict notice.** `ScheduleConflictNotice` — `mauve050`, 28 pt badge, a plum `control` sentence and
  a `mauve700` `metadata` line naming what is in the way. One accessible element, announced politely.
  Calm but obvious; never a dialog, never red — nothing went wrong, the slot is taken. The save action
  is disabled while it shows. Used by the block form AND by Appointment creation (above the Résumé
  actions) and editing (above the action bar). Appointment Details shows the same notice under
  « Prestations » when a quick edit (durations, reorder, removal) was refused — « Ce changement ferait
  empiéter le rendez-vous sur un créneau indisponible. » / « Indisponible — Pause, 10:00–11:00 » — with
  ONE `warning` haptic; it is replaced or cleared by the next quick edit. Nothing there is disabled in
  advance: the steppers stay free, the refusal happens on « Enregistrer », the drop or the swipe.
- **Details sheet.** The canonical content sheet (§16, §20): `DetailSheetHeader` while reading —
  « Indisponible » leading, then « ••• » (spoken « Actions ») and × (spoken « Fermer »), as in
  Appointment Details; `SheetEditingHeader` (§30, « Annuler » + « Modifier le créneau ») while
  editing. A `mauve050` card: badge + Motif, a hairline, then Date and Horaire lines — and nothing
  below it. « ••• » opens the shared `DetailActionsSheet`: « Modifier », then « Supprimer »
  (`rose600`) in its own group, run from `onDismissed`. Swipe-down and outside tap close it;
  « Modifier » slides the form in as a second sheet (`contentKey`) and turns both off while a draft
  exists. Deletion goes through the shared `ConfirmationDialog`.
- **Haptics.** One interaction = one haptic: the `SegmentedControl`'s own selection tick on a mode
  change; one `selection` per real chip change or opened time card (re-tapping the chosen chip does
  nothing); `success` on a committed save; `warning` on a committed deletion, as for Appointments.
- **Motion.** None of its own. Normal sheet transitions only; nothing to reduce.

## 25. Daily Summary — « Résumé du jour » Receipt Printer

The second action of the Agenda + menu (§17) prints the summary of the day THE AGENDA IS SHOWING —
not necessarily today — as a receipt. A small signature moment: premium and playful, never
cartoonish, and never a wait. Figures: `docs/domain/APPOINTMENTS.md` §25c.

- **Presentation** (`shared/ui/ReceiptPrinter.tsx`, shared with §34). Its own transparent Modal, not
  the bottom sheet: the Agenda dims under the ONE `scrim`, a printer capsule lands under the top safe
  area, the paper feeds DOWN out of it and settles, a close button waits under the paper.
- **Printer capsule.** App-owned — never the real Dynamic Island, which it simply sits below on the
  devices that have one; identical everywhere else. The shared light glass (`GlassSurface` floating,
  `nativeShadows.glassFloating`, §21): a 32 pt pill, 10 pt wider than the paper on each side, a navy-alpha
  groove (`receiptPaper.slot`) in its lower half and one 5 pt `mint600` status light. No plastic, no
  illustration, no glyph. Decorative: hidden from accessibility, no touches. Geometry: `receiptPrinter`
  in `theme/layout.ts`; the insets come from the launch window metrics, as for sheets (§16).
- **Motion** (`receiptPrint` in `theme/motion.ts`, Reanimated on the UI thread). Capsule fade + 8 pt
  drop (160 ms) → 120 ms → the paper travels out of the groove in 1000 ms (`cubic-bezier(.42, 0, .3, 1)`:
  soft start, even travel, gentle arrival) → one 5 pt give and back (110 + 200 ms). Readable in about a
  second. The paper is laid out at rest inside a clip whose top edge is the middle of the groove and
  is translated by its own measured height: it only ever exists below the slot. The paper is the
  object — no line animates on its own. Closing: paper, capsule and scrim fade together in 220 ms, the
  paper sinking 8 pt; the Modal unmounts afterwards.
- **Haptic.** ONE `haptics.print()` (light impact) when the paper starts feeding. Nothing during the
  travel, nothing on close, no sound.
- **Reduced motion.** No travel, no settle, no drop: the receipt is in place at once and the
  presentation fades. The haptic stays. Everything remains available.
- **Paper** (`shared/ui/ReceiptPaper.tsx`, filled by `DaySummaryReceipt.tsx`). `receiptPaper.surface` `#FEFBF7` — oklch(0.99 0.006 80), a warm
  near-white, FLAT: no grain, no texture, no gradient, no serif, no handwriting. Contrast on it:
  foreground 16.6:1, plum 11.7:1, foregroundSoft 8.3:1, mint700 7.8:1, accent 5.3:1. Square corners with
  torn top and bottom edges: a row of 45° paper-coloured squares clipped to their outer half, tiling
  the width exactly (`receiptPrinter.toothWidth`). `nativeShadows.lifted`. Width: the window minus
  26 pt on each side, 372 pt at most. Dashed tear lines (`receiptPaper.separator`) between sections.
- **Hierarchy**, top to bottom, Plus Jakarta Sans only:

  ```text
  header     40 pt lavender100 disc + glyph · « Résumé du jour » sheetTitle (the header) ·
             « Lundi 21 septembre » control, plum · « 7 rendez-vous » metadata        centred
  list       09:00 chip, tabular │ services rowTitle + client metadata │ amount control, tabular
             a mint600 check before the amount of a checked-out Appointment
  total      lavender050 panel, radii.large: « CA POTENTIEL » eyebrow, accent ·
             the amount in `display` 34 / 700, plum, tabular — THE strongest value
  breakdown  Déjà encaissé (value mint700) · Reste à encaisser · Temps total · Panier moyen
             body label, foregroundSoft ↔ control value, tabular
  footer     the Souris wordmark, 84 pt, decorative
  ```

  On a long day only the LIST scrolls; the header and the totals never leave the paper, whose height
  is bounded by the capsule above and « Fermer » below.
- **Empty day.** The same paper: « Aucun rendez-vous » in the header, « Cette journée est libre » /
  « Aucun rendez-vous prévu. » in place of the list, every figure at zero. Never an error, never a
  refusal to open.
- **Dismissal.** An icon-only close button (`GlassIconButton`: 44 pt floating light-glass circle,
  accent `xmark` / `close` glyph), spoken « Fermer », centred above the home indicator — the SAME
  button, in the same row, as the « Tops & tendances » actions (§34). Also: a tap on the dimmed page
  (« Fermer le résumé du jour »), the hardware back button, the accessibility escape gesture.
  Supersedes, for the two receipts only, the worded « Fermer » of §22 (« never an icon-only ✕ »):
  sheets keep their words.
- **Accessibility.** The Modal is `accessibilityViewIsModal`. Each row is ONE element —
  « 09:00, Coloration, Léa Martin, 95,00 €, encaissé » — as are the total and each breakdown line.
  « encaissé » is never colour alone: a check glyph and the spoken word.
- **Wording.** Souris has no deposit: the line reads « Déjà encaissé », never « Acomptes ».

### 25a. Weekly Summary — « Résumé de la semaine »

The + menu follows the Agenda mode: Jour → « Résumé du jour », Semaine → « Résumé de la semaine »
(same glyph, same place). The weekly receipt summarises the week THE AGENDA IS SHOWING — the same
Monday → Sunday as Week mode (`getWeekDays`), following its navigation. It is the SAME object as
§25: `WeekSummaryTicket` hands `DaySummaryReceipt` to the same `ReceiptPrinter` and `ReceiptPaper`
— same capsule, motion, haptic, dismissal (« Fermer le résumé de la semaine » on the dimmed page),
no share or save (the daily receipt has none). Figures: `docs/domain/APPOINTMENTS.md` §25c.

```text
header     disc + glyph · « Résumé de la semaine » (the header) ·
           « 21 – 27 septembre 2026 » control, plum · « 18 rendez-vous » metadata
activity   Réalisés · Prévus · Annulés · Absences — body label ↔ control value,
           each ONE spoken element (« 14 rendez-vous réalisés »)          in place of the list
total      « CA POTENTIEL », exactly as §25
breakdown  Déjà encaissé · Reste à encaisser · Temps total · Panier moyen, exactly as §25
footer     the Souris wordmark
```

- **Range.** Months written in full, the year once: `21 – 27 septembre 2026`,
  `28 septembre – 4 octobre 2026`, `28 décembre 2026 – 3 janvier 2027`.
- **Compact.** No Appointment list, no seven daily sections, no chart. An empty week is the same
  paper: « Aucun rendez-vous », every line at zero.
- **Large text.** The activity lines scroll like the daily list; the header and totals stay.

---

## 26. Appointment Details — Checkout-First Sheet

Supersedes, for Appointment Details only: the worded « Fermer » of §22 (« never an icon-only ✕ »),
the `Revente` pill of §14 and the gross « Prestations » banner + « TOTAL À ENCAISSER » row of §23.
Data, eligibility rules, handlers, sheet gestures and sizing are unchanged. ONE layout for every
status; only the data (status pill, available actions, CTA) changes.

- **Header.** Rose accent bar, `RENDEZ-VOUS` eyebrow, client name (`sheetTitle`, two lines max).
  On the right, two `GlassIconButton`s (§21): « ••• » (spoken « Actions du rendez-vous ») and ✕
  (spoken « Fermer »). The ✕ is the same `router.back()` as the swipe and the outside tap.
- **Metadata.** No card: calendar glyph + date, clock glyph + time range (`body`, soft glyphs),
  the status pill on the right, closed by a hairline. Pill = dot + label on a light fill of the
  same family: `scheduled` lavender, `current` mint (« En cours »), `completed` neutral,
  `exception` rose. « En cours » is presentation only — a live Appointment whose time range
  contains now; the stored status never changes. The label is always written.
- **Prestations.** ONE white grouped list (`surfaceElevated`, `borderSubtle` hairline,
  `radii.large`) with inset separators: accent start time, `control` name, soft duration · phases,
  navy price in a fixed column, then the accordion chevron (an empty slot when the row cannot
  open). On an editable Appointment the reorder handle stays: reordering is a documented Details
  quick edit (`docs/domain/APPOINTMENTS.md`). Swipe-to-remove unchanged.
- **Summary.** One white surface, two columns: « Durée totale » and « Nombre de prestations »,
  each with a 20 pt accent glyph. No amount.
- **« Ajouter une vente ».** The Revente as a light white row: accent ⊕, accent label, chevron.
  Secondary to checkout; hidden for an archived Client.
- **« ••• » actions.** A `BottomSheet` action list under `SheetEditingHeader` (« Fermer » leading,
  « Actions du rendez-vous » centered, no client name). Short visible labels, full spoken ones:
  Modifier (navy, accent glyph), Annuler and Marquer comme absente (`rose700`), then « Supprimer »
  (`rose600`) in its own group. Only eligible actions are listed. The chosen action runs from
  `onDismissed`, so the next drawer, dialog or route never races the closing list. Deletion keeps
  the shared `ConfirmationDialog` (confirm / blocked). The cancellation and no-show confirmations use the same
  `SheetEditingHeader` (« Fermer » + « Annuler le rendez-vous » / « Marquer comme absente »), no
  eyebrow.
- **Sticky checkout footer.** `SheetActionBar` below the scroll (hairline on top): « Total à
  encaisser » (`metadata`) over the amount (`summaryValue`), then a quiet `Réduction … · -X €` line
  when a discount exists; on the right the primary violet CTA naming the amount — « Encaisser
  95,00 € », or « Enregistrer 95,00 € » on a completed Appointment without payment. No CTA when
  checkout is not allowed; the total stays. The recorded payment summary stays in the body.

---

## 27. Modifier le rendez-vous — Editing Workspace

Supersedes, for « Modifier le rendez-vous » only: the lavender context card, the Prestations editor
cards, the two-column mint / lavender catalog grid of §22 and the « Annuler | Enregistrer » footer.
Drafts, dirty-state guard, Calendar Block rule, discount logic, save and discard are unchanged.
Appointment Creation keeps §22 for now.

- **Header.** « Annuler » (tertiary, leading) then the title « Modifier le rendez-vous »
  (`sectionTitle`, one line, shrinks slightly before truncating). The grabber stays above. No
  second « Annuler » in the footer. A dirty draft is still guarded by the shared dialog.
- **ONE vertical scroll** — Rendez-vous, Prestations sélectionnées, Options, Ajouter des
  prestations — and the footer outside it. No nested vertical list.
- **Rendez-vous.** `RENDEZ-VOUS` eyebrow over one white grouped surface (`GroupedSurface`: the §26
  recipe) with three whole-row actions: accent glyph, label (`body`, soft), value (`control`, right,
  truncating), chevron. Cliente → client picker, Date → date picker, Heure → the inline wheels
  under the row (the chevron turns). No « Modifier la cliente » link labels; they are the hints.
- **Prestations sélectionnées.** Count badge; ONE grouped list with inset separators. Reorder
  handle leading, a small category dot, name, duration · pose, price column, accordion chevron
  (price + durations, unchanged). Swipe-to-remove unchanged, square on the white surface.
- **Options.** « Réduction » as a white grouped row; birthday reminder above it as before.
- **Ajouter des prestations.** *(The dense list is superseded by the shared card grid of §28;
  search, segment, empty state and add-only taps are unchanged.)* Search, then a full-width
  Services / Techniques `SegmentedControl`, then ONE dense list of the chosen type — the same row for both categories: category dot, name
  (two lines max), duration · « dont X de pose », price, and a selection ring (empty) or filled
  check. Search filters inside the chosen category; when only the other one matches, the empty
  state offers « Voir N résultats dans Techniques ». Tapping a selected row still adds nothing.
- **Category colours** (`serviceCategoryColors`, keyed by `ServiceType`) — taxonomy, never state:
  SERVICE = Souris violet (`colors.accent`); TECHNIQUE = azure (`azure600 #4F8EDC` for dots and
  checks; `azure700 #2F6DB8` fills the active segment, 5.3:1 with white). Selected rows take a
  whisper tint of their category. Never green or rose for a category. Never colour alone: segment
  label and tab state, selection ring vs check with `selected` state, and the spoken category on
  selected prestations.
- **Sticky footer.** Hairline on top; « N prestations · durée » (`control`) and the net amount
  (`sectionTitle`, violet) from the domain services total, live; the Calendar Block notice when
  relevant; one full-width violet « Enregistrer les modifications », disabled while nothing
  changed. Always violet, whatever category is shown.

## 28. Nouveau rendez-vous — Aligned With the Editing Workspace

The creation sheet speaks the §27 language. Flow, steps, rules and data are unchanged.

- **Header.** The §27 editing header in both modes: « Annuler » leading, then « Nouveau
  rendez-vous » (Cliente) or « Indisponible » (Personnel). No eyebrow, no step title — the
  segment names the mode, the stepper the step.
- **Rendez-vous.** On Cliente AND Prestations, `RENDEZ-VOUS` over one `GroupedSurface`: **Date**
  read-only (the Agenda day: no chevron, not a button) and **Heure** (chevron; the whole row
  opens the start-time wheels inline). No « Changer l'horaire », no Client row — the Client is
  chosen in the search + list of the Cliente step, whose rows are separated by hairlines.
- **Shared prestation catalogue.** `ServiceCatalogPicker` + `ServiceSelectionCard` serve BOTH
  creation (Prestations step: a tap toggles) and editing (Ajouter des prestations: a tap adds).
  Search, full-width Services / Techniques segment (`serviceCategoryColors[type].strong` fill),
  then a two-column grid of cards of the chosen type; search filters inside it and offers the
  other category when only that one matches. Card: name (two lines max), duration or « 1 h ·
  dont 30 min de pose », price. Idle: white surface, the category `border` hairline. Selected:
  the category `tint`, a 1.5 pt `accent` border and an `accent` check badge. Violet for Services,
  azure for Techniques; never mint. Spoken « Balayage 1, 1 h dont 30 min de pose, 45,00 €,
  Technique » with the selected state.
- **Footers.** Creation keeps the count + names line above « Précédent | Continuer »; editing
  keeps its §27 footer.

## 29. Client Profile — Compact Dashboard and Client Histories

The profile is a dashboard; the histories are exhaustive pushed screens. Data, rules and
lifecycle are unchanged.

- **Header.** Glass back, a centred « Cliente » title, « Modifier » trailing.
- **Activité.** One `GroupedSurface`, a 2 × 2 grid split by hairlines. Each metric: a small
  accent glyph in a `surfaceLavender` circle, the value in navy `summaryValue`, the label in
  `metadata`. Numbers are never violet.
- **History area.** Right under Activité, a full-width `SegmentedControl` « Rendez-vous [n] |
  Produits achetés [n] » (default Rendez-vous, plain local state). Options may carry a count
  pill: `surfaceLavenderStrong` + accent text, accent + white on the selected option, `999+`
  beyond 999, spoken « Rendez-vous, 20 ». The segment replaces ONLY the preview below it.
- **Preview.** At most three rows (`CLIENT_HISTORY_PREVIEW_LIMIT`) in one `GroupedSurface`
  with inset hairlines: appointments upcoming-nearest-first then newest past; Sales newest
  first. Beyond three, a trailing accent « Voir les 20 rendez-vous › » / « Voir les 8 achats › »
  pushes the complete history — never an inline expansion. Empty: one compact line
  (« Aucun rendez-vous enregistré. » / « Aucun achat enregistré. »).
- **Rows.** Appointment: date (`Mar. 22 sept.`, year only outside the current one) over time,
  prestation summary (+ status in rose for cancellations / no-shows), amount, muted chevron;
  the whole row opens Appointment Details. Sale: product summary, `date · ×1` or
  `date · 3 produits`, total; read-only (no Sale detail exists).
- **Complete histories.** Pushed full screens (`clients/appointments/[clientId]`,
  `clients/purchases/[clientId]`): centred title with the client's name under it, a
  virtualized list whose rows carry the grouped surface slice by slice. Appointments filter
  « Tous | À venir | Passés » from the existing upcoming / history split; a multi-product Sale
  lists each line.
- **Order.** Identity, `Vendre un produit`, birthday, next appointment, Activité, history,
  Informations, Notes, then the tertiary archive action.

## 30. Standard Sheet Header — « Annuler » Leading, Title Centered

Creation and editing sheets use ONE header: `SheetEditingHeader` (`src/shared/ui`), the §27
recipe — « Annuler » (tertiary, leading) and the title CENTERED on the header (`sectionTitle`, one
line, fixed size: it truncates, never auto-shrinks — measured during a sheet's entry animation,
`adjustsFontSizeToFit` left the checkout title unreadably small). The title is its own layer inset by
the SAME width on both sides — the measured width of the wider side action — so it is truly centered
whatever the width of « Annuler », and a long title truncates before reaching it; no empty placeholder
button. Used by « Nouveau rendez-vous » (and its « Indisponible » mode), « Modifier le rendez-vous »,
« Nouvelle vente », « Nouvelle prestation », « Modifier la prestation », « Ajouter un produit »,
« Modifier le produit », « Ajouter une cliente », « Modifier la cliente », the
checkout sheet (« Encaisser le rendez-vous », « Encaisser la vente », « Modifier l’encaissement »)
and the pickers opened from these flows: « Choisir la cliente » (« Fermer ») and « Date du
rendez-vous » (« Annuler »).

- Cancel is always on the left. Equivalent sheets never move it to the right.
- No redundant eyebrow when the title already names the sheet.
- The trailing slot is only for a distinct action (« Enregistrer », a menu), never Cancel.
- The label stays « Annuler » when an operation is abandoned; the spoken label names what is
  abandoned (« Annuler la vente »). A picker that only dismisses keeps « Fermer », in the same
  leading place.
- `SheetHeader` (eyebrow, large title, trailing « Fermer ») stays the header of read-only
  drawers and short sheets — the Appointment actions menu, the danger-toned « Annulation » /
  « Absence » confirmations — and never of a creation, editing or picker sheet.

## 31. Caisse — Collected Money and Its Encaissements

Caisse shows money ACTUALLY collected; potential revenue, planned appointments and « reste à
encaisser » stay in « Résumé du jour ». Payment rules, data and Jour / Mois semantics are
unchanged.

- **Order.** Top bar (glass back, « GESTION »), « Caisse », `SegmentedControl` Jour | Mois,
  period navigation, « Total encaissé », card / cash breakdown, « Encaissements », then the
  empty state or the list. Same structure in both modes and at zero.
- **Watermark.** The §22 banknote stays as the screen's signature, quieter than on the main
  screens: `screenWatermarkOptics.cashRegister` scales it down (0.72), lifts it slightly and
  lowers its opacity (0.05), so it sits beside the title and the switch, never behind the
  figures. Same right anchor, decoration only.
- **Period navigation.** ONE control: the shared `PeriodNavigator` (§32). Jour is the shared
  `DateNavigator`; Mois shows « Septembre 2026 » with a quiet violet « Ce mois-ci » on the
  current month, otherwise the « Revenir à ce mois-ci » link.
- **Total encaissé.** One `surfaceLavender` card: the label in `foregroundSoft`, the amount in
  navy `display`. No period sentence, no count, no empty wording; the period is spoken with it
  (« Total encaissé aujourd’hui : 245,00 € »).
- **Breakdown.** One `GroupedSurface`, one column per payment method (Carte | Espèces) split by
  a hairline: small accent glyph in a `surfaceLavenderStrong` tile, label in `metadata`, value
  in navy `summaryValue`.
- **Encaissements.** `SectionHeader` with its count chip, spoken « Encaissements, 4
  encaissements ». Rows come from the same domain selection as the totals
  (`getCashRegisterDayEntries` / `getCashRegisterMonthEntries`), oldest payment first: time
  (Mois: the day above it), client name and amount as primary, source and method as
  secondary (`Carte`, `Espèces`, `Carte + Espèces`). An Appointment checkout lists its
  prestations and opens Appointment Details (muted chevron); a standalone Sale reads
  « Vente · products » and stays read-only — no Sale detail exists.
- **Empty.** A compact `surfaceLavender` block: 44 pt glyph circle, « Aucun encaissement
  aujourd’hui » (ce jour / ce mois-ci / ce mois), « Les paiements encaissés apparaîtront
  ici. » Never taller than it needs; the page may end in whitespace.
- **No** chart, illustration or extra KPI. Amounts stay navy: green is not introduced here.

## 32. Grouped Period Navigation — Agenda and Caisse

Every period control is ONE module: `PeriodNavigator` (`src/shared/ui`). Previous, the period,
an optional extra control, then next, on one `surfaceElevated` surface (`borderSubtle`
hairline, `radii.large`, `spacing.sm` padding). The glass circles (§21) are unchanged.

- **Users.** `DateNavigator` (Agenda Jour, Caisse Jour) adds the calendar before next; Caisse
  Mois and Agenda Semaine have no extra control.
- **Copy.** Period in navy `sectionTitle`, centred. Under it, one quiet violet `metadata` line:
  a static indication (`PeriodNavigatorNote`: « Aujourd’hui », « Ce mois-ci », « Cette
  semaine ») or the way back (`PeriodNavigatorLink`: « Revenir à aujourd’hui », « Revenir à ce
  mois-ci »). Agenda Semaine offers no way back: its behaviour is unchanged.
- **Agenda placement.** Inset by the page gutter under the `Jour | Semaine` header, `spacing.xs`
  above and `spacing.sm` below; it replaces the old full-width row and its hairline. The
  timeline keeps its own top inset; the Agenda watermark is unchanged.

---

## 33. Appointment Deposits — « Acomptes » in Details, the Deposit Sheet, the Shortfall Notice

Extends §26 (Details) and §30 (sheet header); nothing else changes. Deposits must read as part of
the Appointment's payment, not as a new mini-app: the same white grouped surfaces, the lavender
money surface of the checkout sheet, violet accents, no gradient, no new colour.

- **Details, no deposit.** ONE light white row like « Ajouter une vente »: accent ⊕, accent label
  « Prendre un acompte », chevron. Shown only while a deposit can be taken.
- **Details, with deposits.** A `SectionHeader` « Acomptes » (count), then ONE white grouped
  surface: a lavender position block (`Total attendu`, `Acomptes` in `metadata`, hairline, then
  « Reste à encaisser » in `control` with the value in `lav700`), then one row per deposit with a
  hairline on top — `22 sept. · Carte` (`metadata`, navy) and the amount (`control`, tabular) —
  and, on an ACTIVE deposit of an open Appointment, a quiet accent « Annuler » text action. A
  VOIDED deposit is `foregroundMuted`, its amount struck through, AND its label ends with
  « · Annulé »: never colour alone. « Prendre un acompte » closes the group while possible.
- **Footer.** With deposits the §26 footer label becomes « Reste à encaisser » and the CTA
  collects that amount; when nothing remains it reads « Terminer » (spoken « Terminer le
  rendez-vous »).
- **Deposit sheet.** The §30 header `Annuler | Prendre un acompte`, no eyebrow; drag handle,
  backdrop and swipe dismissal. Body: the lavender position block of the checkout sheet
  (`Total attendu`, `Déjà versé`, `Nouvel acompte`, hairline, `Reste après acompte`), « Montant »
  with the quick-amount chips of the discount editor (same chip geometry, selected = `lav100` fill
  + accent border) and ONE « Autre montant » field (the checkout field style, rose when invalid,
  with one rose `metadata` sentence under it), then « Moyen de paiement » as a stretched
  `SegmentedControl` (`Carte | Espèces`). Footer: the primary « Encaisser l’acompte ».
- **Void confirmation.** The shared `ConfirmationDialog`, eyebrow « ACOMPTE », title « Annuler
  l’acompte de 30,00 € ? », a body saying it is a correction and not a refund, `Retour` /
  « Annuler l’acompte ».
- **Checkout sheet.** Under « Total attendu »: « Acomptes déjà versés » (`metadata`, negative
  amount), hairline, « Reste à encaisser » (`control`, `lav700`) inside the same lavender block.
- **Shortfall notice.** The inline refusal of a change that would take the total below the
  deposits (Details quick edits, « Modifier », checkout discount) mirrors the schedule conflict
  notice's structure on the financial palette: `surfaceLavender`, a 28 pt `lav100` badge with the
  cash glyph, a `lav700` `control` sentence and a soft `metadata` detail; one element announced
  politely; never red, never a dialog.
- **Financial conflict.** The SAME component, `tone="conflict"`: `surfaceRose` surface, white badge,
  `rose700` sentence — the restrained rose of the exception statuses, because the state itself is
  wrong (deposits above the total, after two devices edited offline). The position block then
  replaces « Reste à encaisser » with « Acomptes en trop » and the excess in `rose600`, the footer
  reads « Total du rendez-vous » with no CTA, and « Prendre un acompte » is gone. The reason is
  always written out; nothing relies on the colour.
- **Correction on a cancelled or missed visit.** The same `ConfirmationDialog`, worded for the
  case: « Annuler cet acompte ? » and a body that says it corrects an entry and does not refund.
- **Agenda.** No deposit badge on appointment cards.

---

## 34. Tops & tendances — Insights Receipt

The third action of the Agenda + menu (§17) prints a read-only activity recap with the SAME signature
as « Résumé du jour » (§25). It uses the same `ReceiptPrinter`, capsule, feed, settle, timings, ONE
`haptics.print()`, Reduce Motion fallback and dismissal paths (« Fermer », the dimmed page « Fermer les
tops et tendances », hardware back, accessibility escape). It also uses the same `ReceiptPaper` with its
torn edges and dashed tear lines. There is no second printer. Figures: `docs/domain/INSIGHTS.md`.

- **Glyph.** `chart.line.uptrend.xyaxis` (SF Symbols 4, iOS 16) / `trending_up`, shared by the menu
  option and the receipt header.
- **Character.** Visual and comparative. « Résumé du jour » is a vertical operational list; this one
  is a compact summary followed by ONE horizontal carousel of podiums.
- **Hierarchy**, top to bottom:

  ```text
  header      36 pt lavender100 disc + glyph · « Tops & tendances » sheetTitle (the header)
  controls    stretched SegmentedControl  Jour | Sem. | Mois | Année  (Mois on opening; « Sem. »
              spoken « Semaine ») · PeriodNavigator without its surface: ‹ Septembre 2026 ›
  summary     compact lavender050 panel: « ENCAISSÉ » eyebrow, accent · the amount in `display`,
              plum, tabular — THE strongest value · then one row: « 28 rendez-vous réalisés »
              (metadata) ↔ « Panier moyen » / value (control) · optional quiet notes
  tear line
  rankings    ONE horizontal paged carousel bleeding to the paper edges, one category per page:
              Top prestations → Top produits → Clientes qui dépensent le plus → Clientes les plus
              fidèles, each an `InsightsPodium`
  pagination  four short pills, lav200; the current one a 16 pt accent pill
  footer      the Souris wordmark, 76 pt, decorative, `spacing.md` above it, clear of the torn edge
  ```

- **Fit.** The whole paper is visible at once on a standard 6.1" iPhone (844 / 852 pt), even with
  two-line podium names: the section gaps are compact — controls `spacing.sm` under the header,
  summary rows `spacing.xs` apart, the tear line `spacing.md` above and below, pagination
  `spacing.md` under the podium, wordmark `spacing.md` under the pagination, no extra padding under
  it beyond the paper's own. Text sizes, podium, medals and wordmark size are unchanged. Only
  larger text sizes or a small phone (iPhone SE) fall back to the quiet vertical scroll.

- **Podium** (`features/insights/components/InsightsPodium.tsx`), the visual signature of the
  receipt. The category eyebrow (accent, centred) belongs to the page, so a page stands on its own.
  Each place is ONE tight vertical unit — medal, name, metric, plinth — with only `spacing.xs` between
  them. #1 is centred (36 % of the page) and #2 / #3 sit left and right (32 % each), so the three
  plinths TOUCH on one common floor and read as one silhouette: tall centre (66 pt), medium left
  (46 pt), short right (32 pt). Plinths are flat lilac blocks with `radii.small` top corners, a flat
  bottom and a 3 pt deeper top face: #1 `#DCCEF6` / top `#C8B5EF`, #2 and #3 `#EAE2FB` / top
  `#D8CAF5` (`receiptPodium`). Each carries its rank, understated, on its front face (#1
  `sectionTitle`, the others `control`, lilac, 80 % opacity) and no other text. Names are
  `rowTitle`, centred, 2 lines then ellipsis, never auto-shrunk; #1's name is Bold, one weight
  stronger, not larger. Metrics: #1 `control` plum, #2 and #3 `metadata`. No card, no gradient.
- **Medals** (`receiptMedal`, Views only, no image or SVG). Each medal is a flat metal disc with a 1.5 pt
  darker rim, a 1 pt lighter inset ring and the digit centred on it (≥ 6:1), hanging from two
  ribbon tails that part outwards (±16°), each cut with a swallow-tail notch in paper colour. The
  tails are in the Souris lilac family, with a darker left tail and a lighter right one for depth.
  - #1 antique gold: `#E6CD8C` fill, `#B48F3E` rim, `#F3E4B8` ring, `#5A4213` digit. 48 pt disc,
    `sectionTitle` digit, plum `#654199` / `#7C5FC9` tails 12 × 18 pt.
  - #2 pearl silver: `#DEDCE7`, `#9E9BB2`, `#EFEEF4`, `#3F3D55`. 38 pt, `control` digit, lilac
    `#9A85D6` / `#B2A1E2` tails 10 × 14 pt.
  - #3 soft bronze: `#E2BFA2`, `#A6704B`, `#F0D8C4`, `#5B331A`. 38 pt, same tails as #2.

  Muted, never saturated yellow or orange. The medal and the plinth are decorative: rank is carried
  by the written digits and by the spoken label.
- **Fewer than three.** Only existing places render. With one result the winner stands alone in the
  centre; with two, #1 is centre and #2 left. There is no empty block and no placeholder. An empty
  category shows one quiet centred `metadata` line in its page (« Aucune prestation sur cette
  période », « Aucun produit vendu… », « Aucune dépense… », « Aucun rendez-vous réalisé… »).
- **Paging.** A native horizontal `ScrollView`, `pagingEnabled` (no dependency): one category at a
  time, clean snaps, no partial page. The page settles on the momentum end, and a real change gives
  ONE selection haptic, never during the drag. Tapping a pill moves to its category (animated,
  instant under Reduce Motion). The page survives period changes and is forgotten on close. Nothing
  re-prints. The summary never scrolls horizontally. Nothing scrolls vertically while the content
  fits; only an unusually tall layout falls back to a quiet, non-bouncing vertical scroll.
- **Period labels.** `22 sept. 2026` · `21 – 27 sept. 2026` (`28 sept. – 4 oct. 2026`,
  `28 déc. 2026 – 3 janv. 2027`) · `Septembre 2026` · `2026`. The arrows are labelled after the period
  they move by (« Mois précédent », « Semaine suivante »…).
- **Haptics.** The ONE print haptic, the selection haptic of `SegmentedControl` on a real change only,
  and nothing on the arrows (like every Souris period navigator). Re-laying out the paper while browsing
  never prints again.
- **Empty.** The same complete paper with every figure at zero, one quiet « Aucune activité sur
  cette période » line under the summary, and each category page showing its own message.
- **Accessibility.** The Modal is `accessibilityViewIsModal`. The headline, each metric and each
  podium place is ONE element: « Encaissé, 150,00 € », « 28 rendez-vous réalisés », « Première place,
  Brushing 2, 6 prestations », « Troisième place, Nora H., 3 rendez-vous ». The places are in rank
  order in the tree, so screen readers read 1, 2, 3 whatever their visual position. Rank never
  relies on medal colour, height or side. Only the settled page is exposed. The pagination is ONE
  adjustable element (« Top prestations, 1 sur 4 ») whose increment / decrement move between
  categories. The category title is a header. The period options are tabs with their selected state.
- **Clients.** This private ticket names clients as `Prénom N.` and writes visits `3 rdv` (spoken
  « 3 rendez-vous »), so a metric never truncates to « rendez-v… ». It is never captured:
  « Enregistrer » and « Partager » export the dedicated card of §35 (`Prénom N.`, turnover frosted).
- **Actions.** Three icon-only buttons on one centred row, 24 pt apart (`ReceiptPrinter` `actions`):
  the shared `GlassIconButton` — 44 pt circle, floating light glass and its soft shadow, accent
  glyph, no border, no gradient.

  | Action | SF Symbol (iOS) | Material (Android) | Spoken |
  | --- | --- | --- | --- |
  | Fermer | `xmark` | `close` | « Fermer » |
  | Enregistrer | `photo.badge.arrow.down` (SF Symbols 4, iOS 16) | `download` | « Enregistrer l’image » |
  | Partager | `square.and.arrow.up` | `share` | « Partager » |

  Never a floppy disk. A busy button shows a small accent spinner in place of its glyph (the circle
  never changes) and is `busy` / `disabled`; while one works, the others ignore presses. The labels
  are spoken, never written. « Résumé du jour » uses the SAME close button, alone, centred (§25).
- **Not here.** No place is tappable, there is no reward, discount or offer action, and there is no
  « dépensent le moins » ranking. The podium receives already-worded data, so the share card reuses
  it without the carousel or a capture of this private receipt.

## 35. Tops & tendances — Share Card

« Enregistrer » and « Partager » (§34) export `BusinessInsightsShareCard`: a DEDICATED visual, not a
screenshot.
Data: `docs/domain/INSIGHTS.md` §7.

- **Format.** 9:16 story. Laid out once at 360 × 640 dp, every text `allowFontScaling={false}`,
  exported at 1080 × 1920 px PNG through `ImageExportFrame` (content scaled from the top-left corner
  to the exact pixel size). The image is the same on every device and never includes the printer,
  the dimmed Agenda, the carousel or the actions.
- **Surface.** Flat warm receipt paper (`receiptPaper.surface`) FULL-BLEED across the whole
  1080 × 1920 image — painted by the card and under it by `ImageExportFrame`, so no pixel is
  transparent. The content is never a rounded card floating on another ground. No gradient, no
  shadow, no texture.
- **Hierarchy**, top to bottom, inside generous margins (52 pt top, 48 pt bottom, 24 pt sides) that
  keep text clear of the areas social apps cover or crop:

  ```text
  brand       logo-mark, 56 pt, decorative — restrained
  kicker      « TOPS & TENDANCES » eyebrow, accent
  period      « Septembre 2026 » screenTitle, plum, one line
  summary     lavender050 panel, radii.large: « ENCAISSÉ SUR LA PÉRIODE » eyebrow accent over a
              frosted private amount · « 28 rendez-vous » ↔ « Panier moyen » + a small frosted
              private amount, on one line. The receipt keeps « ENCAISSÉ », its amounts and
              « rendez-vous réalisés ».
  tear line   the receipt's dashed `ReceiptTearLine`
  highlight   centred in the remaining height, raised by a 24 pt bottom padding so the podium
              stays close to the summary (below)
  footer      « Créé avec » metadata + logo-wordmark 64 pt, 85 % opacity
  ```

- **Highlight.**
  - Every category — Top prestations, Top produits, Clientes qui dépensent le plus, Clientes les
    plus fidèles — the SAME `InsightsPodium` and the same places, metrics and order as the receipt.
    Clients read `Prénom N.` (never a full last name) in the podium's own name style; metrics stay
    clear: `195 €`, `3 rdv`. Medals, gold /
    silver / bronze, lilac plinths, #1 centred, names on 2 lines then ellipsis, never shrunk — in
    its `story` layout: #1 on 40 % of the width, #2 / #3 on 30 % (the plinths still touch), and
    each metric uses its whole column. Measured in Plus Jakarta Sans, `312 prestations` fits #1 and
    `18 prestations` fits #2 / #3 on one line. A metric is NEVER truncated: at worst it wraps onto a
    second line; it never shrinks. The receipt keeps its 36 / 32 % layout.
  - Empty category: its quiet centred message. Empty period: « Une période toute calme ✨ »
    (`sectionTitle`, foregroundSoft), no podium.
- **Private amounts.** « Encaissé » and « Panier moyen » are frosted, never printed: a `lav100`
  pill (`radii.pill`, no border, no gradient) holding soft `lav200` digit-shaped marks and an
  accent `€` at 80 % opacity — four 18 × 14 pt marks in a 40 pt pill for « Encaissé », three
  9 × 7 pt marks in a 20 pt pill for « Panier moyen ». The shape never depends on the value and no
  digit is rendered, so the image can reveal nothing, not even a blurred number (a native blur would
  not survive the capture anyway). The label above or beside it stays readable.
- **Brand.** The professional's result, powered by Souris: a small mark at the top, « Créé avec »
  + wordmark at the bottom. No slogan, no call to action, no app-store badge.
- **Interaction.** « Partager »: one light haptic (`haptics.action`), none while preparing, then the
  platform share sheet; nothing is confirmed when it closes. « Enregistrer »: no tap haptic; once
  Photos has the image, ONE success haptic (`haptics.success`) and « Image enregistrée dans Photos »
  on a glass pill above the actions (`ReceiptPrinter` `actionNotice`, polite live region), gone after
  2.6 s — never a modal alert. Errors use the same pill and stay until the next action: « Impossible
  de préparer le partage. », « Impossible d’enregistrer l’image. », or the Photos permission line.
  The ticket always stays open, on the same period and category. The icon buttons add no haptic of
  their own.

---

## 36. Directory Lists — Produits and Clientes, Actifs / Inactifs

Produits and Clientes browse their active and inactive records the SAME way. Supersedes the
second, bottom « Inactifs » / « Archivées » section of both lists, and the §22 « Clientes count ».

### Screen title

« Produits » and « Clientes » are identity only: no count beside either title (§17 header).

### Without inactive records — one section

```text
Actifs                                      [count]

[ active list ]
```

- the shared `SectionHeader` (`sectionTitle`, sentence case, lavender count pill on the right);
- its count is the rows it heads: a search narrows it;
- no segmented control, no empty inactive section.

### With at least one inactive record — tabs

```text
[ Actifs count | Inactifs count ]

[ currently selected list ]
```

- the shared `SegmentedControl` right below the search, in the Services / Techniques language:
  stretched to the full width, the selected option filled with the accent violet and a white
  label, a count pill in each option;
- default tab: the active one; the choice lives as long as the screen, never persisted. When the
  last inactive record goes, the tabs disappear and the active list returns;
- only ONE collection is rendered at a time; no section heading repeats the selected tab;
- search applies only to the selected tab and survives a switch; an empty result shows the
  screen's usual « aucun résultat » state with the tabs still in place;
- tab counts are the FULL collections and never shrink with search;
- spoken as tabs, with their selected state and count (« Archivées, 1 »).

### Wording

- Produits: « Actifs » / « Inactifs ».
- Clientes: « Actives » / « Archivées » — never « Inactives »: archiving is the Client domain's
  established term (the « Archivée » row mention, archive / restore actions). Archived Clients
  are searched from the « Archivées » tab.

### Clientes rows — photo or initials

- a Client photo shows directly in the row when one exists, cropped (`cover`), never stretched;
- the frame is the Produits list thumbnail: the same 52 pt rounded square with the same corners
  (§11), so the two lists read as one family rather than as an address book;
- without a photo — or while it is still loading — the two initials (« NH ») fill the SAME frame
  on the Client lavender: no spinner, skeleton, silhouette or layout shift when the photo arrives;
- the photo is the Client Profile's photo (same stored reference, same device cache); the list
  never edits it and the avatar is not a separate button — the whole row opens the profile;
- the avatar is silent for assistive technology: the row already speaks the Client.

### One directory grid

Clientes and Produits share the same directory grid, so switching between the two tabs never
moves it; only the row content differs:

- the same page: white background, the platform gutter for title, search, tabs, section header,
  rows and empty states, the same floating + placement;
- the same rhythm: search right below the title, tabs or « Actifs » header at the same distance,
  the first row at the same height;
- the same rows: thumbnail → copy → chevron. The 52 pt rounded-square thumbnail on the gutter,
  the same gap to the text column, the same vertical padding, the same 72 pt minimum height, the
  same flat lavender pressed state, and the same small muted chevron at the end — decorative, not
  a button, silent for assistive technology: the whole row is the one action;
- Clientes rows show no birthday (neither the date nor the « Aujourd'hui » badge): the birthday
  lives on the Client Profile and in appointment flows;
- subtle hairline separators (`borderSubtle`) under every row, spanning the row from the
  thumbnail to the chevron; decorative, never read by assistive technology;
- no card around any row.

---

## 37. Estimation tarifaire — Sheet and Document

Product: `docs/product/PRODUCT.md` §5 « Estimation tarifaire ».

**Sheet.** The workflow sheet of « Nouveau rendez-vous » (§27), unchanged in language: the shared
editing header (« Annuler » · « Estimation »), the shared `CreationStepper` given two labels
(Prestations → Résumé, « Étape 1 sur 2 »), the shared `ServiceCatalogPicker` as the FIRST step (a
tap toggles; a selected card says « Retirer de l’estimation »), the selection footer (count +
names), « Précédent » / « Continuer ». The eyebrow above the catalogue always reads « ESTIMATION »
— never a person's name. No Client picker, no Date / Heure group: the estimation has no recipient
and nothing is scheduled.

**Résumé.** Grouped rows: Date (the generation date, read-only) ; « Prestations
sélectionnées » with « Modifier », one « name — price » row each ; the lavender final summary
« Total estimé ». Primary action « Générer l’estimation ».

**Presentation.** The receipt printer of §25 — capsule, feed, one print haptic, reduced-motion
fade — with Fermer · Enregistrer l’image · Partager as in §34. Fermer lets the paper leave, then
closes the sheet back to the Agenda.

**Interior.** The visual language of the « Tops & tendances » share card (§35) — the same Souris
family, structurally simpler, with no analytics (no podium, medal, chart or KPI), never an
administrative form:

```text
            [logo-mark 56 pt]             decorative, restrained
          ESTIMATION TARIFAIRE            eyebrow, accent
               Maison Léa                 screenTitle, plum, wraps
            24 septembre 2026             metadata, soft — generation date, no time
- - - - - - - - - - - - - - - - - - - - - ReceiptTearLine
Prestations                               rowTitle, plum, header
Coupe brushing                      45 €  body ↔ control tabular
───────────────────────────────────────── subtle hairline between lines
Balayage 1                          70 €
╭───────────────────────────────────────╮
│             TOTAL ESTIMÉ              │ ShareHighlightPanel (lav050, radii.large):
│                 115 €                 │ eyebrow accent over display, plum
╰───────────────────────────────────────╯
Estimation indicative basée sur les prestations sélectionnées.   metadata, soft, centred
          Créé avec [Souris wordmark]     CreatedWithSouris (64 pt, 85 %)
```

- **Two presentations, one interior** — exactly the « Tops & tendances » pipeline (§34, §35).
  `EstimationDocument` is the interior only, with no surface of its own:
  - **printer:** inside `ReceiptPaper`, the torn-edge ticket every Souris receipt feeds out of the
    printer (as `BusinessInsightsReceipt`). The whole interior scrolls inside the room the printer
    leaves; its text follows the device text size.
  - **export:** `ImageExportFrame` on `SHARE_CARD_BACKGROUND` holding the shared `ShareCardCanvas`
    (as `BusinessInsightsShareCard`): flat warm paper FULL-BLEED — never a rounded card on another
    ground — 360 dp wide, the share-card margins (52 pt top, 48 pt bottom, 24 pt sides), every
    text `allowFontScaling={false}`, exported at 3×. Tops & tendances uses the canvas `fixed`
    (360 × 640 dp → 1080 × 1920 px); Estimation uses it `growable`: at least that same 9:16 story
    — an ordinary estimation IS a 1080 × 1920 image, its footer at the bottom edge — and taller
    only when a long one needs it (1080 × measured height × 3), never cut.
  No gradient, no texture.
- **Total.** « Total estimé » is the focal point: the lavender panel shared with « Encaissé sur la
  période » — an estimated price, never an amount due.
- **Shared primitives** (`src/shared/ui`), also used by the « Tops & tendances » card with its
  rendering unchanged: `ShareCardCanvas` (the share canvas: ground, width, margins, 9:16, 3×),
  `ShareHighlightPanel` (the lavender panel container) and `CreatedWithSouris` (« Créé avec » +
  wordmark, spoken « Créé avec Souris » once).
- No recipient: no Client name, no « Cliente » / « Pour » line, no blank placeholder. No height is
  fixed: a long name wraps, no line or amount is ever truncated or shrunk, and a long estimation is
  simply taller.
