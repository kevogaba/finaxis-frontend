# PR 00–01: Dependency Bump and Parity Docs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md)
> first.

**Goal:** Create the stack: layer 00 carries the existing dependency-bump commit; layer 01 carries
the approved spec, contract reference, backend-gaps document, and these plans.

**Architecture:** No code changes. Adopt the existing commit into a stack branch and add a docs layer.

**Tech Stack:** git, `gh stack` 0.1, pnpm.

**Spec:** [`docs/superpowers/specs/2026-09-25-admin-prototype-parity-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md) (§13, §16)

## Global Constraints

See the index. Additionally: do not modify or delete the user's `prod-app` branch.

## Review Focus

Not applicable (no runtime code).

---

### Task 1: Stack layer 00 — dependency bump

**Files:** none (branch only).

**Interfaces:**

- Consumes: `prod-app` (= `main` + commit `6208245 chore(deps): bump up minor and patch dependencies
across the project`).
- Produces: branch `admin-parity/00-deps` at `6208245`, adopted as the bottom of the stack.

- [ ] **Step 1: Configure git for stacking (repository-local)**

```bash
git config rerere.enabled true
git config remote.pushDefault origin
```

- [ ] **Step 2: Create the layer branch at the existing commit and verify ancestry**

```bash
git fetch origin
git branch admin-parity/00-deps prod-app
git log --oneline origin/main..admin-parity/00-deps
```

Expected: exactly one line — `6208245 chore(deps): bump up minor and patch dependencies across the project`.

- [ ] **Step 3: Verify the layer is green**

```bash
git switch admin-parity/00-deps
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test:e2e
```

Expected: all pass. If `pnpm install --frozen-lockfile` fails, stop and report — the bump commit's
lockfile is inconsistent and needs the user's decision.

- [ ] **Step 4: Initialise the stack by adopting the branch**

```bash
gh stack init admin-parity/00-deps
gh stack view --json
```

Expected JSON: `"trunk": "main"`, one branch `admin-parity/00-deps`, `isCurrent: true`.

### Task 2: Stack layer 01 — docs

**Files:**

- Add (already written, currently untracked on `prod-app`'s working tree):
  - `docs/superpowers/specs/2026-09-25-admin-prototype-parity-design.md`
  - `docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`
  - `docs/backend-gaps.md`
  - `docs/superpowers/plans/2026-09-25-admin-parity-00-index.md`
  - `docs/superpowers/plans/2026-09-25-admin-parity-01-deps-and-docs.md`
  - `docs/superpowers/plans/2026-09-25-admin-parity-02-theme.md`
  - `docs/superpowers/plans/2026-09-25-admin-parity-03-fake-api.md`
  - `docs/superpowers/plans/2026-09-25-admin-parity-04-shell.md`
  - `docs/superpowers/plans/2026-09-25-admin-parity-05-context.md`
  - `docs/superpowers/plans/2026-09-25-admin-parity-06-audit.md`
  - `docs/superpowers/plans/2026-09-25-admin-parity-07-business-date.md`

**Interfaces:**

- Consumes: layer 00.
- Produces: branch `admin-parity/01-docs`.

- [ ] **Step 1: Add the layer (untracked files carry over to the new branch)**

```bash
gh stack add admin-parity/01-docs
git status --short
```

Expected: the files above listed as `??`; nothing else modified.

- [ ] **Step 2: Check formatting**

```bash
pnpm exec prettier --check docs/
```

Expected: `All matched files use Prettier code style!`

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-25-admin-prototype-parity-design.md \
  docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md \
  docs/backend-gaps.md \
  docs/superpowers/plans/2026-09-25-admin-parity-*.md
git commit -m "$(cat <<'EOF'
docs: add administration prototype parity design, contract, gaps, and plans

Approved design for reaching the Administration prototype's functionality against the deployed
dev API, the snake_case wire contract it codes against, the backend gaps tracked separately, and
the implementation plans for the first stack layers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify and confirm with the user before publishing**

```bash
pnpm check
gh stack view --json
```

Expected: check passes; stack shows `admin-parity/00-deps` ← `admin-parity/01-docs`. Ask the user
whether to publish now (`gh stack submit --auto` creates draft PRs). Publish only on a yes; then run
`gh stack view --json` and report the PR URLs.
