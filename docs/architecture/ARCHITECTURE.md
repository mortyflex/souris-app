# Souris — Architecture

## 1. Purpose

This document defines the architectural direction of Souris Native.

The goal is not to build a sophisticated enterprise architecture.

The goal is to keep the codebase:

- understandable;
- testable;
- maintainable;
- easy for one developer and coding agents to navigate;
- compatible with future product evolution.

Architecture should reduce product risk, not create ceremony.

---

# 2. Platform

Souris is a native mobile application built with:

```text
React Native
Expo
TypeScript
Expo Router
npm
```

Phone is the primary platform.

iOS and Android are both target platforms.

Larger displays and foldables may be supported progressively.

---

# 3. Repository Direction

The intended direction is:

```text
src/
├── app/
├── domain/
├── features/
├── shared/
│   ├── ui/
│   ├── icons/
│   └── lib/
├── providers/
└── config/

assets/
docs/
```

This is a direction, not an instruction to create every folder immediately.

Create folders when real code requires them.

---

# 4. Routing

Expo Router owns route definitions under:

```text
src/app/
```

Route files should remain thin.

They may:

- compose feature screens;
- provide route parameters;
- connect navigation.

They should not contain significant business logic.

---

# 5. Domain

Business rules belong under:

```text
src/domain/
```

Examples:

```text
src/domain/appointments/
src/domain/clients/
src/domain/products/
```

Create each area only when its implementation begins.

Domain code is plain TypeScript.

The domain must not depend on:

```text
React
React Native
Expo
Expo Router
Supabase
AsyncStorage
UI libraries
platform APIs
```

---

# 6. Features

Feature-specific application code belongs under:

```text
src/features/
```

Examples may eventually include:

```text
src/features/appointments/
src/features/clients/
src/features/products/
src/features/auth/
```

Feature code may connect:

```text
domain
↕
application state
↕
React Native UI
```

A feature should not become an alternative generic framework.

---

# 7. Shared UI

Generic visual primitives may live under:

```text
src/shared/ui/
```

Examples:

```text
Button
Input
Sheet
SectionHeader
EmptyState
```

Only place a component in `shared/ui` when it is genuinely reusable.

A component used only by Appointment belongs to the Appointment feature.

Do not prematurely generalize components.

---

# 8. Shared Icons

Project-controlled generic icon wrappers or custom brand icons may live under:

```text
src/shared/icons/
```

Do not create unnecessary wrappers around an icon library unless they provide actual consistency or behavior.

---

# 9. Shared Lib

Generic technical helpers may live under:

```text
src/shared/lib/
```

This directory must not become a dumping ground.

Do not create vague global:

```text
utils
helpers
misc
common
services
```

folders.

Prefer clear ownership.

---

# 10. Providers

Application-level providers may eventually live under:

```text
src/providers/
```

Only introduce providers when an actual cross-application concern exists.

Examples may later include:

- authentication;
- persistence client;
- query client;
- theme infrastructure.

Do not create empty provider abstractions in advance.

---

# 11. Config

Static application configuration may eventually live under:

```text
src/config/
```

Only use this directory for genuine application configuration.

Do not move business rules into configuration merely to avoid domain code.

---

# 12. Dependency Direction

Preferred direction:

```text
src/app
  ↓
features
  ↓
domain
```

`shared` supports presentation/technical reuse where appropriate.

The domain must never depend upward on:

```text
features
src/app
React Native UI
```

---

# 13. Design Architecture

Approved design documentation lives under:

```text
docs/design/
```

Original exported prototype material lives under:

```text
docs/design/reference-export/
```

This content is reference material only.

Do NOT import HTML/CSS/JS from the design prototype into runtime application code.

The native application should reproduce design intent using native React Native implementation.

Runtime brand assets live under:

```text
assets/brand/
```

---

# 14. Design Decision Priority

When design sources disagree, follow the priority documented in:

```text
docs/design/DESIGN_OVERRIDES.md
```

The exported HTML prototype is not authoritative over explicit product decisions.

---

# 15. State Management

Start with the simplest state ownership that solves the current feature.

Prefer local/component state when appropriate.

Do not introduce global state libraries merely because the application may grow.

Do not add:

```text
Redux
Zustand
MobX
```

without a concrete need.

React Context is not a substitute for thoughtful state ownership.

---

# 16. Persistence

Persistence is deliberately deferred.

The domain must not be coupled to a future persistence provider.

Do not introduce persistence abstractions before storage requirements are known.

Potential future technologies may include local and remote persistence, but the architecture should not guess prematurely.

---

# 17. Networking

Do not build an API layer before a remote API exists.

When networking eventually appears:

- keep transport concerns outside the domain;
- convert external data at boundaries;
- do not leak remote API shapes throughout the app.

---

# 18. Appointment Domain

Appointment rules are defined in:

```text
docs/domain/APPOINTMENTS.md
```

They must not be duplicated differently inside:

```text
screens
hooks
calendar components
persistence code
```

The UI consumes domain behavior.

The UI does not redefine scheduling.

---

# 19. Future Online Booking

Future online booking must be conceptually separate from manual professional scheduling.

A future architecture may introduce an availability concern such as:

```text
booking availability
```

only when that feature is implemented.

Do not create speculative interfaces or engines now.

The current Appointment model should simply remain compatible with the future concept.

---

# 20. Business / Staff Identity

Keep identifiers explicit:

```text
businessId
staffMemberId
clientId
```

Do not introduce multi-business or multi-team infrastructure merely because the identifiers exist.

Identifiers are cheap future compatibility.

Infrastructure is not.

---

# 21. Dependency Policy

Add a dependency only when the current feature needs it.

Before adding one:

```text
understand requirement
→ check Expo/native capability
→ evaluate dependency
→ install only if justified
```

Avoid installing an entire future stack during project setup.

In particular, do not prematurely add libraries for:

```text
global state
database
calendar
bottom sheets
camera
barcode
forms
networking
animations
```

until their phase requires them.

---

# 22. Native Components

Prefer native React Native behavior.

Do not port web patterns merely because the design export uses them.

Examples:

```text
hover
→ press / gesture state where appropriate

web drawer
→ native sheet or screen when appropriate

CSS media query
→ React Native responsive/layout behavior

DOM drag
→ native gesture implementation
```

Preserve interaction intent, not web implementation.

---

# 23. Styling

The final native styling strategy should be chosen deliberately during the design-system implementation phase.

Do not introduce a styling framework before that decision.

Approved design tokens should eventually become runtime tokens.

Do not manually scatter visual constants across screens.

---

# 24. Dates and Time

Scheduling code must treat dates/times deliberately.

Avoid embedding date arithmetic directly throughout UI components.

Appointment timeline calculation belongs to the Appointment domain.

Formatting for display belongs outside the core domain.

Do not introduce a date library until there is a concrete need.

---

# 25. Testing

Domain logic should be the easiest layer to test.

Prefer unit tests for:

```text
timeline calculations
phase behavior
appointment ordering
snapshot behavior
lifecycle behavior
```

UI tests should focus on user-observable behavior.

Do not duplicate every domain unit test through UI tests.

---

# 26. Quality Command

The project should expose:

```bash
npm run check
```

as its normal complete validation command once tooling is configured.

The exact scripts will be introduced during the quality-foundation phase.

---

# 27. Real Device Validation

Native interaction requires real-device validation.

Automated testing does not replace manual checks for:

```text
gesture behavior
keyboard behavior
safe areas
drag
long press
camera
barcode scanning
navigation transitions
```

The coding agent must provide a manual checklist where relevant.

The human performs the real-device validation.

---

# 28. Architecture Anti-Patterns

Avoid:

```text
premature repository pattern
generic service layer
factory-heavy architecture
dependency injection container
empty interfaces
global state for every feature
business logic in screens
duplicate scheduling calculations
generic utils dumping grounds
premature multi-tenant architecture
premature multi-staff infrastructure
```

Direct readable code is preferred.

---

# 29. Evolution Rule

Architecture may evolve when real requirements appear.

When a feature reveals a concrete need:

```text
identify pressure
→ make smallest useful abstraction
→ test it
→ document meaningful architectural change
```

Do not attempt to predict every future requirement.

---

# 30. Initial Implementation Order

The intended implementation order is approximately:

```text
quality/tooling foundation
→ design-system native foundation
→ Appointment domain
→ native Agenda vertical slice
→ appointment creation/editing
→ clients
→ services/catalog
→ products
→ persistence/auth as justified
→ later product capabilities
```

This sequence may change when explicitly decided.

Do not automatically begin later phases.

---

# 31. Architectural Goal

A developer opening Souris should be able to answer quickly:

```text
Where is the business rule?
Where is the feature UI?
Where is the route?
Where is the shared visual primitive?
Where is the design specification?
```

If answering these questions becomes difficult, the architecture is becoming too complicated.

Souris should remain as simple internally as it aims to feel externally.
