<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Finaxis frontend rules

- Run `pnpm check` after any implementation change; run `pnpm test:e2e` when the change touches
  rendered UI. Do not consider a change done until both are clean.
- Do not bypass TypeScript or ESLint errors (no `@ts-ignore`, `@ts-nocheck`, unsafe `any`, or
  disabling rules to silence a warning). Fix the underlying issue.
- Do not add another UI/component framework (Chakra, Ant Design, shadcn/ui, styled-components,
  Bootstrap, etc.) or a global state library. MUI + Tailwind (layout only) is the whole stack.
- Use MUI theme tokens instead of raw colors — extend `theme/create-finaxis-theme.ts` /
  `theme/theme.types.ts` rather than hardcoding hex/rgba values in components.
- Tailwind is for layout composition only (flex, grid, gap, width/height, positioning,
  visibility). It must never override MUI component internals; MUI owns component visuals,
  typography, and semantic color.
- Server Components are the default. Add `'use client'` only where interaction, browser APIs, or
  MUI hooks (e.g. `useColorScheme`) require it — keep client boundaries as narrow as possible.
- Never pass a function prop (including `sx={(theme) => ...}` callbacks or `component={Link}`)
  from a Server Component into a Client Component — Next.js 16 rejects it. Use plain-object `sx`
  with dotted palette-path strings (e.g. `sx={{ color: 'brand.onNavy' }}`), and route `next/link`
  through `components/navigation/next-link.tsx` when a Server Component needs to pass it as a
  `component` prop.
- This is Material UI v9: some props renamed since earlier majors (e.g. `Stack`'s
  `alignItems`/`justifyContent`/`flexWrap` and `Checkbox`/`Radio`'s `inputRef`/`inputProps` moved
  to `sx` / `slotProps.input`). Check `node_modules/@mui/material/package.json` version and the
  installed major's migration guide before assuming an older API shape.
- Paginate any future data-listing API/UI — this codebase has none yet, but don't introduce an
  unpaginated list endpoint or view.
- Maintain accessibility: one `h1` per page, visible focus rings, labelled form fields, errors
  associated with their fields, `prefers-reduced-motion` respected, no serious/critical axe
  violations.
- Update `README.md` (and this file) when the architecture changes — e.g. swapping the mock auth
  module for a real identity provider, or changing the MUI/Tailwind boundary.
