# Souris — Product

## 1. Product Definition

Souris is a lightweight native mobile application for beauty professionals.

Its purpose is to make the professional's working day easier to understand and manage without the administrative weight of traditional salon-management software.

The first real-world implementation and validation context is:

- one hairdresser;
- one business;
- one professional;
- daily mobile usage.

Souris is not a hairdressing-only application.

The core product should remain appropriate for appointment-based beauty professionals such as:

- hairdressers;
- nail technicians;
- estheticians;
- lash and brow professionals;
- similar independent beauty professionals.

The guiding principle is:

> Generic in the data model, specific in the user experience.

---

## 2. Product Promise

Souris should provide the minimum tools required to manage a beauty professional's activity clearly and quickly.

The product should make the professional feel:

> “I know what my day looks like, who I am seeing, what I need to do, and what time I actually have available.”

Souris does not compete by offering the largest number of features.

It competes through:

- clarity;
- speed;
- excellent daily workflows;
- understanding of real service timing;
- low cognitive load;
- pleasant native mobile interaction.

---

## 3. Product Simplicity

Souris should remain deliberately small.

A feature should not be added merely because another salon-management product offers it.

New capabilities should normally improve at least one of:

- appointment management;
- understanding of the working day;
- client follow-up;
- service configuration;
- processing-time visibility;
- product retail;
- stock management;
- reduction of repetitive daily work.

If a feature does not materially improve one of these areas, it should be questioned.

Souris must not become an ERP.

---

## 4. Primary Navigation

The intended primary navigation is:

```text
Agenda
Clientes
Produits
Plus
```

There is no separate Home dashboard.

Agenda is Home.

The professional primarily opens Souris to understand and manage the working day.

---

## 5. Agenda

Agenda is the core product surface.

It must allow the professional to understand:

- what happens today;
- at what time;
- with which client;
- which service is being performed;
- when the professional is actively required;
- when a client is in processing time;
- where simultaneous clients exist.

The professional may intentionally manage several clients at the same time.

Overlapping appointments are therefore supported.

The visual representation must remain readable when appointments overlap.

Appointments should be shown side by side rather than visually covering one another.

The operational Agenda primarily represents the professional's occupied time. An Appointment may continue
through unattended processing time, but that interval is not rendered as an occupied Agenda card: the normal
grid remains visible so the professional can see the available time. Later staff-required phases appear again
as separate visible segments of the same Appointment.

---

## 6. Real Service Timing

Beauty services do not always consist of one uninterrupted block of professional work.

A service may contain multiple phases.

Example:

```text
Application
15 min
professional required

Processing
35 min
professional not required

Finish
10 min
professional required
```

The client remains in the appointment throughout all phases.

However, the professional may be available during unattended phases.

This distinction is one of the core product concepts of Souris.

It must not be reduced to a cosmetic UI detail.

---

## 7. Services and Techniques

Souris distinguishes two conceptual service types:

```text
SERVICE
TECHNIQUE
```

A SERVICE represents a simple service where the professional is actively required throughout the service.

A TECHNIQUE represents a service capable of containing multiple phases, including unattended processing phases.

The concept is intentionally generic.

Processing time must not be coupled specifically to hair coloring.

Other beauty professions may also use workflows with active and unattended phases.

---

## 8. Appointment Creation

The intended appointment creation experience is fast and mobile-first.

Conceptually:

```text
choose time
→ choose client
→ choose service(s)
→ review
→ create
```

An appointment may contain multiple services.

The resulting appointment timeline is derived from the ordered services and their ordered phases.

Processing time contributes to elapsed appointment duration.

This elapsed Appointment duration must be distinguished from professional visible occupancy in the Agenda.

---

## 9. Appointment Editing

Existing appointments may eventually support:

- changing date/time;
- adding services;
- removing services;
- reordering services;
- editing processing duration where appropriate;
- changing price where explicitly supported;
- lifecycle actions;
- notes.

Reordering services recalculates the complete timeline.

The user interface must never independently invent timing behavior.

Timing is a domain concern.

---

## 10. Appointment Lifecycle

Appointments may have lifecycle states such as:

```text
SCHEDULED
CONFIRMED
IN_PROGRESS
COMPLETED
CANCELLED
NO_SHOW
```

Cancellation, no-show, and deletion are different concepts.

### Cancellation

The appointment remains part of history.

Future cancellation metadata may include:

```text
cancelledAt
cancelledBy
reason?
```

### No-show

The appointment remains part of history.

Future no-show metadata may include:

```text
recordedAt
```

### Permanent deletion

Permanent deletion is reserved for exceptional cases such as:

- duplicate appointments;
- incorrect entries;
- accidental creation.

Cancellation and no-show must never silently delete historical information.

---

## 11. Clients

Clients are a core Souris entity.

Initial client data may be migrated from an existing address book.

Only identity/contact information should be imported.

Expected initial fields:

```text
id
firstName
lastName?
phone?
email?
```

Existing commercial history is intentionally not migrated.

Souris starts its own activity history from zero.

Do not import legacy:

- visit counts;
- spending;
- average basket;
- last visit;
- no-show history;
- old notes.

Future Souris-created client information may include:

- birth date;
- appointments;
- notes;
- formulas;
- photos;
- purchased products;
- spending statistics;
- visit frequency.

Do not invent missing client information.

---

## 12. Products

Products are a primary product area.

Future capabilities may include:

```text
product catalog
search
categories
brand
barcode
price
stock
retail sale
```

Product management should remain simple.

Souris should not become a full retail or ERP platform.

---

## 13. Prestations & Tarifs

Service catalog management belongs under:

```text
Plus
→ Gestion
→ Prestations & tarifs
```

It is business configuration, not a hidden technical setting.

A service may eventually expose:

```text
name
category
type
price
phases
durations
processing time
active/inactive
```

Future online-booking visibility may also be configurable.

---

## 14. Existing Service Interaction

For an existing service:

```text
read mode
→ Modifier
→ Supprimer
```

After entering edit mode:

```text
Annuler
Enregistrer les modifications
```

The exported design showing:

```text
Fermer
Enregistrer
```

for an existing service is explicitly overridden by:

```text
docs/design/DESIGN_OVERRIDES.md
```

---

## 15. Remises

Simple discounts may eventually be managed under:

```text
Plus
→ Gestion
→ Remises
```

Potential examples include:

- manual discounts;
- birthday discounts;
- student discounts;
- simple commercial offers.

The feature must remain simple.

Do not build an advanced promotion-rule engine without a concrete product need.

---

## 16. Plus

The `Plus` area contains less frequent business management.

Intended direction:

```text
Gestion
- Prestations & tarifs
- Remises
- Réservation en ligne — future

Salon
- Informations du salon
- Horaires & disponibilités
- Équipe — future

Préférences
- Notifications
- Préférences Agenda
- Apparence — only if useful

Compte
- Profil
- Sécurité
- Abonnement — future
- Aide
```

Do not implement future entries merely because they are documented here.

They describe product direction, not current implementation scope.

---

## 17. Onboarding

Onboarding should be short.

Target:

approximately three content screens before authentication.

The experience should introduce:

### Screen 1

```text
Votre journée, plus légère.
```

Introduce Souris and the Agenda.

### Screen 2

```text
Voyez votre temps autrement.
```

Explain active time versus processing time visually.

### Screen 3

```text
Votre activité. Sans la lourdeur.
```

Introduce the essential ecosystem:

- Agenda;
- Clientes;
- Produits.

Primary final CTA:

```text
Commencer
```

Do not build a long tutorial.

---

## 18. Future Customer Self-Booking

Customer self-booking is an intended future capability.

It is not part of the initial implementation.

A customer may eventually select:

```text
service
→ available slot
→ personal information
→ confirmation
```

This capability must use a dedicated booking availability policy.

It must not simply expose every time where the professional could technically force an appointment into the agenda.

---

## 19. Professional Scheduling vs Customer Booking

These are explicitly different concepts.

### Professional scheduling

The professional controls their own agenda.

They may intentionally overlap appointments.

Overlap is non-blocking.

### Customer self-booking

The customer must only be offered slots that the business considers bookable.

Future booking availability may consider:

```text
working hours
staff availability
breaks
time off
existing appointments
service phases
processing time
booking lead time
booking horizon
blocked periods
concurrency policy
```

Do not implement these rules before the dedicated booking phase.

---

## 20. Multi-Staff Direction

The first real-world context contains one professional.

The domain nevertheless preserves concepts such as:

```text
businessId
staffMemberId
clientId
```

This allows future evolution without changing the identity model.

It does not mean Souris should currently implement:

- staff management;
- roles;
- permissions;
- multi-location;
- rooms;
- equipment scheduling.

---

## 21. Product Design

Approved design sources live under:

```text
docs/design/
```

Runtime brand assets live under:

```text
assets/brand/
```

The design language should feel:

- warm;
- light;
- calm;
- premium;
- native;
- slightly playful;
- professional.

Avoid generic SaaS visual language.

---

## 22. Product Decision Rule

When product decisions are ambiguous, prioritize:

```text
clarity
→ speed
→ touch comfort
→ correctness
→ visual elegance
```

If a visually sophisticated interaction makes daily usage slower or harder to understand, simplify it.

Souris exists to make the professional's day lighter.
