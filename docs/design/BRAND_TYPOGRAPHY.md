# BeautIzzy — Brand Typography

The long-term typographic identity of BeautIzzy's branded surfaces: two families, a small set of
semantic roles, and the rules that keep them consistent.

Implementation: `web/src/styles/typography.css` (tokens and roles), `web/src/app/layout.tsx`
(font loading). Adopted November 2026.

---

## 1. Scope

| Surface | Typography |
| --- | --- |
| Public booking pages (`web/`, `/r/<slug>`, the booking flow) | **Brand typography** (this document) |
| Marketing website and landing pages (`web/`) | **Brand typography** |
| Future branded surfaces (e.g. a share image, a printed card) | **Brand typography**, when that surface is built |
| Native application UI | **Plus Jakarta Sans** — unchanged (`DESIGN_OVERRIDES.md` §12) |
| Native preview of the public page (`BookingProfilePreview`) | Bodoni Moda for the name and monogram only (§8) |

The native application's global typography is not part of this system. Never load Bodoni Moda or
Manrope into `src/shared/ui/theme/`, and never use them in a native screen other than the
public-page preview.

The BeautIzzy logo and wordmark are images (`assets/brand/`, `web/public/brand/`). They are never
recomposed in either family.

---

## 2. Families

Two families. There is no third — no other serif, no script, no monospace, no system-font
substitute chosen on purpose.

### Bodoni Moda — display

A high-contrast Didone with an optical-size axis: refined, editorial, of the beauty and fashion
world. It carries **identity and emphasis**, never information that has to be scanned.

- Weights: **500** (display, names, headlines), **600** (titles, the smallest display size).
  Nothing lighter — its hairlines are already the finest strokes on the page. Nothing heavier.
- Italic: only for one emphasized word inside a display or headline (`<em>`), e.g. « Votre journée,
  *simplement* organisée. » Never a whole italic sentence.
- Never below 20px. Never for body copy, labels, buttons, prices or times.

### Manrope — text and interface

A contemporary, open grotesque. It carries **everything that is read, scanned or acted on**:
paragraphs, navigation, service names, prices, times, labels, form fields, buttons, messages.

| Weight | Use |
| --- | --- |
| 400 | Body copy, leads, descriptions |
| 500 | Supporting information, metadata, links inside text |
| 600 | Buttons, labels, service names, figures, notice titles |
| 700 | Rare, selected strong emphasis only |

Manrope has no italic: emphasis in text is weight (600), never a slant. Font synthesis is
disabled, so an `<em>` in Manrope copy renders upright.

---

## 3. Roles

Always use a role (`type-*` utility class), never a free family + size + weight combination. A
role sets family, size, weight, line height, tracking and — where relevant — wrapping and numerals.
Colour, alignment and spacing stay with the component.

Sizes are fluid: linear from a 320px to a 1280px viewport, rem-based (they follow the reader's font
size and zoom).

### Display — Bodoni Moda

| Role | Size | Weight | Line height | Use |
| --- | --- | --- | --- | --- |
| `type-display` | 36 → 64 | 500 | 1.04 | The hero headline of a page that introduces something (marketing hero) |
| `type-name` | 36 → 56 | 500 | 1.08 | The professional's name in the profile hero (≤ 24 characters) |
| `type-name-medium` | 30 → 44 | 500 | 1.10 | … 25 to 48 characters |
| `type-name-long` | 24 → 32 | 500 | 1.14 | … longer (up to the 120-character limit) |
| `type-headline` | 28 → 40 | 500 | 1.12 | Page and section headings, notices, editorial statements |
| `type-title` | 20 → 24 | 600 | 1.20 | Supporting headings inside a page (« Prestation », « Date ») |

Display roles balance their lines (`text-wrap: balance`). Name roles also break an unbreakable
word rather than overflow (`overflow-wrap: anywhere`).

### Text — Manrope

| Role | Size | Weight | Line height | Use |
| --- | --- | --- | --- | --- |
| `type-lead` | 17 → 19 | 400 | 1.65 | The paragraph that introduces a page or a section |
| `type-body` | 16 → 17 | 400 | 1.70 | Running text: descriptions, explanations, contact details |
| `type-body-small` | 15 | 400 | 1.60 | Secondary paragraphs: notes, notice bodies, footnotes, footer |
| `type-subtitle` | 16 → 17 | 600 | 1.35 | A name inside a list or a card: service, notice title, feature |
| `type-label` | 15 | 600 | 1.25 | Buttons (large: 16), choices, field labels, navigation |
| `type-figure` | 15 | 600 | 1.25 | Prices, times, counts — tabular, lining numerals |
| `type-meta` | 13 → 14 | 500 | 1.45 | Small supporting information: a duration, a field caption, a detail label |
| `type-caption` | 12 | 600 | 1.30 | Badges and tags — the smallest text on the site |

Body text never goes below 15px; nothing goes below 12px.

### Adding a role

Add one only when a screen needs a level the table cannot express — not for a one-off size. A new
role goes in `typography.css` with its comment and in this table.

---

## 4. Optical sizing

Bodoni Moda is loaded with its optical-size axis (`opsz` 6–96): the larger the text, the finer and
more contrasted its drawing.

- **2× screens and denser** (phones, tablets, Retina displays): automatic optical sizing — the
  optical size follows the font size, for the most refined hairlines.
- **Standard-density (1×) screens**: above ~30px the automatic cut's hairlines fall below a pixel
  and break apart (« réser vation »). Each display role draws a fixed, sturdier cut instead:
  `--bz-opsz-display` 28 (display, names), `--bz-opsz-headline` 24 (headlines, long names),
  `--bz-opsz-title` 18 (titles).

Never set `font-variation-settings` on a component: the roles own it.

---

## 5. Numerals

Anything that is compared or changes — prices, times, durations, dates in a choice — uses tabular
numerals: `type-figure`, or `tabular-nums` next to `type-meta` / `type-label`. Running text keeps
proportional numerals.

---

## 6. Names

A professional's name is up to 120 characters. It steps down with its length so that a short name
reads as a hero and a long one stays a compact block — never a narrow column of large words:

```text
≤ 24 characters   type-name          « Atelier Éléonore »
≤ 48 characters   type-name-medium   « Institut de beauté Cœur d’Ébène »
longer            type-name-long
```

One rule decides: `profileNameRole` (`web/src/components/booking/profile-name.ts`), counting
characters after NFC normalization. The native preview sizes its name from its measured width
instead (§8).

---

## 7. Art direction

Do:

- build hierarchy from scale, contrast between the two families, weight and whitespace;
- keep Bodoni Moda for few, short, meaningful lines: a name, a headline, a statement;
- let Manrope do the work everywhere else;
- write labels in sentence case (« Téléphone », not « TÉLÉPHONE »).

Don't:

- set Bodoni Moda everywhere, or for anything functional (buttons, prices, times, form fields);
- use Bodoni Moda below 20px or lighter than 500;
- add bold for emphasis that scale or placement already gives;
- use uppercase labels or wide letter spacing as decoration — the web system has no uppercase
  role;
- introduce a third family, a decorative face, or a heavier Manrope weight than 700;
- compose the logo or the wordmark in type.

---

## 8. Native preview of the public page

`src/features/online-booking/settings/BookingProfilePreview.tsx` mirrors the web profile hero, so
the professional sees her page as clients will.

- It loads `BodoniModa_500Medium` (`@expo-google-fonts/bodoni-moda`) for the name and the monogram,
  in that component only. Until the file is loaded the platform serif stands in.
- The name is a preview inside a settings screen, so it is smaller than the web hero, and it is
  always shown whole — no truncation, no line limit. One rule sizes it, `layoutPreviewName`
  (`src/features/online-booking/settings/preview-name-layout.ts`), from the panel's measured width
  and Bodoni Moda's real glyph advances:

  ```text
  one line             30 → 24pt   when the name fits on one line there
  two balanced lines   26 → 22pt
  three balanced lines 24 → 20pt
  beyond               20pt, as many balanced lines as needed
  ```

  Balanced: the lines are as even as the words allow, never a lone last word. Text size follows
  the reader's setting up to ×1.2.
- Leading 1.18em, with a top inset from the font's metrics: Bodoni Moda's line box is 1.525em, and
  under a tighter line height React Native on iOS cuts the first line from the top — the accent of
  « É » was clipped. The inset (≈ 0.24em) gives it back without moving the name.
- The monogram's line box is the font's own (61pt for 40pt), so an accented initial keeps its accent.
- The description stays in the native UI family (Plus Jakarta Sans), as all native text does.
- React Native has no `text-wrap: balance` and cannot drive a variable font's optical size: the
  balanced breaks are computed, and the Expo package's static 500 is the text optical size, so the
  native name has slightly sturdier hairlines than the web hero on a phone. Accepted.

---

## 9. Loading and language support

- Both families are self-hosted by `next/font/google` at build time: no request to a font CDN at
  runtime. Each is one variable file.
- The `latin` subset is preloaded (Manrope ≈ 24 KB, Bodoni Moda ≈ 46 KB). It covers French in full:
  é è ê ë à â î ï ô û ù ç, œ Œ, « », €, and accented capitals (É È Ê À Ç). Rarer accents
  (`latin-ext`, e.g. Ÿ, Ł) download only on a page that uses them.
- The Bodoni Moda italic is declared but not preloaded: it downloads only on a page that sets an
  emphasized display word.
- Fallbacks are metric-adjusted by `next/font` (Times New Roman for Bodoni Moda, Arial for
  Manrope), then `ui-serif, Georgia, serif` and `ui-sans-serif, system-ui, sans-serif`.
