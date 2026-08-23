# Souris — Agent Workflow

This file defines the working procedure for coding agents operating in the Souris repository.

Always read `CLAUDE.md` first.

`CLAUDE.md` contains the permanent product, architecture, domain, scope, testing, dependency, and Git rules.

This file describes how to execute work inside those rules.

---

# 1. Before Every Task

Before modifying code:

1. Read `CLAUDE.md`.
2. Read this `AGENTS.md`.
3. Inspect the live repository.
4. Read documentation relevant to the requested feature.
5. Inspect existing implementation related to the task.
6. Inspect existing tests related to the task.
7. Identify the smallest coherent change necessary.

Do not assume another Souris repository or previous PWA implementation exists here.

The current repository is the implementation source of truth.

---

# 2. Documentation

Project documentation may progressively exist under:

```text
docs/
```

Expected categories may include:

```text
docs/
├── product/
├── domain/
├── architecture/
└── design/
```

Do not require documents that have not yet been created.

When a relevant document exists, read it before implementing the corresponding feature.

Approved documentation must not be silently contradicted.

If code and documentation conflict, report the conflict unless the task explicitly asks you to resolve it.

---

# 3. Skills

Project skills may exist under:

```text
.claude/skills/
```

Use relevant skills when they improve the current task.

Do not load or apply unrelated skills automatically.

A skill never overrides:

- explicit task instructions;
- `CLAUDE.md`;
- `AGENTS.md`;
- approved project documentation;
- existing Souris architecture.

Do not introduce new architecture or dependencies merely because a skill suggests them.

---

# 4. Implementation Workflow

For an implementation task, follow:

```text
inspect
→ understand
→ implement
→ test
→ validate
→ review diff
→ summarize
```

Do not stop after inspection.

Do not return only a proposed implementation plan if implementation was requested.

Do not request confirmation unless a genuinely destructive or ambiguous decision prevents safe progress.

---

# 5. Scope

Implement only the requested phase.

Do not:

- begin the next feature;
- add speculative capabilities;
- refactor unrelated modules;
- redesign unrelated screens;
- install future dependencies;
- solve future architecture problems prematurely.

If you discover an unrelated concern:

- leave it unchanged;
- mention it under `Points to review` if meaningful.

---

# 6. Architecture

Respect the dependency direction:

```text
app
 ↓
features
 ↓
domain
```

Business logic belongs in `src/domain`.

Feature-specific orchestration belongs in `src/features`.

Generic reusable visual primitives may belong in `src/shared/ui`.

Generic technical infrastructure may belong in `src/shared/lib`.

Do not create generic architectural buckets without a real need.

---

# 7. Domain Work

When working on domain logic:

- keep it plain TypeScript;
- avoid React imports;
- avoid React Native imports;
- avoid Expo imports;
- avoid persistence dependencies;
- prefer pure functions;
- write behavior-focused tests.

Do not move domain rules into UI components for convenience.

---

# 8. Appointment Work — Critical

Appointment behavior is business-critical.

Before changing appointment code, verify the relevant rules from `CLAUDE.md`.

In particular, preserve:

- ordered Appointment items;
- ordered phases;
- SERVICE vs TECHNIQUE;
- `requiresStaff`;
- processing / unattended time;
- timeline calculation;
- timeline recalculation after reorder;
- historical service snapshots;
- overlapping appointments allowed;
- appointment lifecycle;
- cancellation/no-show history.

Never simplify appointment data into only:

```text
start + duration
```

for UI convenience.

---

# 9. Processing Time

Processing / unattended phases are central to Souris.

A phase with:

```text
requiresStaff = false
```

still belongs to the appointment timeline.

It means the professional does not need to remain actively engaged during that phase.

Do not delete, flatten, merge, or visually treat this concept as irrelevant.

Do not assume processing time exists only in hair-color services.

---

# 10. Overlap Rule

Professional scheduling allows overlapping appointments.

Do not introduce blocking behavior merely because time ranges intersect.

Do not conflate:

```text
overlap detection
```

with:

```text
permission to schedule
```

Future online booking may use a separate availability policy.

Do not implement that future policy unless explicitly requested.

---

# 11. Future Online Booking

When designing or modifying scheduling code, avoid assumptions that would make future customer self-booking unnecessarily difficult.

However:

do not build booking availability infrastructure speculatively.

Do not introduce now:

- booking engines;
- availability repositories;
- slot providers;
- resource managers;
- concurrency settings;
- public booking APIs;

unless a dedicated phase requests them.

---

# 12. Client Import Rule

Legacy clients represent only the initial address book.

When legacy data is introduced, preserve only approved identity/contact information.

Never import legacy:

- visits;
- total spend;
- average basket;
- last visit;
- notes;
- no-show history.

Souris-generated history begins from zero.

Do not invent missing values.

---

# 13. Dependencies

Before adding a dependency:

1. confirm the current feature actually requires it;
2. check whether Expo / React Native already provides an appropriate solution;
3. keep the dependency addition scoped;
4. document why it was added.

Do not install libraries merely because they may be useful later.

npm only.

Never use Bun or Yarn.

---

# 14. Native UI

When implementing UI:

- think native first;
- respect safe areas;
- respect mobile keyboards;
- use appropriate touch targets;
- avoid hover assumptions;
- support actual touch interaction.

Do not blindly convert web UI patterns into React Native.

Use approved design documentation once available.

Do not invent a parallel design system.

---

# 15. Design References

Approved design documentation will eventually be stored under:

```text
docs/design/
```

Visual design references will eventually be stored under:

```text
docs/design/references/
```

Runtime brand assets may live separately under:

```text
assets/brand/
```

Do not confuse visual references with application runtime assets.

If design references exist for the current feature, inspect them before implementing UI.

---

# 16. Testing

Every business-critical behavior should have appropriate tests.

Prioritize tests for:

- domain calculations;
- appointment phases;
- processing time;
- ordering;
- lifecycle;
- overlap behavior;
- data transformations.

Avoid tests that only mirror implementation structure.

Do not weaken assertions simply to make tests pass.

Do not silently delete existing coverage.

---

# 17. Validation

Once `npm run check` has been configured, normal final validation is:

```bash
npm run check
```

Do not unnecessarily run:

```text
test
lint
typecheck
check
```

all separately when `check` already covers them.

Use targeted commands separately only to diagnose a real failure.

If validation fails:

```text
diagnose
→ fix
→ npm run check
```

Continue until green or until a genuine blocker is identified.

---

# 18. Real Device Testing

Some mobile behaviors cannot be meaningfully validated through automated tests alone.

When a task affects:

- gestures;
- long press;
- drag;
- keyboard behavior;
- bottom sheets;
- safe areas;
- camera;
- barcode scanning;
- navigation;
- device-specific interaction;

include a precise real-device checklist in the final response.

Never claim a real-device test was performed unless it actually was.

---

# 19. Diff Review

Before returning the final response:

review your own diff.

Check for:

- unrelated modifications;
- unnecessary dependencies;
- accidental architecture changes;
- dead code;
- duplicated business logic;
- weakened tests;
- debug output;
- temporary files;
- accidental generated artifacts.

Keep the diff focused.

---

# 20. Git

Do NOT commit.

Do NOT push.

Unless the user explicitly asks the agent to do so.

The normal workflow is:

```text
agent implements
→ agent validates
→ agent summarizes
→ human reviews
→ human commits
```

Use Conventional Commit conventions only when recommending a commit message.

---

# 21. Final Response Format

After implementation, immediately return:

```text
## Summary
- what was implemented
- key behavior

## Architecture
- important placement / decisions

## Files created
- ...

## Files modified
- ...

## Files removed
- ...

## Tests
- tests added
- tests updated
- relevant coverage

## Validation

npm run check
- tests: ...
- lint: ...
- typecheck: ...
- other: ...

## Manual validation
- only when relevant

## Git diff
<git diff --stat>

## Points to review
- none
```

If there is a genuine reservation, list it under:

```text
## Points to review
```

Do not invent reservations for completeness.

---

# 22. Behavioral Rule

Do not stop after inspection.

Do not ask for confirmation unless blocked by a genuinely destructive or ambiguous decision.

Complete implementation, run the required validation, then immediately return the requested final summary.

Do not wait for another user message to provide the summary.

Do not begin the next phase.

Do not commit.

Do not push.
