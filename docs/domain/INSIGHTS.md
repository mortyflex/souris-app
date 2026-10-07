# BeautIzzy — Business Insights (« Tops & tendances »)

## 1. Purpose

« Tops & tendances » gives the professional a read-only recap of one civil period: the money received,
the appointments actually performed, and the top services, products and clients.

It is DERIVED. Every value is computed on demand from the existing records (Appointments, Sales,
Appointment deposits). Nothing is persisted: there is no analytics snapshot and no second financial
model, and no schema, migration or sync change goes with it.

Domain: `src/domain/insights/` (`getInsightsPeriod`, `shiftInsightsAnchor`, `getBusinessInsights`).
Presentation: `src/features/insights/`. Design: `docs/design/DESIGN_OVERRIDES.md` §34.

---

## 2. Periods

Periods use the DEVICE-LOCAL civil calendar and the French week convention.

| Kind | Period |
| --- | --- |
| `DAY` | the anchor's calendar day |
| `WEEK` | Monday → Sunday containing the anchor |
| `MONTH` | the calendar month containing the anchor |
| `YEAR` | the calendar year containing the anchor |

A period is `[start, end)`: `start` is a local midnight (included) and `end` is the local midnight right
after the period (excluded). Boundaries are built with the local `Date` constructor, never through UTC,
so a payment at 23:59 or a daylight-saving change never moves a record into the neighbouring period.

Browsing moves the anchor by exactly one period: ±1 day, ±1 week, ±1 month or ±1 year. A month or year
shift keeps the day of the anchor, clamped to the end of a shorter month (31 janv. → 28/29 févr.;
29 févr. → 28 févr.), so changing the period kind afterwards stays around the same date.

Opening: the anchor is the date the Agenda is SHOWING (not the real today), and the kind is `MONTH`. The
receipt then owns its own browsing state. Browsing never changes the Agenda date, and every opening
starts again from the Agenda date.

---

## 3. Two concepts, never one number

### A. Money received — `Encaissé` (by PAYMENT date)

`Encaissé` is the Cash Register over the period (`getCashRegisterIntervalSummary`, the same selection
and arithmetic as the Caisse day and month summaries):

- final Appointment checkouts (`appointment.payment`), on their `paidAt`;
- standalone Sale payments (Sales without `appointmentId`), on their `paidAt`;
- ACTIVE Appointment deposits, on their own `paidAt`.

A Sale sold during an Appointment is never counted on its own: the checkout already recorded that
money. A VOIDED deposit counts nowhere. A deposit is never moved to the Appointment date. Example: a
30 € deposit paid on 22 September for a 5 October Appointment counts in September. The final checkout of
70 € on 5 October counts in October, and the deposit is not counted again.

A deposit kept on a `CANCELLED` or `NO_SHOW` Appointment is still money received: it stays in
`Encaissé`, as it does in the Caisse, until it is voided.

### B. Business activity (by APPOINTMENT date)

**Rendez-vous réalisés.** Appointments with status `COMPLETED` whose `startAt` falls in the period.
`COMPLETED` is the authoritative outcome: an explicit checkout, a fully prepaid completion, or the
automatic completion of past local days (`finalizePastBusinessDays`). `SCHEDULED`, `CONFIRMED`,
`IN_PROGRESS`, `CANCELLED` and `NO_SHOW` are never activity, whatever was paid for them. A same-day
Appointment not yet checked out is therefore not counted until it completes.

**Appointment value.** `getAppointmentExpectedTotal(...).expectedTotalCents`: services net of the
discount plus the Sales sold during the Appointment. This is the same value that « Résumé du jour »
averages and that Details shows. A deposit is a way of paying that value and never adds to it: 100 € =
30 € deposit + 70 € checkout is a 100 € Appointment. A fully prepaid Appointment is valued once.

**Panier moyen.** The sum of those values divided by the number of completed Appointments, rounded to
the cent. It is `0` when no Appointment was completed. It is never the cash received divided by an
appointment count.

**Client spending.** This is the client « Total dépensé » rule (`docs/domain/CLIENTS.md` §6), scoped to
the period. It sums the services net of the discount (`getAppointmentServicesTotal`) of the client's
`COMPLETED` Appointments. It includes no product Sale and no deposit.

### C. Products sold (by SALE date)

Every Sale whose `completedAt` falls in the period is counted once, whether it is standalone or was sold
during an Appointment. Each line counts its `quantity`. Sales have no status: a deleted Sale no longer
exists and counts nowhere.

---

## 4. Rankings

Each ranking shows at most three places, as a podium. All four categories are always present (one
carousel page each). A category with no result shows its own quiet message and is never padded with
placeholders. Places are read-only.

| Ranking | Counts | Order |
| --- | --- | --- |
| Top prestations | one per `AppointmentItem` of a completed Appointment, grouped by `serviceId` | count ↓, name, id |
| Top produits | units of the Sale lines of the period, grouped by `productId` | units ↓, name, id |
| Clients qui dépensent le plus | period client spending (> 0 only) | spending ↓, completed visits ↓, client id |
| Clients les plus fidèles | completed Appointments of the period | completed visits ↓, spending ↓, client id |

Names come from SNAPSHOTS: `AppointmentItem.serviceName` and `SaleItem.productName`. When a Service or
Product was renamed within the period, the row shows the snapshot of its most recent occurrence in that
period. Renaming today never rewrites what an older period calls it. Name comparison uses the French
collator.

Clients are shown compactly as `Prénom N.` on the private ticket. Visit counts are written `3 rdv`
(spoken « 3 rendez-vous »), never a truncated « rendez-v… ». The shareable card (§7) shows the same
rankings, built from `BusinessInsights` as its own public model, never by capturing this receipt.

There is deliberately no « Clients qui dépensent le moins » ranking.

---

## 5. Financial conflicts

A financial conflict is an Appointment of the period (by appointment date) whose ACTIVE deposits exceed
its expected total (`findAppointmentDepositInvariantBreach`, APPOINTMENTS.md §25d). Under that rule a
`COMPLETED` Appointment is never a conflict. A conflicting Appointment is therefore never activity, and
none of its value enters the activity figures. Its ACTIVE deposits are real money received, so they
stay in `Encaissé` exactly as in the Caisse. Nothing is repaired, clamped or normalised. The receipt
shows how many conflicts the period contains in one quiet sentence.

---

## 6. Empty, partial and future periods

- An empty period prints the whole receipt: `Encaissé 0,00 €`, `0 rendez-vous réalisés`, `Panier moyen
  0,00 €`, the note « Aucune activité sur cette période », and each category page with its own empty
  message.
- The current period shows only what is already recorded. There is no forecast or projection.
- A future period normally shows nothing: scheduled Appointments are not activity.

---

## 7. Sharing — the share card

« Enregistrer » and « Partager », next to « Fermer » on « Tops & tendances » only (never on « Résumé
du jour »), save or share a DEDICATED social card as an image — the same card and the same export for
both. The receipt and the card are two compositions of the same
insights, with the SAME rankings:

| | In-app receipt | Share card |
| --- | --- | --- |
| Model | `buildInsightsReceipt` | `buildInsightsShareCard` (`insights-share-card.ts`) |
| Rankings | `buildInsightsRankingSections` | the same `buildInsightsRankingSections`, category on screen |
| Clients | `Amel B.`, `195,00 €`, `3 rdv` | `Amel B.`, `195 €`, `3 rdv` |
| Encaissé · Panier moyen | amounts | frosted: label readable, NO amount in the model or the image |
| Conflicts | one informational sentence | never mentioned |
| Shown | in app | exported PNG, native share sheet |

Pipeline: `getBusinessInsights` (computed once by the ticket) → `buildInsightsShareCard` (words it,
with the ranking sections shared with the receipt) → `BusinessInsightsShareCard` (renders it). The
card component takes no storage, session or analytics input and knows nothing of the carousel. The
receipt is never captured.

**Client privacy (public card).** A client is shown as the readable first name and the initial of
the last name: `Amel B.`, or `Amel` without a last name — never a full last name. No client id
enters the public model (public rows are keyed by place). Metrics stay visible: spending as a
compact amount (`195 €`, `123,45 €` — cents only when there are some, never rounded) and visits as
`3 rdv`. Same places, same people, same order as the ticket: only the presentation differs
(`buildInsightsRankingSections(…, 'public')`).

**Turnover privacy (public card).** « Encaissé » and « Panier moyen » stay in the ticket. The public
model carries neither amount, so no exported image can reveal them; the card shows each label over
a frosted placeholder (DESIGN_OVERRIDES.md §35). The completed count (« 28 rendez-vous ») stays readable.

**What is shared.** Exactly what is on screen: the browsed period (its receipt label) and the SETTLED
carousel category. Browsing back to the Agenda month never happens on export. The one
figure printed is the receipt's completed count from the same `BusinessInsights`, worded short:
« 28 rendez-vous » (« 28 rendez-vous réalisés » in the ticket).

| Category on screen | Share card |
| --- | --- |
| Top prestations | the podium: service snapshot names, ranks, `N prestations` |
| Top produits | the podium: product snapshot names, ranks, `1 unité` / `N unités` |
| Clients qui dépensent le plus | the podium: `Prénom N.`, ranks, spending (`195 €`) |
| Clients les plus fidèles | the podium: `Prénom N.`, ranks, visits (`3 rdv`) |

Every podium has the ticket's places, metrics and order; services and products are identical to it. An empty category
shows its quiet message and no podium. An empty period shows its zero figures and « Une période toute calme ✨ »
instead of any category; no ranking is invented. Financial conflicts are already outside the
activity figures; the card says nothing about them.

**Image.** A 9:16 story, laid out at 360 × 640 dp with every text at a fixed size, exported at
1080 × 1920 px PNG through `ImageExportFrame` — whatever the phone, its density or its text size.
The card is mounted off screen while the ticket is open; it is not UI and is hidden from assistive
technology.

**Partager.** One light haptic, a busy « Partager » (spinner, every action ignored: one image per
share), capture, native share sheet. The sheet reports no outcome, so nothing is confirmed when it
closes — not even after « Enregistrer l’image » inside it. Dismissing or cancelling it leaves the
ticket open where it was. A failure shows « Impossible de préparer le partage. »; « Partager » retries.

**Enregistrer.** The only flow that confirms a save. It asks for the minimum permission (add-only on
iOS, images only on Android), captures the same card and adds it to Photos. Once Photos has it: one
success haptic and « Image enregistrée dans Photos » above the actions, which goes away on its own
after 2.6 s. A declined permission shows « BeautIzzy n’a pas accès à Photos. Autorisez-le dans Réglages
pour enregistrer l’image. » (no automatic redirection to Settings); any other failure « Impossible
d’enregistrer l’image. ». Busy like « Partager », one save per press.

Neither action closes the ticket or moves its period or category. The temporary PNG is released as
soon as the share or the save is over. A notice belongs to one opening.

**Nothing is persisted.** No analytics, share state or image is stored; no schema, migration or sync
change.

---

## 8. Not implemented

- sharing a capture of the receipt itself (only the dedicated card is shared);
- actions from the rankings (open a profile, reward, discount, offer);
- « Clients à relancer »;
- revenue per service;
- any persisted analytics.
