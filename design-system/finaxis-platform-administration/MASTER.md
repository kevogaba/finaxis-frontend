# Design System Master File — Finaxis Administration

> **LOGIC:** When building a specific page, first check `design-system/finaxis-platform-administration/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. Otherwise follow the rules below.
> Source of truth: the Administration prototype (`DESIGN_SYSTEM.md`, `styles.css`) as captured in
> `docs/superpowers/specs/2026-09-25-admin-prototype-parity-design.md` §7. Tokens live in
> `theme/tokens.ts`; components consume palette paths, never raw colours.

**Project:** Finaxis Administration (tenant Administration + Platform Administration)
**Category:** Core banking operations console — dense, governed, audit-first
**Design dials:** Variance 3/10 (quiet, consistent) · Motion 2/10 (functional only) · Density 9/10

## Brand

- Dependable before decorative. Navy anchors navigation and trust; cobalt is the action colour; teal
  is reserved for healthy/successful states.
- Mark: two interlocking strokes shading deep blue → teal (`components/branding/finaxis-logo.tsx`).
  Gradient stops from `MARK_GRADIENT` in `theme/tokens.ts`.
  Tagline: People · Savings · Progress.

## Colour tokens

| Role                      | Light                                                     | Dark                                    |
| ------------------------- | --------------------------------------------------------- | --------------------------------------- |
| Page background           | `#F5F8FC`                                                 | `#081322`                               |
| Surface (paper)           | `#FFFFFF`                                                 | `#101E30`                               |
| Surface 2 / 3             | `#F0F4F9` / `#E8EEF6`                                     | `#15263B` / `#1B3048`                   |
| Text / muted              | `#0A1B3C` / `#526681`                                     | `#F3F7FC` / `#A7B8CC`                   |
| Divider                   | `#D5DFEB`                                                 | `#2A405A`                               |
| Primary action            | `#1F5FE5` (hover `#164BC5`)                               | `#78A5FF` (hover `#5B8DEF`, dark text)  |
| Success / warning / error | `#007A6E` / `#B95100` / `#B4232E`                         | `#3DD9B8` / `#FFB454` / `#FF8A8A`       |
| Soft status backgrounds   | `#E8F7F3` `#FFF4E8` `#FFF0F1` `#EDF4FF`                   | `#0D352F` `#3E2917` `#3C1D25` `#172D4D` |
| Brand rail (both schemes) | `#071A36` → `#0A2347`, raised `#123663`, marker `#75A2FF` | same                                    |
| Focus                     | `#2F6DF2`                                                 | `#78A5FF`                               |

Rules: every text pair meets 4.5:1 (enforced by `theme/tokens.test.ts`); status text only on paper,
page background, or its own soft background; never convey status by colour alone (chips carry
labels).

## Typography

Inter with tabular numerals. Page title 28 px/700 (`h1`); record title 25 px (`h2`); section title
17 px (`h5` rendered as `h2`/`h3`); body 13 px; dense cells 12.5 px; captions 11 px; eyebrow 12 px/650
(`overline`, no uppercase); buttons 13 px/700, sentence case.

## Density and layout

- 4 px base unit, 8 px rhythm. App bar 68 px; rail 232 px expanded / 76 px collapsed.
- Table header 39 px; rows 44 px (single line) / ~56 px (two lines); controls 40 px (small 36 px);
  icon buttons 42 px; tabs 48 px.
- Radii: 6 px controls and surfaces, 10 px menus/popovers, 14 px dialogs; pills fully rounded.
- Borders carry grouping; shadows only on overlays. Record pages max-width 1480 px.

## Component anatomy (MUI)

- Status badge: `Chip variant="soft" size="small" color=…` via `StatusChip`.
- Primary action: `Button variant="contained"`; secondary: `variant="outlined"` (neutral text on
  paper); destructive: `variant="outlined" color="error"` (danger soft background).
- Forms: labels above fields (theme default), helper text below, errors on the field plus an error
  summary `Alert`; wizards use `Stepper` with numbered cells and a sticky action bar.
- Lists: `Paper` → toolbar (search, filters, clear, count) → sticky-header `Table` →
  `TablePagination` (10–50 rows). Record pages: back link → hero `Paper` → link `Tabs` → panels.
- Overlays: `Dialog` for decisions (reason required where the API requires it), right `Drawer` for
  assignment and detail panels, `Snackbar` + `Alert` for outcomes.

## Interaction principles

- The current workspace, organisation/branch (or All branches), and business date are always
  visible in the app bar.
- A person can hold many roles — identity shows name and email, never a single role.
- High-risk actions use explicit review steps, reasons, and permanence warnings; maker-checker is
  explained, not hidden.
- Motion is functional: 150–200 ms transitions, disabled under `prefers-reduced-motion`.

## Anti-patterns

- ❌ Mock or sample data in any UI; unavailable features are absent, not faked.
- ❌ Raw colours in components; Tailwind utilities overriding MUI visuals.
- ❌ Emojis as icons (use `@mui/icons-material` Outlined set).
- ❌ Unbounded lists; client-side pagination of server data.
- ❌ Layout-shifting hover effects; invisible focus; colour-only status.

## Pre-delivery checklist

- [ ] Tokens only (no raw colours); MUI visuals, Tailwind layout only
- [ ] One `h1`; labelled controls; errors tied to fields; visible focus
- [ ] Light and dark schemes checked; no serious/critical axe violations
- [ ] 375 / 768 / 1024 / 1440 px: no horizontal page scroll; long values truncate with a tooltip
- [ ] Loading, empty, error (with request reference), and forbidden states designed
- [ ] `prefers-reduced-motion` respected
