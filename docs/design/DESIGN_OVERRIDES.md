# BeautIzzy — Design Overrides

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

Only add entries here when a deliberate BeautIzzy product/design decision differs from the exported reference.

Do not use this file as a miscellaneous design notes document.

The goal is to keep exceptions explicit and rare.

---

## 5. Operational Agenda — Professional Occupancy

The exported Agenda design shows unattended processing as a peach striped section inside an event.
The operational BeautIzzy Agenda intentionally overrides that treatment:

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

The exported design does not define the approved smartphone Week view. BeautIzzy uses a vertical list of seven day
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
a Prestation select, date/heure fields, and a Déroulé preview). The implemented BeautIzzy creation experience
deliberately differs:

- three steps with a connected stepper — `Client → Prestations → Résumé`;
- the Agenda-selected date/time is pinned as a compact appointment-context row on every step (never a large
  date card). The time is a creation draft: a restrained « Changer l'horaire » reveals the inline start-time
  wheels (hours + 5-minute minutes, see « Appointment start time — wheels ») on the same local date, bounded
  by the operational Agenda day;
- the client picker searches the complete normalized address book with a virtualized list and no display cap;
  its search field uses a symbol icon and a clear `Rechercher un client` placeholder instead of field
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
  `Modifier le client` (client reassignment through the shared picker), `Changer la date`,
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
`Archivé` mention. *(The muted « Archivés » group eyebrow is superseded by the « Archivés » tab
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

- The canonical deep navy, BeautIzzy purple, lavender, rose, peach, warm white, and cool neutral palette remains
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
  selective BeautIzzy brand detail, not the default heading treatment.
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
- image surfaces use restrained BeautIzzy radii with no decorative outer border;
- the catalog thumbnail geometry (52 pt rounded square, `radii.medium`) is the shared list
  thumbnail that Clientèle rows also use (§36).

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

The exported reference contains no Sale flow. Sales V1 reuses existing BeautIzzy patterns rather than
introducing a POS visual language:

- `Nouvelle vente` is a primary action beside a secondary `Ajouter un produit` on the Produits
  tab — no new tab, no KPI, no cash-register surface;
- Sale creation is one content-fit sheet route in the canonical BeautIzzy shell (§16, §20
  `<SheetScreen fit="content">`: BeautIzzy grabber, the §30 editing header « Annuler | Nouvelle
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
- `Vendre un produit` is a quick-action tile of the Client Profile (§29). In
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
runtime integrates the canonical assets (transparent PNGs, never modified) at deliberate brand
moments only.

**BeautIzzy rendering.** `BrandMark` draws `assets/brand/logo-primary.png` (`primary`),
`logo-editorial.png` (`editorial`) and `symbol.png` (`symbol`). The native icon and splash derive
from the same masters. The files of the previous Souris identity (logos, icon document, raster icons)
have been removed from the repository.

- **App icon master** — `assets/brand/app-icon/icon.png`: 1024 × 1024, opaque, full-bleed purple
  background, the symbol alone, no text, no rounded mask baked in. It is the top-level `icon` (Expo
  Go, metadata, tooling). Never edited: every derivative below is produced from it or from
  `symbol.png`.
- **iOS app icon** — `assets/brand/app-icon/BeautIzzy.icon`, an Apple Icon Composer document
  referenced by `ios.icon`; Xcode compiles it and renders every size and appearance from it. One
  layer: the master copied byte-identical (`Assets/icon.png`), full canvas, no scale or translation;
  glass off, shadow none, translucency off. The document fill (`#320882`, the master's mean
  background) sits entirely under the opaque layer. Dark, tinted and clear appearances are the
  system's renderings of that single layer.
- **Android icon** — adaptive icon. `android-foreground.png`: `symbol.png` scaled to 48 % of the
  1024 px canvas height and centred on its minimal enclosing circle: about 72 % of the visible
  launcher area, the proportion of the master, and well inside the 66 dp safe zone. Its alpha is the
  approved silhouette, pixel for pixel; only its colours change: each pixel's luminance rank in
  `symbol.png` takes the colour of the same rank among the master's light symbol tones (`#7E3EF0` →
  `#BF7DFC` → `#FDF8FD`), so the launcher shows a light symbol on deep purple like the master.
  `android-monochrome.png`: the same silhouette in a single ink. `backgroundColor` `#320882`, the
  mean deep purple of the master's background (adaptive icons take one solid colour, not its
  gradient).
- **Favicon** — `assets/brand/app-icon/favicon.png`, 96 × 96, the master downsampled.
- **Native splash** — `expo-splash-screen`: white `#FFFFFF` background (identical to the Agenda
  first frame). iOS shows `assets/brand/logo-primary.png` at `imageWidth` 252, the same box as the
  boot surface. Android shows `android-splash.png` at `imageWidth` 288: the Android 12+ system
  splash masks the image to a circle that would clip the horizontal logo. The file is dedicated to
  the splash (the coloured `symbol.png` at 56 % of a transparent 1024 px canvas, inside the mask) and
  is deliberately not the launcher foreground, which may differ from it. No spinner, text, or animation beyond the short native fade (`duration.settle`).
- **Bootstrap** — the splash stays visible until Plus Jakarta Sans and the SQLite bootstrap are both
  settled and the router is committed; the root view shares the splash white and the boot surface
  renders `<BrandMark variant="primary" size={252} decorative />` (artwork ≈ 233 × 73 dp), the same
  box as the native splash, so no intermediate unbranded surface or jump exists.
- **Discovery and the account screens** — the signed-out entry (Product Discovery, three slides;
  there is no separate Welcome) and the three account screens (sign-up, sign-in, email
  confirmation) draw the same frame as business setup, `src/shared/ui/OnboardingStepLayout.tsx`:
  top and bottom safe areas on `semanticColors.screen`, a quiet top bar (the `GlassIconButton`
  back on the left when something precedes the screen; in the centre the setup progress, or on
  the account screens `<BrandMark variant="editorial" size={112} />` as the single accessible
  "BeautIzzy"; an optional trailing text action — Discovery's « Passer »), an optional brand mark
  above the content (`brandSize="compact"`, Discovery: the editorial mark rendered 232 dp wide —
  ≈ 215 dp of visible artwork — 194 on a small phone, its transparent vertical padding pulled
  back with negative margins, `spacing.md` under the top bar, `spacing.xs` on a small phone), an
  optional illustration, an optional accent uppercase eyebrow (« COMPTE »), an optional title
  (`display` centred on the framing screens, `screenTitle` leading elsewhere) and its
  `foregroundSoft` supporting line, the screen's content, and a fixed footer with the primary
  `AppButton` and its tertiary secondary. The body scrolls and avoids the keyboard; the framing
  screens centre a short composition. Entrance: four groups (illustration with a 10 dp rise, header,
  content, footer) fade in over 260 ms each, staggered 0 / 60 / 120 / 180 ms, `easing.out`;
  Reduce Motion renders in place. Discovery (`src/features/auth/discovery`): the editorial mark
  above ONE horizontal paged `ScrollView` bleeding to the window edges, one window-wide page per
  slide: the master (`contain`, hidden from assistive technology; side = the window height minus
  the 624 pt the top bar, the mark, a two-line title, a three-line description, the pills and both
  actions take with notched safe areas — ≈ 250 on an iPhone 17, capped at 300, floored at 156 on
  an iPhone SE, where the slot and header paddings tighten to `spacing.xs` / `spacing.sm`), a
  `display` title and the `foregroundSoft` line, centred, `maxWidth` 360. Masters, the inclusive
  set (men and women of several beauty occupations; a fixed mapping for everyone, never a variant
  by gender, activity or chance): `activity-duo.png`, `products-man.png`, `clients-duo.png` —
  never a paywall master; `clients-man.png`, `clients.png`, `products.png` and
  `starter-services.png` (setup step 4) stay in reserve. The new masters fill their square
  almost edge to edge (≈ 62–69 % opaque, against ≈ 45–50 % for the originals), so they read
  denser at the same side; the side rule is unchanged. Every title of the frame is navy
  (`semanticColors.foreground`), the three Discovery
  headlines included: the brand violet is carried by the mark, the primary action, « Passer », the
  sign-in link and the current pill, never by a headline. The footer, identical on every slide,
  stacks
  three pagination pills (5 pt `lav200`, the current one a 16 pt accent pill, tappable with
  44 pt slop, the row `adjustable` and spoken « Écran n sur 3, <title> »), the single primary
  action (`Continuer`, then `Créer mon compte` on slide 3) and the tertiary link « Déjà un
  compte ? Se connecter » (→ sign-in from any slide). « Passer » (slides 1–2) returns the tour to
  slide 1 without animation and pushes sign-up; the glass back (slides 2–3) goes to the previous
  slide. Only the current page is exposed to VoiceOver. A finger swipe updates pills and label as
  the nearest page passes the midpoint; a programmatic move sets the page at once, scrolls with
  the native paging animation, or jumps under Reduce Motion. Haptics: `action` on « Passer », the
  primary and the sign-in link, `selection` on a pill, nothing on a swipe. Sign-up: « Créons votre
  compte », « Quelques secondes suffisent pour commencer avec BeautIzzy. », Email, Mot de passe
  (visibility toggle), `Créer mon compte`, « J’ai déjà un compte »; sign-in: « Se connecter »,
  « Retrouvez votre espace BeautIzzy. »; email confirmation: « Vérifiez votre boîte mail ✨ », the
  address in a lavender notice with an envelope glyph, « Retour à la connexion », « Renvoyer
  l’email ». Sign-up alone keeps `welcome.png` at the compact size (0.22 × the window height,
  0.17 under 700 pt, clamped 112–200) above the eyebrow, with the 112 dp mark in its top bar.
  Sign-in and the email confirmation carry no illustration: the editorial mark is their anchor
  (`brandSize="large"`: rendered 272 dp, ≈ 252 dp of artwork; 232 / ≈ 215 on a small phone,
  where the content width is 287 dp), `spacing.3xl` (32 dp) under the top bar and `spacing.lg`
  above the header (`spacing.lg` / `spacing.sm` on a small phone), so the mark holds the upper
  third and
  the eyebrow, title, line and fields read as one block above the actions; the email
  confirmation keeps its lavender notice with the envelope glyph. Every form stays above the
  fold; their back returns to Discovery, or replaces to its entry when the screen was opened
  without history (the confirmation link). Historical: the previous
  Welcome floated six beauty objects (`assets/brand/welcome-floating/`) around the logo with a
  touch physics scene; that scene is gone from the entry flow (the PNGs are no longer rendered
  anywhere).
  The old plum (`#5F1852`) is no longer a brand colour: the `brand.plum` token and its
  `brandForeground` alias are gone, and the value survives only as `mauve900`, the
  Calendar Block title (§24).
- **Account state screens** — `<BrandMark variant="symbol" size={54} decorative />` (the symbol
  above the state title; artwork ≈ 48 × 68 dp).
- **Plus** — a compact identity block, the last element of the page's scroll flow:
  `<BrandMark variant="editorial" size={125} />` (the single accessible "BeautIzzy"; artwork
  ≈ 116 × 39 dp), then
  `Version x.y.z` from the Expo manifest in muted metadata. It never competes with the management
  rows.
- **Sizing** — each canonical PNG is its artwork plus an even transparent safe padding of 4 % of
  the artwork's longer side: `logo-primary.png` 1489 × 541 (padding 55 px), `logo-editorial.png`
  1514 × 580 (56 px), `symbol.png` 811 × 1097 (41 px). `size` is the rendered box width; the
  height follows the intrinsic ratio with `resizeMode="contain"`, so nothing is ever stretched.
  `brandAssets[variant].inset` records the padding measured on each file and
  `brandMarkInsets(variant, size)` gives it in dp (2–6 dp at the sizes used); only `HomeHeader`
  needs it, to set the artwork exactly on the gutter. The PNGs are transparent and coloured: they sit directly on the white
  background with no cream or tinted plate behind them, and there is no white-on-light variant.
- **Where logos do NOT appear** — Agenda, Clientèle, Produits, Prestations, details, sheets, forms,
  headers. Titles stay `Agenda` / `Clientèle` / `Produits` / `Plus`; never `BeautIzzy — Agenda`.
- **Display name** — the installed app is named `BeautIzzy` (`expo.name`); `souris-app` remains only
  the technical slug / package name.
- Dark logo variants, alternative palettes, and new artwork are out of scope: the three canonical
  assets are the identity.

---

## 16. Overlay Consistency V1 — Sheets, Dialogs, Keyboard, Main-Screen Identity

Every BeautIzzy overlay now shares ONE visual and behavioral language. The reference is the
Plus › Compte sheet (drawers) and the permanent Client deletion dialog (confirmations).

### Bottom sheet (`src/shared/ui/BottomSheet.tsx`, `SheetScreen.tsx`)

- **Shell** — full-width satin overlay surface (§20; formerly flat white), `radii.ios.sheet` top
  corners, the BeautIzzy grabber (40 × 5, translucent navy `overlayMaterial.grabber`), platform gutter, bottom safe area. The same shell
  serves the JS drawer (`BottomSheet`, a Modal) and every sheet route (`SheetScreen`; native
  `formSheet` for workflows, transparent route + shared `SheetPresentation` for content-fit
  sheets — see §20 Geometry; configured once in
  `src/providers/sheet-route-options.ts`: overlay-surface `contentStyle`, `sheetCornerRadius`, system
  grabber hidden so the BeautIzzy grabber is the only one). Workflow sheets use the system's large detent (`sheet.workflowDetent`, §20 — the only detent
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

- The ONE BeautIzzy-owned confirmation: near-full-width centered card (`dialog.maxWidth`),
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
- **Client archiving** — `ARCHIVAGE` · « Archiver ce client ? » · « Ce client restera dans
  votre répertoire mais sera déplacé dans les clients archivés. Vous pourrez le restaurer plus
  tard. » · `Annuler` / `Archiver`. Nothing is written before « Archiver »; the profile stays open.
- Wording stays feature-owned; the primitive never names an entity. React Native `Alert` is
  not used for BeautIzzy-owned confirmations — it remains only for error reports
  (`alertPersistenceFailure`), permission explanations, and the development-only reset.

### Main-screen identity (`src/shared/ui/ScreenWatermarkIcon.tsx`)

- Each main tab carries ONE large, low-contrast semantic symbol anchored in the top-right
  corner and partially cropped by the right edge so it reads as embedded in the page surface:
  Agenda `calendar`, Clientèle `person.2`, Produits `shippingbox`, Plus `gearshape` (Material
  equivalents on Android). `watermark.size` / `watermark.opacity` / `watermark.crop*` and one
  position for all four — anchored to the title block by `MainScreenHeader` (§17), never to the
  device edge. Symbols do not fill their box the same way, so a symbol may carry a restrained
  optical scale and rise (`screenWatermarkOptics`: the two people of Clientèle grow and lift so
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
- **Directory birthday** — *(Superseded by §36: Clientèle rows end with the Produits chevron and
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
  - *Compact reminder* (`BirthdayNotice compact`, Client step of Appointment creation, under the
    context row): same card with `md` / `sm` padding, a 28 pt badge with a 14 pt glyph, the sentence
    as a `control` title and one supporting line; no action.
  - *Confetti* (`BirthdayConfetti`, Client Profile and Appointment creation — the ONE implementation,
    never a larger variant): 26 small paper pieces fan out from the top
    of the screen, flutter down and fade in 2.2 s, then unmount. Palette: accent violet, lilac,
    lavender, soft rose, `rose200`, `peach200`, one soft gold — no rainbow, no neon. One shared
    value on the UI thread, pointer-transparent, hidden from assistive technology, skipped with
    Reduce Motion, with one `success` haptic. Played once per profile entry (mount) and once per
    explicit birthday-Client selection in creation — never on a re-render.
  - *Appointment Details*: a static 14 pt glyph + « Anniversaire du client » (`metadata`,
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
  Produits and Clientèle carry NO uppercase eyebrow — the title is never repeated. Agenda carries
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
- A single flow opens directly: Clientèle → the shared Client form; Prestations & tarifs →
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

The five main tabs — **Accueil · Agenda · Clientèle · Produits · Plus**, in that order (Accueil is
the landing tab since October 2026, §42; `house` / `home` system symbol), static for the whole
app lifetime — live on the platform's own tab bar through Expo Router `NativeTabs`
(`src/app/(app)/(tabs)/_layout.tsx`). The JavaScript tab bar of the export (`.tabs`, DESIGN.md §5)
is no longer reproduced natively.

- **iOS**: UIKit's tab bar. On iOS 26, with a binary compiled by Xcode 26+, it is Apple's native
  Liquid Glass — the system material, sampling the page beneath it. Older iOS shows the standard
  system tab bar. BeautIzzy never fakes the glass **of the bar**: no BlurView, no translucent view, no
  gradient, no opaque forced background, no version-conditional custom bar. (The small light-glass
  controls of §21 are BeautIzzy-drawn surfaces that echo this material; they never replace or
  imitate the bar itself.)
- **Android**: native Material bottom navigation, with Material icons — not an imitation of
  Liquid Glass.
- **Icons / labels**: system symbols, visible native labels, native selected state.
  Agenda `calendar` / `calendar_month`; Clientèle `person.2` → `person.2.fill` / `group`;
  Produits `shippingbox` → `shippingbox.fill` / `inventory_2`; Plus `ellipsis` / `more_horiz`
  (« Plus » is more than settings, so no gear). No icon package.
- **Tint**: the selected tab uses the BeautIzzy accent (`semanticColors.accent`) and nothing else is
  restyled — the system owns the material, layout and typography of the bar.
- **Theme**: the tabs are wrapped in the BeautIzzy navigation theme
  (`src/providers/navigation-theme.ts`, light only), whose background is the canonical white
  screen, so a tab switch never flashes a foreign colour behind the glass.
- **Scroll edge**: `disableTransparentOnScrollEdge` is set because the list screens (Agenda,
  Clientèle, Produits) keep a fixed `MainScreenHeader` above their list — UIKit's scroll-edge
  detection therefore never finds the list and, on iOS 18 and earlier, would draw a permanently
  transparent bar. Accueil and Plus have no fixed header: theirs scrolls with the page content.
  Liquid Glass ignores bar backgrounds, so iOS 26 keeps its native behaviour.
- **Minimize on scroll**: NOT enabled. The bar stays stable while the professional works; the
  minimize behaviour is evaluated separately later.
- **Content under the bar (iOS)**: the bar overlays the page. The main lists (Agenda day / week,
  Clientèle, Produits) opt into the system content inset (`contentInsetAdjustmentBehavior`), and
  keep `bottomClearance` above it so the last row scrolls above the floating +. Plus is one
  vertical scroll, header included, whose content ends with the tab's bottom safe area: it grows to
  the viewport when it is shorter (identity block resting above the bar) and scrolls when it is
  taller. No tab-bar height is measured, hardcoded or guessed.
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
- **Shape**: the corner is a quarter of the card height, from 3 up to `radii.medium` (12): a
  quarter-hour card never reads as a pill, a roomy card gets a softer corner.
- **Composition by height** (`getAgendaSegmentDensity`, thresholds unchanged; `AppointmentBlock`).
  - *Tall* (≥ 56): one cluster anchored to the START line (4 pt inset, never vertically
    centred — the empty remainder of a long card is its duration). A 32 pt identity disc, then
    beside it: the segment start time (`chip`, family `subtitle` tone, tabular), the client
    name (`rowTitle`, family `title` tone — the strongest line), the prestation summary
    (`metadata`) and the phases on their own line while the height allows. On the shortest
    tall cards the phases stay inline after the prestations; time, name and prestations
    always fit.
  - *Medium* (32–55): a 24 pt identity disc beside two tight centred lines, name then
    prestations. No time.
  - *Compact* (16–31): one line, first name · prestation. Below 16: colour only. No disc.
  - *Identity disc*: the client's photo (`cover`, clipped to the circle) when the Client has
    one — resolved from its `photoPath` through the shared media cache, like the Clientèle
    list. Otherwise, and when the photo cannot load, a SOLID white circle (`surfaceElevated`)
    with the initials in the card's name tone — flat, nothing translucent over the pastel.
    Decorative: the card speaks the client's name. Dropped when the card is narrower than
    140 pt (overlap columns).
  - **No duration is written**: the height of the card is the duration. The start time is read
    from the card's own segment (`startAt`). `spacing.sm` side padding. No written status: the
    colours carry it.
- **Depth**: the barely-there `nativeShadows.card` under live cards, nothing else. The former
  card sheen (a top-down white gradient plus a one-pixel highlight, `gloss.card`) is removed: it
  read as a washed gradient across the pastel fill. No blur, no glassmorphism.
- **Floating +**: same size, placement, hit target, reveal and behaviour (§17). Its finish is no
  longer the glossy candy violet circle first introduced here: it is the light-glass circle with a
  violet plus described in §21 (`GlassSurface`), and the `gloss.candy` tokens are removed. What
  remains from this section: the whole finish lives in ONE circular clip (radius = half the
  button), nothing but the round shadow is ever drawn outside the circle, and the button is
  shared, so Agenda, Clientèle, Produits and Prestations carry the same finish.
- **Bottom bar — iOS 18 and earlier**: NativeTabs asks UIKit for its thinner system material
  (`blurEffect="systemThinMaterial"`) so the page reads through the bar more. Still the system's
  own material — no BlurView, no custom bar.
- **Bottom bar — iOS 26 (Liquid Glass)**: the glass material is NOT tunable. Every bar-material
  prop of NativeTabs / react-native-screens (`backgroundColor`, `blurEffect`, `shadowColor`) is
  ignored by the system there (verified in the simulator: a forced red bar changes iOS 18, not
  iOS 26), and no glass variant or opacity prop exists. What BeautIzzy controls is what the glass
  samples: iOS 26 lays a dimming scroll-edge fog over scroll content under the bar, which greys
  the pastel cards before the glass refracts them. The Agenda day and week scroll views hide that
  bottom edge effect through `TabBarGlassScrollEdge` (`src/shared/ui/`, UIKit's own
  `UIScrollEdgeEffect` via `ScrollViewMarker` from `react-native-screens/experimental`), so the
  bar refracts crisp, luminous content. The system keeps icons and labels legible by itself.
  That entry point is marked experimental upstream: the wrapper is its single consumer and must
  be rechecked on every react-native-screens upgrade. Clientèle and Produits keep the default
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
  ghost through the text (verified in the simulator). BeautIzzy adds no blur view for this; the
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
    creation) are TRANSPARENT-MODAL routes whose sheet BeautIzzy draws itself (`<SheetScreen fit="content">`),
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
  at launch (BeautIzzy is portrait-locked), a resting probe only ever raising it. A native
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
  fill, lavender hairline, `lav700` label, « Fermer le clavier » for assistive tech). It only
  dismisses the keyboard: values stay, nothing is submitted. iOS binds one accessory view to ONE
  input (React Native attaches it to the first input carrying its `nativeID`, once, at mount), so
  every amount field (Carte, Espèces) renders its own instance with its own stable id — same
  component, same look; moving Carte ⇄ Espèces swaps two identical pills and never closes the
  keyboard. An input still relying on React
  Native's own accessory (`returnKeyType="done"`, hardcoded « Done ») must set
  `inputAccessoryViewButtonLabel="OK"` (Appointment deposit). No English string in BeautIzzy-owned UI.
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
  material, one thin navy glyph centred in it. Used by the back button of Fiche client,
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
  high — the BeautIzzy violet at 16 / 30 / 48 %, never red / green, never a gradient), relative to
  the best day of the DISPLAYED month (> ⅔ of it high, > ⅓ medium, otherwise low), none on zero
  days nor on adjacent-month days; the halo sits behind the selected fill and the today ring,
  and an unselected today keeps a navy number on a halo. No amount is written in a cell;
  VoiceOver speaks it (« Samedi 29 août, 115 euros encaissés »). Caisse only: on the first
  opening, a compact white card (`radii.large`, hairline border, `raised` shadow) floats over the
  lower part of the days — « Intensité du chiffre d’affaires », one sentence that the tint is
  relative to the other days of the month, a Faible / Moyen / Élevé legend drawn with the
  calendar's own halo (`MonthCalendarIntensitySwatch`), and « Compris ». Understood once per
  device (`souris_metadata`, never synced); a quiet `lav700` ⓘ under the grid, outside the glass
  month row, reopens it. Every appearance materialises in place (opacity 0 → 1, scale 0.96 → 1,
  10 pt → 0 on a nearly critically damped spring, the three legend samples fading in 35 ms
  apart); « Compris » leaves faster (160 ms fade, scale 0.98, 4 pt down). Reduce Motion: a short
  fade only. Agenda Semaine and Caisse Mois keep their own previous / next rows.
- **Day timeline top inset** — hour labels are centred on their grid line, so the first one
  (« 08:00 ») rises above the canvas. The scroll content starts `agenda.timelineTopInset` lower so
  it is shown whole; the inset moves the WHOLE canvas, so labels, grid lines, blocks, the
  tap-to-create surface and the now line keep their exact relationship.
- **Floating +** — same size, placement, reveal, menu and hit target (§17). The circle is the
  glass material; the plus keeps its symbol and becomes BeautIzzy violet — the button's only accent.
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
  exactly as they are (§16); they are joined by the visible « Fermer » text action of every BeautIzzy
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
- **Clientèle count.** *(Superseded by §36: « Clientèle » is a plain title again; the counts live in
  the « Actifs » section header or the Actifs / Archivés tabs.)* `MainScreenHeader` takes an
  optional `count`: the number of ACTIVE Clients
  (the session's `activeClients`, never the search results) sits beside the untouched « Clientèle »
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

- **One dedicated family — mauve.** `mauve` in `theme/colors.ts`, derived like every BeautIzzy scale from
  OKLCH, at hue 326, next to the structural lavender (300). Its darkest step, `mauve900` `#5F1852`,
  is the former Souris-derived plum (hue 336), kept unchanged for the block title and used nowhere
  else: it is not a BeautIzzy brand colour.

  ```text
  mauve050  #FBEFFB  oklch(0.965 0.020 326)   form / details / conflict surface
  mauve100  #F2D8F2  oklch(0.910 0.045 326)   Agenda block fill, icon badge
  mauve200  #EAC4EA  oklch(0.865 0.065 326)   pressed fill
  mauve600  #823F84  oklch(0.48 0.13 326)     accent: left border, glyph, Week marker
  mauve700  #68376A  oklch(0.42 0.10 326)     reason text
  title     mauve900 #5F1852                  « Indisponible »
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
  ≥ 32 pt    [glyph] Indisponible     rowTitle, mauve900      two lines
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
  lines, 56 pt minimum): mauve marker, glyph + « Indisponible » in `mauve900`, then
  « Déplacement · jusqu'à 11:30 » in `mauve700`. Pressed: `mauve050`. Blocks are never counted in
  « n rendez-vous »; the day header says « 1 créneau indisponible » to assistive technologies.
- **Creation — « Client | Personnel ».** The shared light-glass `SegmentedControl` (§21), directly
  under the sheet header; no new switch style. Spoken « Rendez-vous client » / « Rendez-vous
  personnel ». Both modes share the editing header of §27 (« Annuler » leading, one title): « Nouveau
  rendez-vous » in « Client », « Indisponible » in « Personnel » — no eyebrow. In « Personnel » the
  stepper, the context row, every step and the step action bar are replaced by ONE form, in the same
  row language as the Client step:
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
- **Conflict notice.** `ScheduleConflictNotice` — `mauve050`, 28 pt badge, a `mauve900` `control` sentence and
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
  foreground 16.6:1, foregroundSoft 8.3:1, mint700 7.8:1, lav700 7.4:1 (the emphasis colour of
  every document: dates, key amounts), accent 5.3:1. Square corners with
  torn top and bottom edges: a row of 45° paper-coloured squares clipped to their outer half, tiling
  the width exactly (`receiptPrinter.toothWidth`). `nativeShadows.lifted`. Width: the window minus
  26 pt on each side, 372 pt at most. Dashed tear lines (`receiptPaper.separator`) between sections.
- **Hierarchy**, top to bottom, Plus Jakarta Sans only:

  ```text
  header     40 pt lavender100 disc + glyph · « Résumé du jour » sheetTitle (the header) ·
             « Lundi 21 septembre » control, lav700 · « 7 rendez-vous » metadata        centred
  list       09:00 chip, tabular │ services rowTitle + client metadata │ amount control, tabular
             a mint600 check before the amount of a checked-out Appointment
  total      lavender050 panel, radii.large: « CA POTENTIEL » eyebrow, accent ·
             the amount in `display` 34 / 700, lav700, tabular — THE strongest value
  breakdown  Déjà encaissé (value mint700) · Reste à encaisser · Temps total · Panier moyen
             body label, foregroundSoft ↔ control value, tabular
  footer     the BeautIzzy SYMBOL alone (`BrandMark` symbol, `RECEIPT_SIGNATURE_SIZE` 24 pt wide,
             85 % opacity), decorative — the closing signature of every receipt; the wordmark
             is not repeated on a paper that is already BeautIzzy's
  ```

  The paper is ONE continuous document at its NATURAL height: header, list, total, breakdown and
  footer, with nothing scrolling inside it and no height bound. When it is taller than the room
  between the capsule and « Fermer » — a long day, a short screen (iPhone SE), large text — the
  PRINTER scrolls the whole paper vertically (`ReceiptPrinter`, shared by every receipt): it slides
  back up into the slot, and the room of the actions is padded under it, so the footer and the torn
  bottom edge always come clear of them. When it fits, nothing scrolls and nothing bounces.
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
- **Wording.** BeautIzzy has no deposit: the line reads « Déjà encaissé », never « Acomptes ».

### 25a. Weekly Summary — « Résumé de la semaine »

The + menu follows the Agenda mode: Jour → « Résumé du jour », Semaine → « Résumé de la semaine »
(same glyph, same place). The weekly receipt summarises the week THE AGENDA IS SHOWING — the same
Monday → Sunday as Week mode (`getWeekDays`), following its navigation. It is the SAME object as
§25: `WeekSummaryTicket` hands `DaySummaryReceipt` to the same `ReceiptPrinter` and `ReceiptPaper`
— same capsule, motion, haptic, dismissal (« Fermer le résumé de la semaine » on the dimmed page),
no share or save (the daily receipt has none). Figures: `docs/domain/APPOINTMENTS.md` §25c.

```text
header     disc + glyph · « Résumé de la semaine » (the header) ·
           « 21 – 27 septembre 2026 » control, lav700 · « 18 rendez-vous » metadata
activity   Réalisés · Prévus · Annulés · Absences — body label ↔ control value,
           each ONE spoken element (« 14 rendez-vous réalisés »)          in place of the list
total      « CA POTENTIEL », exactly as §25
breakdown  Déjà encaissé · Reste à encaisser · Temps total · Panier moyen, exactly as §25
footer     the BeautIzzy symbol, exactly as §25
```

- **Range.** Months written in full, the year once: `21 – 27 septembre 2026`,
  `28 septembre – 4 octobre 2026`, `28 décembre 2026 – 3 janvier 2027`.
- **Compact.** No Appointment list, no seven daily sections, no chart. An empty week is the same
  paper: « Aucun rendez-vous », every line at zero.
- **Large text.** As §25: the whole paper scrolls in the printer; nothing scrolls inside it.

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
  truncating), chevron. Client → client picker, Date → date picker, Heure → the inline wheels
  under the row (the chevron turns). No « Modifier le client » link labels; they are the hints.
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
  SERVICE = BeautIzzy violet (`colors.accent`); TECHNIQUE = azure (`azure600 #4F8EDC` for dots and
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
  rendez-vous » (Client) or « Indisponible » (Personnel). No eyebrow, no step title — the
  segment names the mode, the stepper the step.
- **Rendez-vous.** On Client AND Prestations, `RENDEZ-VOUS` over one `GroupedSurface`: **Date**
  read-only (the Agenda day: no chevron, not a button) and **Heure** (chevron; the whole row
  opens the start-time wheels inline). No « Changer l'horaire », no Client row — the Client is
  chosen in the search + list of the Client step, whose rows are separated by hairlines.
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

- **Header.** Glass back, a centred « Fiche client » title, « ••• » trailing (`Modifier`, then
  the lifecycle action).
- **Identity.** A centred block: the 80 pt portrait `ClientAvatar` (the photo control), the
  name in the 23 pt `summaryValue` role — one step under `screenTitle`, two lines at most,
  wrapped and never shrunk — then the phone and the email on their own quiet
  `foregroundSoft` lines when present, then the `Archivée` pill. Phone and email are NOT
  repeated in Informations.
- **Quick actions.** One row of equal white tiles (`ProfileQuickAction`, 56 pt minimum): a
  36 pt `surfaceLavender` disc with the accent glyph BESIDE a navy label (two lines at most).
  `Nouveau rendez-vous`, `Vendre un produit` — existing actions only, same weight, never a
  coloured CTA. An archived Client shows `Réactiver le client` instead.
- **Activité.** A 2 × 2 grid of small borderless white cards (`ProfileStatCard`,
  `spacing.sm` apart). Each card reads number first: a small accent glyph in a 32 pt
  `surfaceLavender` disc, the value in navy `summaryValue`, then a SHORT label in `metadata`
  that never truncates: « Réalisés » (spoken « Rendez-vous réalisés »), « Total dépensé »,
  « Absences », « Annulations ». Numbers are never violet. Always four cards, zeros included.
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
- **Order.** Identity (with phone / email), quick actions, birthday, next appointment,
  Activité, history, Informations (birthday, SMS consent — only when one exists), Notes.
- **No** ticket / printer treatment, no extra KPI, no call or message action here.

## 30. Standard Sheet Header — « Annuler » Leading, Title Centered

Creation and editing sheets use ONE header: `SheetEditingHeader` (`src/shared/ui`), the §27
recipe — « Annuler » (tertiary, leading) and the title CENTERED on the header (`sectionTitle`, one
line, fixed size: it truncates, never auto-shrinks — measured during a sheet's entry animation,
`adjustsFontSizeToFit` left the checkout title unreadably small). The title is its own layer inset by
the SAME width on both sides — the measured width of the wider side action — so it is truly centered
whatever the width of « Annuler », and a long title truncates before reaching it; no empty placeholder
button. Used by « Nouveau rendez-vous » (and its « Indisponible » mode), « Modifier le rendez-vous »,
« Nouvelle vente », « Nouvelle prestation », « Modifier la prestation », « Ajouter un produit »,
« Modifier le produit », « Ajouter un client », « Modifier le client », the
checkout sheet (« Encaisser le rendez-vous », « Encaisser la vente », « Modifier l’encaissement »)
and the pickers opened from these flows: « Choisir un client » (« Fermer ») and « Date du
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
              lav700, tabular — THE strongest value · then one row: « 28 rendez-vous réalisés »
              (metadata) ↔ « Panier moyen » / value (control) · optional quiet notes
  tear line
  rankings    ONE horizontal paged carousel bleeding to the paper edges, one category per page:
              Top prestations → Top produits → Clients qui dépensent le plus → Clients les plus
              fidèles, each an `InsightsPodium`
  pagination  four short pills, lav200; the current one a 16 pt accent pill
  footer      the BeautIzzy symbol, exactly as §25, decorative, `spacing.md` above it, clear of
              the torn edge
  ```

- **Fit.** The whole paper is visible at once on a standard 6.1" iPhone (844 / 852 pt), even with
  two-line podium names: the section gaps are compact — controls `spacing.sm` under the header,
  summary rows `spacing.xs` apart, the tear line `spacing.md` above and below, pagination
  `spacing.md` under the podium, signature `spacing.md` under the pagination, no extra padding under
  it beyond the paper's own. Text sizes, podium and medals are unchanged. Only
  larger text sizes or a small phone (iPhone SE) make the printer scroll the whole paper (§25).

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
  stronger, not larger. Metrics: #1 `control` lav700, #2 and #3 `metadata`. No card, no gradient.
- **Medals** (`receiptMedal`, Views only, no image or SVG). Each medal is a flat metal disc with a 1.5 pt
  darker rim, a 1 pt lighter inset ring and the digit centred on it (≥ 6:1), hanging from two
  ribbon tails that part outwards (±16°), each cut with a swallow-tail notch in paper colour. The
  tails are in the BeautIzzy lilac family, with a darker left tail and a lighter right one for depth.
  - #1 antique gold: `#E6CD8C` fill, `#B48F3E` rim, `#F3E4B8` ring, `#5A4213` digit. 48 pt disc,
    `sectionTitle` digit, `#654199` / `#7C5FC9` tails 12 × 18 pt.
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
  fits, and never inside the paper: an unusually tall layout is scrolled whole by the printer (§25).
- **Period labels.** `22 sept. 2026` · `21 – 27 sept. 2026` (`28 sept. – 4 oct. 2026`,
  `28 déc. 2026 – 3 janv. 2027`) · `Septembre 2026` · `2026`. The arrows are labelled after the period
  they move by (« Mois précédent », « Semaine suivante »…).
- **Haptics.** The ONE print haptic, the selection haptic of `SegmentedControl` on a real change only,
  and nothing on the arrows (like every BeautIzzy period navigator). Re-laying out the paper while browsing
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
  exported at 1080 × 1920 px PNG through `ImageExportFrame`. The frame IS the 360 × 640 dp layout —
  no transform, nothing read from the screen density — and the captured file is then given the
  exact pixel size (`shared/lib/image-pixel-size`): a 2× phone captures 720 × 1280 px, resampled
  to 1080 × 1920; a 3× phone captures 1080 × 1920 directly. The image is the same on every device and never includes the printer,
  the dimmed Agenda, the carousel or the actions.
- **Surface.** Flat warm receipt paper (`receiptPaper.surface`) FULL-BLEED across the whole
  1080 × 1920 image — painted by the card and under it by `ImageExportFrame`, so no pixel is
  transparent. The content is never a rounded card floating on another ground. No gradient, no
  shadow, no texture.
- **Hierarchy**, top to bottom, inside generous margins (52 pt top, 48 pt bottom, 24 pt sides) that
  keep text clear of the areas social apps cover or crop:

  ```text
  brand       symbol, 25 pt, decorative — restrained
  kicker      « TOPS & TENDANCES » eyebrow, accent
  period      « Septembre 2026 » screenTitle, lav700, one line
  summary     lavender050 panel, radii.large: « ENCAISSÉ SUR LA PÉRIODE » eyebrow accent over a
              frosted private amount · « 28 rendez-vous » ↔ « Panier moyen » + a small frosted
              private amount, on one line. The receipt keeps « ENCAISSÉ », its amounts and
              « rendez-vous réalisés ».
  tear line   the receipt's dashed `ReceiptTearLine`
  highlight   centred in the remaining height, raised by a 24 pt bottom padding so the podium
              stays close to the summary (below)
  footer      « Créé avec » metadata at 12 pt + logo-editorial 68 pt, 85 % opacity — the wordmark
              leads, the words are secondary
  ```

- **Highlight.**
  - Every category — Top prestations, Top produits, Clients qui dépensent le plus, Clients les
    plus fidèles — the SAME `InsightsPodium` and the same places, metrics and order as the receipt.
    Clients read `Prénom N.` (never a full last name) in the podium's own name style; metrics stay
    clear: `195 €`, `3 rdv`. Medals, gold /
    silver / bronze, lilac plinths, #1 centred, names on 2 lines then ellipsis, never shrunk — in
    its `story` layout: #1 on 40 % of the width, #2 / #3 on 30 % (the plinths still touch), and
    each metric uses its whole column. Measured in Plus Jakarta Sans, `312 prestations` fits #1 and
    `18 prestations` fits #2 / #3 on one line. A metric is NEVER truncated: at worst it wraps onto a
    second line; it never shrinks. The receipt keeps its 36 / 32 % layout, with the same rule: its
    metrics use their whole column too (no side padding), so `2 prestations` stays on one line under
    #1 at 375 pt (iPhone SE), and a longer one wraps instead of ending in an ellipsis.
  - Empty category: its quiet centred message. Empty period: « Une période toute calme ✨ »
    (`sectionTitle`, foregroundSoft), no podium.
- **Private amounts.** « Encaissé » and « Panier moyen » are frosted, never printed: a `lav100`
  pill (`radii.pill`, no border, no gradient) holding soft `lav200` digit-shaped marks and an
  accent `€` at 80 % opacity — four 18 × 14 pt marks in a 40 pt pill for « Encaissé », three
  9 × 7 pt marks in a 20 pt pill for « Panier moyen ». The shape never depends on the value and no
  digit is rendered, so the image can reveal nothing, not even a blurred number (a native blur would
  not survive the capture anyway). The label above or beside it stays readable.
- **Brand.** The professional's result, powered by BeautIzzy: a small mark at the top, « Créé avec »
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

## 36. Directory Lists — Produits and Clientèle, Actifs / Inactifs

Produits and Clientèle browse their active and inactive records the SAME way. Supersedes the
second, bottom « Inactifs » / « Archivés » section of both lists, and the §22 « Clientèle count ».

### Screen title

« Produits » and « Clientèle » are identity only: no count beside either title (§17 header).

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
- spoken as tabs, with their selected state and count (« Archivés, 1 »).

### Wording

- Produits: « Actifs » / « Inactifs ».
- Clientèle: « Actifs » / « Archivés » — never « Inactifs »: archiving is the Client domain's
  established term (the « Archivé » row mention, archive / restore actions). Archived Clients
  are searched from the « Archivés » tab.

### Clientèle rows — photo or initials

- a Client photo shows directly in the row when one exists, cropped (`cover`), never stretched;
- the frame is the Produits list thumbnail: the same 52 pt rounded square with the same corners
  (§11), so the two lists read as one family rather than as an address book;
- without a photo — or while it is still loading — the two initials (« NH ») fill the SAME frame
  on the Client lavender: no spinner, skeleton, silhouette or layout shift when the photo arrives;
- the photo is the Client Profile's photo (same stored reference, same device cache); the list
  never edits it and the avatar is not a separate button — the whole row opens the profile;
- the avatar is silent for assistive technology: the row already speaks the Client.

### One directory grid

Clientèle and Produits share the same directory grid, so switching between the two tabs never
moves it; only the row content differs:

- the same page: white background, the platform gutter for title, search, tabs, section header,
  rows and empty states, the same floating + placement;
- the same rhythm: search right below the title, tabs or « Actifs » header at the same distance,
  the first row at the same height;
- the same rows: thumbnail → copy → chevron. The 52 pt rounded-square thumbnail on the gutter,
  the same gap to the text column, the same vertical padding, the same 72 pt minimum height, the
  same flat lavender pressed state, and the same small muted chevron at the end — decorative, not
  a button, silent for assistive technology: the whole row is the one action;
- Clientèle rows show no birthday (neither the date nor the « Aujourd'hui » badge): the birthday
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

**Interior.** The visual language of the « Tops & tendances » share card (§35) — the same BeautIzzy
family, structurally simpler, with no analytics (no podium, medal, chart or KPI), never an
administrative form:

```text
             [symbol 25 pt]               decorative, restrained
          ESTIMATION TARIFAIRE            eyebrow, accent
               Maison Léa                 screenTitle, lav700, wraps
            24 septembre 2026             metadata, soft — generation date, no time
- - - - - - - - - - - - - - - - - - - - - ReceiptTearLine
Prestations                               rowTitle, lav700, header
Coupe brushing                      45 €  body ↔ control tabular
───────────────────────────────────────── subtle hairline between lines
Balayage 1                          70 €
╭───────────────────────────────────────╮
│             TOTAL ESTIMÉ              │ ShareHighlightPanel (lav050, radii.large):
│                 115 €                 │ eyebrow accent over display, lav700
╰───────────────────────────────────────╯
Estimation indicative basée sur les prestations sélectionnées.   metadata, soft, centred
          Créé avec [BeautIzzy logo]      CreatedWithBeautIzzy (68 pt, 85 %)
```

- **Two presentations, one interior** — exactly the « Tops & tendances » pipeline (§34, §35).
  `EstimationDocument` is the interior only, with no surface of its own:
  - **printer:** inside `ReceiptPaper`, the torn-edge ticket every BeautIzzy receipt feeds out of the
    printer (as `BusinessInsightsReceipt`). The paper is as tall as its document; the printer
    scrolls it whole when it is taller than the screen (§25). Its text follows the device text size.
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
  `ShareHighlightPanel` (the lavender panel container) and `CreatedWithBeautIzzy` (« Créé avec » +
  the editorial logo, spoken « Créé avec BeautIzzy » once).
- No recipient: no Client name, no « Client » / « Pour » line, no blank placeholder. No height is
  fixed: a long name wraps, no line or amount is ever truncated or shrunk, and a long estimation is
  simply taller.

---

## 38. Neutral Client Terminology — « Clientèle » and « client »

BeautIzzy serves professionals whose clientele is women, men or both. The exported reference and
`DESIGN.md` §8 address the Client in the feminine (« la cliente », « Clientes »). Do NOT reproduce
that wording. Supersedes every feminine Client quote of the earlier sections.

- **The directory** — the tab and its screen title read **Clientèle**. The route stays
  `(tabs)/clientes` and the trigger `name="clientes"`: technical identifiers are not copy.
- **One person** — the natural masculine form of « client », never `client·e` nor
  `cliente/client`: « Ajouter un client », « Nouveau client » (form title), « Ajouter le client »
  (form confirmation), « Modifier le client », « Fiche client » (profile title, form backdrop),
  « Rechercher un client », « Choisir un client », « Changer de client », « Aucun client »,
  « Aucun client trouvé », « Aucun client actif », « Client introuvable », « Ce client n'existe
  plus. », « Archiver le client », « Réactiver le client », « Photo du client », « Client inconnu ».
- **Lifecycle** — the directory tabs read « Actifs » / « Archivés », the row and profile mention
  « Archivé »; archive and deletion copy says « ce client », « le client », « clients archivés »
  (« Vous pourrez le restaurer plus tard », « Conservez-le archivé… »).
- **Appointments** — the `Client` step, row and eyebrow (`CLIENT`), « Rendez-vous client »,
  « Anniversaire du client ». Cancellation actors: « Le client » / « Vous », recorded as « Annulé
  par le client » / « Annulé par vous » — never « le salon », which would tie BeautIzzy to hair salons.
- **Sales and Caisse** — `Client`, « Choisir un client », « Vente sans client ».
- **Communications** — « Rappels clients », « Rappel client », « Clients inactifs », « Inactif
  depuis » (the row sits under « Clients inactifs », so the noun is not repeated).
- **Everywhere else** — « Rendez-vous, prestations et clientèle » (Discovery), « Clients qui
  dépensent le plus », « Clients les plus fidèles » (Tops & tendances), and the native photo /
  camera permission prompts (« photos de vos clients et de vos produits »).
- Future onboarding completion copy reads « Tout est prêt », never a gendered « Prête ».

`src/features/clients/__tests__/neutral-client-wording.test.ts` guards the presentation sources:
it reads string literals, template text and JSX text — never comments, route names or testIDs —
and fails on a visible « cliente » / « clientes ».

---

## 39. Surface Hierarchy — « Lavender satin » App Background

**Precedence.** Supersedes, for the native runtime, `DESIGN.md` §2 `--bg #ffffff` (« Fond de toutes
les surfaces d'application ») and colour rule 2 « Jamais de fond de page pastel » as far as the PAGE
BACKGROUND is concerned, and the white-screen / `screenWarm` split implied by §10, §17 and §29.
`DESIGN.md` keeps both rules as the historical export reference. Rule 2 still holds for pastels:
they distinguish appointments, phases and states, never a page. Everything else of §10, §19–§21 and
§36 is unchanged.

BeautIzzy now uses a very low-chroma lavender near-white app background. It is a NEUTRAL SURFACE
HIERARCHY, not a decorative pastel page: its chroma (0.007) is half of `lav050`'s, and it exists so
white cards and sheets read as raised without extra borders or shadows.

```text
APP BACKGROUND        semanticColors.screen        #F5F3F8   oklch(0.967 0.007 304)
  SHEET               overlayMaterial.surface      #FBF9FE   lav025 (§20, unchanged)
    PRIMARY CARD      semanticColors.surfaceElevated #FFFFFF
    INPUT             semanticColors.surfaceInput  #F1EEF5   oklch(0.953 0.010 305)
AGENDA CANVAS         semanticColors.canvas        #FFFFFF
BORDER / SEPARATOR    semanticColors.borderSubtle  #DFDEE4   (unchanged)
TEXT ON STRONG FILLS  semanticColors.onAccent      #FFFFFF
```

- **One app background.** Tabs (Clientèle, Produits, Plus), pushed screens (Client profile and
  histories, Prestations, Caisse, Rappels clients, SMS fidélisation), Welcome, auth, email
  verification, business setup, the navigation theme, every stack `contentStyle` and the root view
  all use `screen`. `screenWarm` is a compatibility alias of `screen` — debt of the former
  white-tab / lavender-pushed-screen split, to be removed; new code never uses it.
- **Primary content cards stay white** (`surfaceElevated`): `GroupedSurface`, `ActionGroup`, the
  Caisse total and empty cards, profile cards. Existing hairlines and shadows are kept; whether
  white cards directly on the page keep their hairline is decided after the real-device pilot.
- **Sheets stay slightly lighter than the page**: the §20 satin material (`lav025`) is unchanged, so
  every sheet, drawer and dialog keeps its surface; white cards and inputs inside still read.
- **Agenda remains a white operational canvas** (`canvas`): the pastel planning cards, Calendar
  Blocks and week headers were designed on white and lose most of their separation on a tint.
  `canvas` is reserved for such deliberate operational canvases — never a way around `screen`.
- **Inputs follow their placement** (`FieldPlacement` of `TextField` / `SearchField`): on a sheet
  or inside a white card the idle fill is `surfaceInput`; directly on the app background it is
  white (`surfaceElevated`), because `surfaceInput` is too close to the page there. Focus (white +
  accent outline) and error states are unchanged. A field on the page opts in with
  `placement="page"`.
- **Pressed states on the page** use `surfaceLavenderStrong`: `surfaceLavender` (lav050) is as
  light as the page and would vanish. Pressed rows inside white cards keep `surfaceLavender`.
- **Small text on the page**: `rose600` falls to ~4.3:1 on `screen`, so error and empty-stock text
  written directly on the page uses `rose700`. Graphics (now-line, dots, icons) are unchanged.
- **`onAccent`** is the only colour for text and icons on strong accent, category or destructive
  fills. `surfaceElevated` always means a card surface, never a foreground.
- **Unchanged by this section**: appointment pastels, status, service-category and Calendar Block
  colours; `receiptPaper` (Résumé du jour, Tops & tendances keep their paper); the translucent
  whites of the camera / scanner overlays; the white branded splash and boot surface.
- **No feature screen defines its own root background colour.** A root inherits `Screen`,
  `AuthScreenLayout`, `SheetScreen` or the stack `contentStyle`, all driven by semantic roles. The
  pushed screens that still paint `screenWarm` on their own safe area are legacy, equal to `screen`
  through the alias; no new root may do so. Future
  screens — client import source, paste list, candidate review, duplicate review, onboarding steps —
  need no one-off background styling.

---

## 40. Glass Sheet Pilot — EXPERIMENTAL

**Status: pilot, not a global rule.** Limited to two sheets; a rollout to other sheets requires
real-device approval and an update of this section. Until then §20 (satin material) remains the rule
for every sheet, and the « no blur view » line of §21 still governs the light glass controls.

- **Where Liquid Glass lives.** Liquid Glass is reserved for compatible transparent-modal / custom
  sheet surfaces: the drawers (`BottomSheet`) and content-fit sheet routes (`SheetScreen
  fit="content"`) that BeautIzzy draws itself with `SheetPresentation`, over the dimmed page. There the
  material has a real page beneath it to sample, and the iOS 26 simulator pilot shows it clearly.
- **Native large workflow form sheets remain satin** (`SheetScreen fit="fill"`, `workflowSheet`:
  Appointment creation and editing, Sale creation) because the native `formSheet` presentation does
  not provide a useful underlying surface for the material to sample: in the pilot the glass was
  barely perceptible there. This is a BeautIzzy presentation decision: those long, keyboard-heavy
  workflows keep the stable native sheet, and `fill` shells ignore `material`.
- **An enhancement over the existing material, never a replacement.** The sheet still reads as
  `overlayMaterial.surface` (`#FBF9FE`). Where the native glass is drawn, the surface becomes
  transparent and shows, from bottom to top: the system glass (`expo-glass-effect` `GlassView`,
  `regular`, light scheme — passive and native, no snapshot, no per-frame JS), a moderate veil of
  the same lav025 (`overlayMaterial.glassTint`, `rgba(251, 249, 254, 0.6)`), then the gloss and the
  content. Target: the material and the dimmed page are perceptible, the page's text is not
  comfortably legible, the sheet still reads as BeautIzzy lavender white, the content stays crisp.
  (The first 88 % veil hid the material almost entirely; 60 % is the starting point to validate.)
- **Glass sheen.** The pilot's `SurfaceGloss` uses `gloss.glassSheet`: the same top light, spread
  over 220 pt instead of 132 pt and more translucent (72 % → 32 % → 0 instead of 96 % → 55 % → 0),
  so it reads as light held in the material, not a white band. Same top hairline, no outline, no
  glow. The premium feel comes from the native material, not from the gradient. Default sheets keep
  the §20 sheen unchanged.
- **Fallback = today's sheet.** Android, iOS without Liquid Glass or without the glass API, and iOS
  with Reduce Transparency: the opaque `#FBF9FE` surface with the glass sheen. Readability never
  depends on the glass.
- **Opaque inside.** Cards stay white (`surfaceElevated`) with their hairlines and shadows; inputs
  stay `surfaceInput` with their focus and error states; segmented controls, action areas and text
  colours are unchanged. The header (« Annuler » leading, title centred), the grabber, radii, scrim
  and motion are unchanged.
- **Opt-in only** — `material="glass"` on `BottomSheet` (`SheetPresentation`) or `SheetScreen
  fit="content"`. The default is `satin`.
- **The two pilot sheets**:
  1. the Client form (« Nouveau client » / « Modifier le client », `ClientFormSheet`) — a frequent
     editing drawer, opened from Clientèle, the Client profile and, stacked, from inside the
     Appointment creation / editing sheets, where the simulator confirmed the glass;
  2. the Prestation sheet (`ServiceEditorScreen`: type chooser, form, details) — a content-fit
     sheet route on `editorSheet`, with white phase cards and `surfaceInput` fields.
- « Modifier le rendez-vous », confirmation dialogs, destructive drawers, camera / scanner,
  receipts, Insights, Agenda, the tab bar and every other sheet are untouched.

---

## 41. Client Import — « Importer ma clientèle »

Domain: `docs/domain/CLIENTS.md` §3b. Supersedes §36's « the shared floating + opens the creation
sheet » for Clientèle only.

### Entry

- **Clientèle floating +** — the Agenda menu pattern (§17 / §19): « Ajouter un client » (the shared
  creation sheet, unchanged) and « Importer ma clientèle ». The button is spoken « Actions de la
  clientèle ».
- **Empty directory** — a secondary `AppButton` « Importer ma clientèle » under « Aucun client »,
  where a first-time professional looks. Hidden while searching and once a Client exists.
- A pushed screen (`clients/import`, `pushedScreen`) on the app background (§39): the Client
  histories' top bar (glass back, centred title), `Screen`, no root colour of its own.

### Steps

Two sources are enabled (`ENABLED_CLIENT_IMPORT_SOURCES`: paste, CSV), so the import opens on the
source choice. Back: the source choice leaves the import; the paste and CSV steps return to the
source choice; a staged review asks first (below). With a single enabled source the import would
open straight on it and its back button would leave the import.

```text
Importer ma clientèle                  (source choice — shown only with 2+ sources)
  Ajoutez en une fois les clients que vous suivez déjà.
  [ Coller une liste        ]          ONE ActionGroup, two rows
  [ Importer un fichier CSV ]
  Seuls le nom, le téléphone, l'email et l'anniversaire sont importés.

Importez un fichier CSV                sectionTitle — the system file picker opens at once
  Exportez votre liste au format CSV depuis Excel, Numbers, Google Sheets ou votre ancien
  logiciel, puis choisissez le fichier.
  (Ce fichier est vide. Choisissez-en un autre.)       rose700 metadata, only after a failure
  ╭ Colonnes reconnues ──────────────────────────╮     white GroupedSurface
  │ Prénom · Nom · Téléphone · Email · Anniversaire │
  ╰──────────────────────────────────────────────╯
  Vous vérifiez la liste avant d'importer. Les autres colonnes sont ignorées.
  [ Choisir un fichier ]               fixed footer; « Choisir un autre fichier » after a failure

Collez une liste de clients            sectionTitle
  Vous pouvez copier une liste depuis Notes, WhatsApp, Excel, Numbers ou Google Sheets.
  [ multiline TextField, placement="page" ]
  ╭ Exemple ─────────────────────╮     white GroupedSurface
  │ Sophie Martin 06 12 34 56 78 │
  │ Nadia 07 45 67 89 12         │
  ╰──────────────────────────────╯
  [ Analyser la liste ]                fixed footer, disabled while blank

47 clients détectés
  [ Nouveaux 42 | Doublons 3 | À corriger 2 ]      shared SegmentedControl, stretched, counts
  ╭─────────────────────────────────╮
  │ ◉  Sophie Martin              › │  one white card per candidate
  │    06 12 34 56 78               │
  ╰─────────────────────────────────╯
  [ Importer 42 clients ]              fixed footer, the exact number written
```

- **CSV step** — choosing « Importer un fichier CSV » opens the system file picker at once (Files
  on iOS, the system picker on Android; no permission). The step is what a cancelled picker or an
  unusable file comes back to: a cancel shows nothing new; a failure shows ONE plain French sentence
  (unreadable, too large, not a CSV, empty, nobody detected) and the button becomes « Choisir un
  autre fichier ». The button is disabled while the picker is open or the file is read. A usable
  file leads to the same review as a paste — never straight to an import.
- **Review cards** — white (`surfaceElevated`) with the card hairline, on the page. NEW rows carry
  a 44 pt checkbox (accent `checkmark.circle.fill` / muted `circle`, spoken as a checkbox); the rest
  of the card opens the correction drawer (chevron). Metadata lines: phone · email, the birthday,
  the duplicate explanation, then one « ⚠︎ » line per issue — blocking ones in `rose700` (page
  text), warnings in `foregroundSoft`. Information is never colour-only: every issue is a sentence.
- **Doublons** — possible duplicates first, each with a full-width « Importer quand même » /
  « Ne pas importer » action under a hairline; exact duplicates folded into one « N doublons
  détectés — ignorés » card (« 1 doublon détecté — ignoré »; « Voir » / « Masquer ») and never
  importable — neutral wording, since a duplicate may match an earlier line of the list rather
  than a saved Client. An archived match says « (archivé) ».
- **Batch notes** under the segments, metadata size: ignored spreadsheet columns, lines with
  nothing to import, and the accent notice when the stored clientèle changed during the review.
- **Correction drawer** — the canonical editing drawer (`BottomSheet`, §30 header « Annuler » ·
  « Vérifier le client », « Enregistrer » in the action bar, no pan-to-dismiss). SATIN, not the
  glass pilot (§40): it quotes the pasted source text (« Texte d'origine · ligne 3 ») and
  readability wins. Fields: Prénom, Nom, Téléphone, Email, the shared `BirthdayField`. Never Notes,
  never SMS consent.
- **Progress / result** — a centred spinner « Import en cours… 200 / 500 » (polite live region);
  then « 380 clients importés », in `rose700` « 120 clients n'ont pas pu être importés », a plain
  message (never a technical error), « Réessayer » (primary) and « Terminé ». Back is disabled
  while an import runs.
- **Imported summary** — under the count, ONE white card (`surfaceElevated`, `radii.large`,
  hairline, inset separators) listing only the Clients actually written, as created (the
  corrected values): the name (`rowTitle`) and at most one `metadata` line — phone · email, else
  « Anniversaire : 14 mai » — never a placeholder, no action. The card sizes to its rows and
  scrolls inside the room above the fixed footer. A confirmation, not a second review: no skipped
  duplicate is listed.
- **Leaving a staged review** — the back button, the native back gesture and hardware back all
  open the canonical discard dialog (`ConfirmationDialog`): « Quitter l'import ? » / « Les
  informations analysées et vos corrections seront perdues. » / « Continuer l'import » ·
  « Quitter ». « Continuer l'import » keeps the review exactly as it was; « Quitter » leaves the
  import. Never shown on the source choice, the paste step or the result; a running import stays
  simply blocked.

---

## 42. Accueil — the Landing Tab

Product decision (October 2026): a first tab **Accueil** is where the app lands; Agenda is the
second tab and is otherwise unchanged (PRODUCT.md §4). `src/features/home`, route
`(tabs)/index`; the Agenda route is `(tabs)/agenda`.

Accueil is a calm composition of existing data on the app background (`screen`). It scrolls as
one page. Hierarchy comes from SURFACE and SIZE, never from new colours: one tinted hero card,
two strong white figures, one lighter white summary, then shortcuts that are barely surfaces.

- **Header** (`HomeHeader`). The editorial logo (`BrandMark`, 160 pt box — artwork about
  148 × 49 pt — pulled back by its 6 pt transparent padding so the ARTWORK sits on the gutter).
  No date, no text, no ornament beside it — except, ONLY while the session's verification
  confirms a BeautIzzy Plus entitlement in force (`hasVerifiedPlusEntitlement`: active, trial,
  cancelled-but-active, complimentary; never pending, unavailable, expired, never, lapsed or
  signed out, and never inferred from full access), the small « Plus » mark (`PlusMarkBadge`):
  a 20 pt `surfaceLavenderStrong` pill, « Plus » in accent `chip`, 8 pt beside the logo and
  centred on it, spoken « BeautIzzy Plus » — a mark clearly secondary to the logo, never the
  paywall capsule. The row is `HomeBrandRow` (presentation, an explicit `showPlus`); a
  `__DEV__`-only sheet (Plus › Développement › « Aperçu badge Plus (test) ») draws it in both
  states on the page background, without touching the session. No watermark, no illustration,
  no mascot.
- **Top area** (`home-hero`): the greeting card and the next-appointment SLOT on ONE row, 20 pt
  under the logo (logo and row read as one group). The slot always holds a card: the next
  appointment, or its empty version when nothing is to come. The top area is one stable module —
  greeting left, appointment state right — and never falls back to a full-width row.
  - *Layout.* SIDE BY SIDE on every phone at the usual text sizes — iPhone SE (375 pt), the
    standard iPhones (393 / 402 pt) and the Pro Max (440 pt): asymmetrical 35 : 65 (flex, never a
    device check), 10 pt apart, one shared height — 136 pt minimum, compact rather than
    hero-sized; a two-line name takes it to about 141 pt. The appointment is the wide, dominant
    column. Long content never stacks the row: it wraps or is cut inside the cards.
  - *Accessibility fallback.* The two cards stack, full width each, only when enlarged text
    leaves less than 340 pt of room at the default text size (`HOME_HERO_ROW_MIN_WIDTH`,
    compared with `width / fontScale`) — « Bonsoir » would no longer fit its column. Text size
    is the ONLY reason to stack: an empty slot never stacks the row.
  - *Greeting* (`HomeGreetingCard`): a plain white card (`surfaceElevated`, `radii.large`, no
    shadow, 12 pt padding), content centred vertically. « Bonjour » (« Bonsoir » from 18:00) in
    the 23 pt `summaryValue` role — the page header, deliberately not a screen-sized title — and
    « Votre journée en un coup d’œil. » in soft `metadata`, free to wrap onto two or three lines
    in its narrow column (three on the SE), never abbreviated. Stacked, the line is soft `body`.
  - *Contextual greeting* — the card shows ONE state: an Appointment left to collect, otherwise
    the quiet line above, unchanged and NOT pressable. No other insight exists.
    - *Rule* (`getHomeEncashmentInsight`, `features/home/presentation.ts`). Read from the rows of
      the day summary (`getAppointmentDaySummary`, the figures of « Résumé du jour ») — no second
      money rule. An Appointment of TODAY qualifies when it is not settled (`collected === false`),
      something is left (`remainingCents > 0`) and its planned end is at least 15 minutes old:
      `getAppointmentEndAt(appointment) + 15 min <= now`. Cancellations and no-shows are already
      out of the summary; a fully prepaid visit and a free one owe nothing; the status does not
      matter otherwise — an Appointment never completed by hand qualifies.
    - *The 15-minute grace* (`HOME_ENCASHMENT_GRACE_MINUTES`). BeautIzzy stores no actual end, only
      the planned one, and the professional may simply be running late: the card never reminds at
      the theoretical end. A Home presentation rule only — the Appointment lifecycle is untouched.
    - *One Appointment*: under the greeting, « 09:00 · Alicia » — the time of
      `formatAppointmentTime` and the client's FIRST NAME ONLY, on every phone, never the surname
      on a wider one (the display name only for a client without a first name) — in the soft
      quiet-line role, on ONE line: a very long first name is cut, never shrunk. Then « Reste à
      encaisser » in the same size, semibold `accent`. Never « pas encore encaissé »: a deposit
      may already have been received.
    - *Several*: « 2 rendez-vous » (the real count) then « restent à encaisser », same two roles.
    - *Action.* The whole card is one button — the pressed feedback of the next-appointment card,
      no chevron in so narrow a column — and opens Appointment Details of the OLDEST outstanding
      Appointment (by start time), where the checkout footer is. Never the Caisse, « Résumé du
      jour » or the Agenda. Once it is collected, the next one becomes the target; with none
      left, the quiet line returns. Home's own clock (focus, foreground, every minute) drives it.
    - *Look.* Same white surface, greeting, 35 % column and row height. The accent is the page's
      link colour: a calm nudge, never a red or orange alert.
    - *Accessibility.* One label, the client name in full: « Bonsoir. Rendez-vous de 09:00 avec
      Alicia Burel. Reste à encaisser. Ouvrir le rendez-vous. » (« Bonsoir. 2 rendez-vous restent à
      encaisser. Ouvrir le plus ancien. »). The greeting is the page `header` only in the static
      state; as a button the card announces everything once.
- **Prochain rendez-vous** (`NextAppointmentCard`) — the hero, and the ONLY tinted surface
  of the page (its empty version included): `surfaceLavenderStrong`, `radii.large`, no shadow, 12 pt padding. Built for a column of
  about 210 pt (iPhone SE):
  - an accent eyebrow « PROCHAIN RENDEZ-VOUS »;
  - WHEN it starts on a line of its own (`control`, 16 pt semibold, `foregroundSoft`) — the time
    alone today, « 10:00 », never « Aujourd’hui · »; « Demain · 09:30 »; otherwise the date,
    « Jeu. 18 mars · 09:30 », which fits whole even on the SE — closed by the 14 pt accent
    chevron at the right edge;
  - a row: the 44 pt portrait `ClientAvatar` (photo from the shared media cache, initials
    otherwise) in a 2 pt white ring, 8 pt, then the CLIENT NAME as the strongest text
    (`sheetTitle`, 21 pt bold, navy, up to TWO lines) over the prestation summary (`metadata`,
    one line, the only text that is ever cut).
  The chevron sits on the time line so the row keeps its whole width: « Alicia Burel » and
  « Coupe Brushing 2 » hold on one line each at 375 pt. The whole card opens Appointment
  Details. The next Appointment is the nearest one that occupies the schedule, is not completed
  and starts now or later — today or any later day.
- **Nothing to come** (`NextAppointmentEmptyCard`). The empty version of the SAME slot: it takes
  the wide column of the row (flex 65, the shared 136 pt minimum height), or the second place of
  the stack with enlarged text. It is the same card as the hero — `surfaceLavenderStrong`,
  `radii.large`, no shadow, 12 pt padding — holding ONE statement, centred vertically in the
  card: an accent calendar glyph in a 36 pt white disc, 8 pt, then « Aucun rendez-vous à venir. »
  in soft `body`, free to wrap onto two lines, never cut. No eyebrow (« Prochain rendez-vous »
  over that message would say it twice), no secondary text, no chevron, no press, no action —
  « Rendez-vous » in Actions rapides creates one. Spoken once: « Aucun rendez-vous à venir ». (Not
  « Aujourd’hui est calme »: it also shows on a day whose appointments are simply over.)
- **Aujourd’hui.** `SectionHeader` with a trailing accent link « Résumé du jour › » that opens
  the existing receipt (§25) for today.
  - *Primary pair* (`HomeKpiCard`): two white cards, each an accent glyph in a 36 pt
    `surfaceLavender` disc, the VALUE in navy 30 pt bold, a `metadata` label — « Rendez-vous »
    and « CA potentiel ». Both values share the same size; a long amount steps down by its
    length (26, then 22), never measured or auto-shrunk. Amounts use the compact euro format
    (« 100 € », cents only when there are some).
  - *Secondary* (`HomeCollectionSummary`): ONE compact white card « Encaissements du jour » —
    « 0 € encaissé » | « 100 € restant » side by side, split by a hairline, values in 16 pt
    `control`, no glyph. The WHOLE card is one button that pushes the existing Caisse
    (`/cash-register`): an 18 pt accent chevron at the right edge, vertically centred on the WHOLE card (never
    inline with the title), no « Voir » button, no separate tap
    targets. Spoken once: « Encaissements du jour, déjà encaissé …, reste à encaisser … »,
    hint « Ouvre la Caisse ». Plus → Caisse is unchanged.
  - All four figures are exactly the domain day summary of today, the figures of « Résumé du
    jour ». This is NOT the Caisse total (money by the day it was received).
- **Actions rapides** (`HomeQuickAction`). One row of four light shortcuts: a 56 pt white
  rounded square (`radii.large`) with the accent glyph, and a one-word navy `chip` label UNDER
  it, outside the surface — « Rendez-vous », « Client », « Produit », « Vente » — spoken in full
  (« Nouveau rendez-vous », « Ajouter un client », « Ajouter un produit », « Nouvelle vente »).
  The whole column is the button. They open the existing flows; the glyphs are those of the
  same actions on the other tabs. The label stays on ONE line at full `chip` size and is never
  abbreviated: centred under its tile, it may reach half the row gap into the gutter on each side
  of its column, which is what keeps « Rendez-vous » whole at 375 pt (iPhone SE).
  Every shortcut CREATES something, and says so with a small plus: the calendar and the person
  use the system `…badge.plus` glyphs; the box (Produit) and the bag (Vente) have none, so the
  tile sets the same small accent plus, on a white knock-out disc, on the glyph's lower-right
  corner (`plusBadge`). One icon language, no second icon system.
- **Cette semaine** (`HomeWeekSummary`). `SectionHeader` with the trailing link « Résumé de la
  semaine › » (the existing receipt, §25, for the current week). TWO compact white cards side by
  side at every width, 42 : 58, 8 pt apart, about 100 pt tall (a minimum, never a fixed height;
  14 pt padding, `radii.large`, no shadow). Each spreads two lines over that height, so the
  range faces « Déjà encaissé » and the count faces « CA potentiel ». Secondary labels are
  12.5 pt — one step under `metadata` — which is what keeps every line whole at 375 pt.
  - *Card A — when and how many*: the week range WITHOUT its year at the top (« 5–11 octobre »;
    a week across two months shortens them, « 28 sept. – 4 oct. » — `formatHomeWeekRange`; the
    receipt keeps its own full wording), and under it the appointment count in navy 26 pt bold
    with « rendez-vous » on the SAME baseline (« 8 rendez-vous »). A count too wide for the
    column lets the label drop under it.
  - *Card B — money only*: two label → amount rows, « Déjà encaissé » and « CA potentiel », the
    amounts right-aligned on one edge in navy 18 pt bold (`stateTitle`); an amount longer than
    7 characters steps down to 16 pt `control`, never measured or auto-shrunk. If a row still
    lacks room the LABEL wraps onto a second line; the amount is never cut.
  No glyph, no chart, no trend, no percentage. The Agenda week (Monday → Sunday) of today, from
  the domain period summary — the figures of « Résumé de la semaine ».
- **Pilotage** (`HomeToolRow`). Existing business tools, consulted rather than created — never
  styled as quick actions: ONE borderless `GroupedSurface` of two 64 pt navigation rows split by
  an inset hairline (64 pt is a minimum). Each: accent glyph in a 36 pt `surfaceLavender` disc,
  `rowTitle` title, one `metadata` description, accent chevron. The description is never cut: at
  375 pt (iPhone SE) it wraps onto a second line and the row grows, glyph and chevron centred. « Créer une estimation — Chiffrer des prestations pour un
  client » pushes `/estimations/new`; « Tops & tendances — Voir ce qui fonctionne le mieux »
  opens the existing insights receipt on the current month.
- **Chevrons.** Every navigation chevron of Accueil — hero card, section links, Encaissements
  du jour, Pilotage rows — is the BeautIzzy accent, never the muted grey.
- **Rhythm.** 28 pt between sections (`spacing['2xl']`), 8 pt between a section title and its
  cards, 8 pt between sibling cards: generous between groups, compact inside them.
- **Order.** Logo, greeting, next appointment, the two figures, the collection summary, quick actions,
  Cette semaine, Pilotage. Nothing else. Weight decreases down the page: the hero is the only
  tint, today owns the only 30 pt figures.
- **No** day strip, day selection, timeline, chart, trend, low-stock block or ticket styling on
  the page itself. Browsing days belongs to the Agenda.

---

## 43. BeautIzzy Plus — Paywall Presentation and Read-Only Status

Product decision (October 2026, Phase 5): the BeautIzzy Plus paywall exists as a PRESENTATION
(`src/features/access/paywall`), reachable from no product route until the subscription routing
phase; the read-only experience is a quiet status, never an alarm. Enforcement stays disabled, so
no existing account sees any of it. Premium, warm, approachable: a polished App Store product,
never a subscription template.

- **Frame.** The paywall draws the first-run frame (`OnboardingStepLayout`, §17): top and bottom
  safe areas on `screen`, the quiet top bar (the glass back on the left and / or the glass close
  — `glassIcons.close`, spoken « Fermer » — at the end, each only when the caller handles it), a
  scrolling body (`bodySpacing="compact"`: 8 pt under the top bar instead of the 24 pt a frame
  header would need) and a fixed footer. It reads as the continuation of Discovery and setup.
  The ORDER is the decision first: hero (badge, illustration, headline, one short lead or the
  contextual notice), the plan cards, then the benefits — the hero is compact (4 pt gaps on
  every phone, the body 4 pt under the top bar) so that on a regular iPhone the selected annual
  card AND the name and price of the monthly card are in the first viewport above the footer
  (both cards whole on a Pro / Pro Max); an iPhone SE shows the annual card. Nothing is
  absolutely positioned, the body scrolls, the footer never covers content.
- **Brand.** « BeautIzzy Plus » is ONE lavender capsule (`PlusBrandBadge`), the canonical symbol
  (`BrandMark`, decorative) and the name in accent semibold, in two weights because the brand
  does not carry the same role everywhere: the paywall hero draws the HERO capsule — 30 pt
  high, 12 pt side padding, the symbol 16 pt wide, the name in `control` (16 pt) — centred above
  the illustration, the identity of the premium product and still clearly under the headline
  (ratio ≥ 1.4); « Mon abonnement » draws the LABEL capsule — 24 pt, 10 pt side padding, the
  symbol 13 pt wide, a 14 / 18 pt semibold name — a small brand label above the status, never
  the focus of the card (the status title, the plan and the dated sentence are). Spoken once:
  « BeautIzzy Plus ». No redrawn logo, no gradient.
- **Illustration.** `growth-duo.png`, `contain`, hidden from assistive technology; a present
  ACCENT, never the hero: square side = 12.7 % of the window height, bounded 100–116 pt on a
  regular phone (108 pt on an iPhone 17, 111 on a 17 Pro, capped at 116 so a Pro Max never
  inflates it) and 80–96 pt on a small one (85 pt on an iPhone SE). The artwork fills its PNG,
  so the rendered side is the visible side.
- **Headline.** « Faites grandir votre activité, simplement. » in navy, the 27 / 33 pt
  screen-title step on BOTH platforms (the Android `screenTitle` metrics; one notch under the
  iOS screen title, two under the `display` of Welcome, still editorial), centred, the page
  `header`; it wraps on two lines from the SE up. The violet is carried by the badge, the
  primary action, the chips and the selected card — never by a headline. Under it, either the
  lead (`body`, `foregroundSoft`, max 360 pt) or the contextual notice.
- **Benefits.** Three rows (`PaywallBenefitRow`), UNDER the plan cards, 8 pt apart: an accent
  glyph (16 pt) in a 30 pt `surfaceLavenderStrong` disc (calendar · bar chart · clock) and the
  approved sentence in `rowTitle` — « Tout votre
  quotidien au même endroit. », « Gardez le contrôle sur vos chiffres. », « Gagnez du temps chaque
  jour. ». Nothing else is claimed.
- **Plan cards** (`PaywallPlanCard`) — ONE white card per plan the store offers, the shape of the
  onboarding option card: `surfaceElevated`, 1.5 pt `borderSubtle`, `radii.large`, 16 pt
  padding, 8 pt apart, annual FIRST. A 24 pt selection ring on the left (hairline at rest; the
  accent fill with a white check once selected), the plan name (`rowTitle`: « Annuel »,
  « Mensuel »), the price in `summaryValue` (23 pt bold, tabular) with « par an » / « par mois »
  in soft `metadata` on the same baseline, the annual « soit 10,75 € par mois » line, then quiet
  chips (`surfaceLavenderStrong`, accent `chip` text): « Économisez 17 % » and « 14 jours
  gratuits ». Selected: `surfaceLavender` fill and the accent border, no shadow, no glow. The
  « Recommandé » badge (accent fill, white `chip`) sits beside the annual name ONLY when both plans
  are offered: a recommendation compares, it never claims alone.
  - *Every figure is store-derived* (`paywall-presentation.ts`): the store's own price string when
    it provides one, `Intl.NumberFormat` for the storefront locale otherwise, cents only when there
    are some (« 129 € », « 12,99 € », « $14.99 »). Savings appear only when both plans share a
    currency and the annual price is really under twelve monthly ones (a whole percentage); the
    trial only for an offer the store marked ELIGIBLE (« unknown » and « ineligible » show
    nothing). An invalid offer (a non-positive amount, a malformed currency, a fractional trial)
    is dropped, never shown with a phantom price. The annual plan is preselected whenever it is
    offered; one plan alone is preselected, with neither badge nor savings.
  - *Accessibility.* The group is a `radiogroup`, each card a `radio` with `checked` /
    `selected`; the label says everything the card shows: « Formule annuelle, 129 € par an, soit
    10,75 € par mois, Économisez 17 %, 14 jours gratuits, recommandée ». Selecting ticks
    `haptics.selection`; re-pressing the selected card does nothing.
- **Footer.** The primary `AppButton` — « Essayer gratuitement 14 jours » when the selected plan
  carries an eligible trial, « S’abonner à BeautIzzy Plus » otherwise — over a centred `metadata`
  footnote 4 pt under it (« Puis 129 € par an. » / « 129 € par an. »), the two never
  disagreeing with the selected card. While the offering loads the action is
  disabled and reads « Chargement des offres… »; without a purchase entry point it is disabled and
  the footnote says « Achat non disponible dans cette version. »; with an unavailable offering
  there is NO primary action at all. Then the tertiary way out — « Explorer sans abonnement »
  (first offer; spoken « Explorer sans abonnement, en lecture seule », with the read-only limit
  as the quiet `metadata` caption INSIDE the same control, spoken as its hint: « Sans
  abonnement, vous pouvez consulter votre activité, sans la modifier. »), « Revenir à mes données »
  (an existing read-only account) or « Continuer » (active subscriber, pending verification; drawn
  primary when nothing is sold) — visible at once, never hidden behind a second tap. Last, the
  accent `metadata` links « Restaurer mes achats », « Conditions d’abonnement »,
  « Confidentialité », each ONLY once its integration provides the callback: no link leads
  nowhere, no URL is invented.
- **Offering states** (`PaywallNotice`, a white card with an accent glyph or a small spinner — never
  red, never a warning icon): « Offres bientôt disponibles — Les formules BeautIzzy Plus ne sont pas
  encore proposées dans cette version. Vos données restent consultables. » (no store adapter,
  the application's default), « Offres indisponibles pour le moment » with a `secondary`
  « Réessayer » only when the caller can retry (store unreachable, no valid plan), and the
  pending « Chargement des offres… ». No phantom price, no checkout.
- **Contexts** (`PaywallContext`, chosen by the caller):
  - *Première offre* (setup just completed): headline, the one-line lead « Votre espace est prêt.
    Profitez pleinement de BeautIzzy Plus. », plans, benefits, the action, « Explorer sans
    abonnement » and its caption. The read-only limit is said there, next to the action, not in
    the lead.
  - *Compte existant en lecture seule*: the reassuring notice « Vos données sont conservées. » +
    the policy's sentence (« Votre abonnement BeautIzzy Plus n’est plus actif. » only when the
    store confirmed the end; « Votre compte n’a pas d’abonnement BeautIzzy Plus. »; « Votre
    abonnement n’a pas pu être vérifié pour le moment / depuis plusieurs jours. » — never
    "expired", never a payment failure) + « Vous pouvez toujours consulter vos rendez-vous, votre
    clientèle et vos chiffres. Les modifications nécessitent BeautIzzy Plus. », then plans,
    benefits, the action and « Revenir à mes données » (no caption: the notice already said it).
  - *Abonnement actif*: « Votre abonnement BeautIzzy Plus est actif. » / « Merci de faire grandir
    votre activité avec BeautIzzy. », no plan, no price, no benefit list, one primary
    « Continuer ». An active subscriber is never routed into a forced upsell.
  - *Vérification en cours*: the pending notice « Vérification de votre abonnement… », benefits,
    no plan and no action — nothing claims a subscription or its absence — and « Continuer », so
    an unreachable store never leaves the professional on a spinner.
- **Read-only status** (`ReadOnlyStatusCard`, Accueil, §42 unchanged otherwise): a white card
  under the top row, before « Aujourd’hui », ONLY while the access policy reports read-only with
  enforcement enabled — an accent eye glyph in a 36 pt `surfaceLavender` disc, « Votre activité
  est en lecture seule. » (`rowTitle`) and four soft `metadata` lines: « Vous pouvez toujours
  consulter vos rendez-vous, votre clientèle et vos chiffres. », the policy's sentence, « Vos
  données sont conservées. Les modifications nécessitent BeautIzzy Plus. », « La gestion de
  l’abonnement sera bientôt disponible dans l’application. ». No button, no red, no modal, no
  repetition on other screens; spoken once as one element.
- **Refused modification** (`alertPersistenceFailure`): « Action réservée à BeautIzzy Plus — Vous
  pouvez toujours consulter vos données. Un abonnement BeautIzzy Plus est nécessaire pour les
  modifier. », preceded by the policy's sentence when it adds something (expired, unverified).
  Every other failure keeps « Enregistrement impossible » exactly as before. No success is ever
  shown for a refused write.
- **Development preview** (Plus › Développement › « Aperçu BeautIzzy Plus (test) », `__DEV__`
  only): every state above with fictional offers (the intended French prices and the 14-day
  trial, held in test fixtures), and — first in the list, since Phase 6.2 — « Offre RevenueCat
  actuelle »: the same screen over the REAL current offering of the signed-in account (store
  prices, store trial eligibility; the Test Store in a debug build, whose prices may differ from
  Apple's), with its loading and unavailable states and a « Réessayer » that asks again. Its
  purchase action buys nothing and says so (« Les achats ne sont pas encore activés dans cette
  version. »). One native modal at a time (§16): the scenario list slides down, then the paywall
  is presented from its `onDismissed`; closing the paywall brings the list back once it is really
  dismissed; the live entry's loader mounts and unmounts with the paywall.
- **Trial wording** is the store's period, never a number of the app: weeks are said in days
  (« 14 jours gratuits » for a two-week introductory period), months and years in their unit
  (« 1 mois gratuit », « Essayer gratuitement 1 mois »). Shown only when the store marked THIS
  account eligible; unknown or ineligible shows the standard price.
- **« Mon abonnement »** (Plus, between « Compte » and the identity block; `SubscriptionStatusSection`,
  Phase 6.2): the section header and ONE white card (`surfaceElevated`, `radii.large`, 16 pt
  padding, no shadow, no icon, no button, no link): the « BeautIzzy Plus » capsule
  (`PlusBrandBadge`, left-aligned) ONLY for a verified entitlement, the status in `rowTitle`
  (« Abonnement actif », « Essai gratuit », « Actif jusqu’au 21 novembre 2026 », « Accès offert »),
  the plan in accent `metadata` when the store established it (« Mensuel » / « Annuel »), then
  one soft `metadata` detail with accurate wording (« Période en cours jusqu’au … » — never a
  renewal or a payment promised; « Fin de l’essai le … »; « Sans renouvellement automatique. »;
  « Jusqu’au … » for a dated complimentary access, nothing for an indefinite one). Without an
  entitlement: no badge, « Aucun abonnement actif », the read-only vocabulary's sentence and,
  while enforcement is disabled, « Toutes les fonctionnalités restent disponibles. » — quiet,
  never a loss. Pending or unverifiable: « Vérification de l’abonnement… » / « Abonnement non
  vérifié », never "free". The badge derives from the verification only, never from full access.
  One accessible element, spoken as « BeautIzzy Plus, Abonnement actif, Mensuel, Période en cours
  jusqu’au … ». A `__DEV__`-only sheet (Plus › Développement › « Statut BeautIzzy Plus (test) »)
  draws every status from fixtures, in one sheet.
- **No** gradient, glass effect, animation beyond the frame's entrance, countdown, strike-through
  price, « most popular » claim, hard-coded price, or fake purchase.
