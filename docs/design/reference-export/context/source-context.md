# Source Project Context

This design-system workspace was created from an existing Open Design project. Treat the copied project files as the primary source evidence for the generated design system.

## Source project

- Source project id: 0f393b62-192f-43bc-9b6c-ff158193ffc2
- Source project name: Web Prototype
- New design-system project id: f265994b-9b81-4ebe-aa14-9d5210f9504e
- New design-system id: user:web-prototype-design-system
- Source skill id: (none)
- Source design system id: user:souris-design-direction

## Source metadata

```json
{
  "kind": "prototype",
  "platform": "auto",
  "platformTargets": [
    "mobile-ios",
    "mobile-android"
  ],
  "nameSource": "prompt"
}
```

## Copied files

- screens/clientes.html
- assets/souris.css
- assets/agenda-view.js
- screens/android-plus.html
- screens/plus.html
- index.html
- screens/onboarding.html
- screens/prestations.html
- screens/android-agenda.html
- assets/souris.js
- screens/agenda.html
- screens/produits.html
- logo-wordmark.png
- logo-mark.png
- logo-lockup.png

## Skipped files

- (none)

## Generation contract

- Read this file before editing design-system outputs.
- Read the copied files directly from the project workspace; they are source evidence, not generated design-system output.
- Preserve high-signal assets, source examples, UI surfaces, copy, tokens, typography, and interaction patterns from the copied project.
- Generate a reusable Open Design design-system package in this same project: DESIGN.md, README.md, SKILL.md, colors_and_type.css, context/provenance, focused preview cards, preserved assets/build/fonts when available, and ui_kits/app/.
- Before final response, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings` and fix every actionable issue.
