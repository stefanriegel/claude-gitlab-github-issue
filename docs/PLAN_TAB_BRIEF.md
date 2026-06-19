# Design brief — "Plan" tab (notes.md role inside the plugin)

> Written from a planning session in the AI-GM project (2026-06-19). This is the
> STARTING brief for a dedicated plugin session. First step in that session:
> run `/brainstorming` against this brief, produce a spec, then build. Do NOT start
> coding before the design is confirmed.

## Goal (in plain language)

Today the plugin shows ONE tab: a GitHub Issues Kanban board (columns from labels).
Add a SECOND internal tab — **"Plan"** — that does what a hand-written `notes.md`
task-list does today, but visually and without a markdown file:

- See **which phase** of the plan we're in, how far along, and **what's ahead** —
  tasks grouped by phase, in order.
- **Reorder tasks** (drag) to set the work order.
- Easily see/select **bugs as fixes-to-do**.
- Every task **links to its GitHub issue** (opens the existing issue modal).
- An agent installing the plugin in a project **knows how to read the Plan and update
  it** (via the bundled skill) — no hand-edited file, no guessing.

This lets a project **retire the task-list role of `notes.md`**; `notes.md` keeps only
design prose (decisions, dependency rationale, mechanics). The reference content model
for "Plan" is exactly AI-GM's `notes.md` (phases A–H/U/S/L, ordered tasks, `[ ]/[x]`).

## Where state lives (key decision — keep ONE source of truth)

GitHub is the source of truth for task STATE; the plugin adds the VIEW + the one thing
GitHub lacks (ordering):

| Concept | Stored as | Who writes |
|---|---|---|
| **Phase** | GitHub **Milestone** (e.g. "FAZA L") — gives a native progress bar | agent assigns (`gh issue edit --milestone` or plugin route) |
| **Done / not-done** | issue **open/closed** (existing board logic) | existing flow |
| **Status column** | labels `in-progress`/`review`/`blocked` (existing) | existing flow |
| **Priority / bug-select** | labels `bug`, `P0`..`P5` | agent / user |
| **Order within a phase** | **plugin-owned store** — the ONLY new persistence | drag in UI; agent via plugin route |

→ "store in a DB not a file" = the plugin's own structured store, written through the
backend API (never a hand-edited markdown). Recommended: `<projectRoot>/.GitHubBoard/plan.json`
keyed by issue number `{ "<issue#>": { "phase": "<milestone>", "order": <int> } }`
(mirrors the existing `config.service` JSON pattern). SQLite is an option but JSON matches
the current plugin and is enough; decide in brainstorm.

**Why GitHub for done/phase, plugin only for order:** avoids a second "done" truth that
drifts from GitHub. The existing board already reads GitHub; Plan reuses it and adds order.

## Plugin contract (must respect — from CLAUDE.md)

- `manifest.json` declares one tab (`slot:"tab"`). The "second tab" is an **internal tab
  switcher inside the plugin's own UI** (`App.tsx`): `[ Issues Board | Plan ]`. The plugin
  still contributes a single claudecodeui tab.
- **`dist/` MUST be committed** — claudecodeui runs the committed bundles. After any code
  change: `npm run build` → commit `dist/frontend.js` + `dist/backend.js`. Skipping this =
  RPC 503 in the host UI.
- Frontend: React 18 + TS, **classic JSX runtime** (do not change — host React conflict).
  Mount API: `api.rpc(method, path, body?)`, `api.context`, `api.onContextChange(cb)`.
- Backend: Node HTTP server, must print `{"ready":true,"port":N}` within 10s. Add routes
  alongside existing `/config`, `/issues`, `/ai-prioritize`.

## Likely components to build (confirm in brainstorm)

**Backend** (`src/backend/`):
- `plan.service.ts` — read/write `.GitHubBoard/plan.json` (phase+order per issue).
- `server.ts` routes: `GET /plan` (merge GitHub issues + milestones + stored order →
  phase-grouped ordered list), `PUT /plan/order` (persist reorder), `PUT /plan/phase`
  (assign milestone). Reuse `github.service.ts` for issue/milestone calls.

**Frontend** (`src/frontend/`):
- Tab switcher in `App.tsx` (`Issues Board` | `Plan`).
- `PlanView.tsx` — milestone sections with progress, ordered cards, **drag-reorder**
  (pick a lib or simple up/down — decide in brainstorm), each card opens the existing
  `GithubIssueModal`.
- Reuse `priorityUtils`, `types.ts`, `styles.css` (`cgi-` prefix).

**Skill** (`skill/SKILL.md`):
- Extend so an installed agent knows: how to read the Plan (`GET /plan` shape), how to
  set order/phase, the convention (Milestone=phase, labels=priority/bug). This is the
  "agent knows what to reference" mechanism (same idea as mass-implement's config/skill).

## Open questions for the brainstorm

1. Drag library vs simple up/down buttons (non-coder owner — reliability > fancy).
2. `plan.json` vs SQLite for the order store.
3. How the agent reorders — dedicated plugin route vs `gh` + a convention.
4. Milestone bootstrap: a one-shot to create Milestones from an existing `notes.md`'s
   phases and assign open issues (migration helper).
5. Does "Plan" need a free-form note area (design prose) or stay pure task-list (prose
   stays in repo markdown)? Lean: pure task-list; prose stays in `notes.md`/`game_mechanics`.

## Work hygiene (so nothing mixes with other projects)

- This work lives ONLY in repo `szmidtpiotr/claude-github-issue` (this folder). The AI-GM
  game repo is separate and untouched.
- Branch: **`feat/plan-tab`** (already created). Never commit straight to `main`; merge to
  `main` only when built + verified + approved.
- After code changes: `npm run build`, commit `dist/`, then push the branch.
- Verify in a running claudecodeui instance (install/reload the plugin, open the Plan tab).

## Process

1. `/brainstorming` against this brief → confirm decisions (open questions above) → spec.
2. Build incrementally (backend store + route first, then UI tab, then drag, then skill).
3. Verify the Plan tab live in claudecodeui; commit `dist/` each step.
4. File an implementation-record issue per the plugin repo's conventions.
