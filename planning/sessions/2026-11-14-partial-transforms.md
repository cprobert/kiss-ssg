---
branch: feat/partial-transforms
base: main
status: open
opened: 2026-11-14
scope: lib/partials.js, lib/config.js, lib/kiss.js, lib/handlebars-helpers.js, test/**, AIKB/**, GUIDE.md, llms.txt, README.md, types/**, CHANGELOG.md, package.json, package-lock.json, plugins/**, examples/*/src/partials/**, planning/**, src/**, .claude-plugin/**
---

# Session — 2026-11-14: Partial transforms (2.16)

## Intent (captured at /branch-open)

**Objective:** Turn `registerPartials`' fixed passes into a table of transforms keyed by extension. In that table `.md` renders per call, after Handlebars, so `{{link "x"}}` and `{{> "nav"}}` work in a `.md` partial, and a site can add its own transforms through `config.transforms`. This is Phase 1's first release (2.16) of [the roadmap to 3.0](../plans/2026-11-10-roadmap-to-3.0.md), built from [the spec](../specs/2026-10-24-partial-transforms-design.md).

**Success criteria:**

- [ ] **The `.md` defect is fixed.** `{{link "id"}}` and `{{> "nav"}}` inside a `.md` partial render correctly. A new integration test shows this, and it was seen red against `main` with `scripts/red-first.mjs`.
- [ ] **Collisions fail the build.** `foo.md` + `foo.hbs` fails the build, naming both files. The flipped test (`test/unit/partials.test.js:78`) is seen red first.
- [ ] **A site transform works.** A site's own transform (e.g. `adoc`) with an async `setup` renders, and its `render` receives `{ name, file, page, context, hash }`.
- [ ] **A failed `setup` is reported.** It is a named failure in the report, a page calling a partial of that extension fails, and the build neither hangs nor passes silently.
- [ ] **`.txt` and layouts are unchanged.** `.txt` stays literal and layouts stay `.hbs`; the existing tests stay green.
- [ ] **Scoped rebuilds still work.** A watch rebuild still re-renders a page when its `.md` partial or a custom-extension partial changes.
- [ ] **Measured before memoising.** `npm run bench` runs before and after, and the memoising decision is made from those numbers and recorded.
- [ ] **The docs are current.**
  - GUIDE (the partials section, `config.markdown` and a new `config.transforms` section), the `llms.txt` index line, `AIKB/partials.md`, `AIKB/config.md`, `AIKB/kiss.md`, README and `types/` are all updated, and the `.md` trap text is gone wherever it appeared.
  - The example prose is corrected (seven `newsletter.md`, `sourcing-note.md` and `5-helpers/…/tasting.md`), and a `CONTRADICTIONS` row bans the old sentence.
- [ ] **Fleet:** `node scripts/fleet-check.mjs <site> --base main` passes on at least one real site that has `.md` partials, with every difference explained.
- [ ] **Clean room:** a fresh agent, given only the packed tarball and the shipped docs, builds a site with a `.md` partial that uses `{{link}}`, and the site passes `kiss-ssg check`. It reports every place it had to guess.
- [ ] **Codex:** it reviewed the first engine slice (at a pulse) and the close, and no finding inside the threat model is open.
- [ ] **Gates:** `npm run gates` is green.

**Non-goals / out of scope:**

- the `{{#transform}}` block helper;
- transforms for layouts;
- Markdown pages (views);
- markdown-it (2.17);
- the freeze and wiring the budgets into the gates (later in Phase 1);
- changing the `{{markdown}}` helper;
- protecting Handlebars-inserted HTML under `markdown.html: false`.

**Impact surface:** public API — a new config key (`config.transforms`), plus three changes a site must adapt to: `.md` partials now render after Handlebars, name collisions now fail, and under `html: false` helper HTML is escaped. That makes it a minor (2.16.0) with a `### Upgrading` note.

**Expected shape:** planned — the spec, plus a re-check of it against 2.15.1, maps the route.

**Assumptions:**

- _Measured_ (2026-11-13, an Explore re-check of the spec against `lib/` at `68633b4`):
  - **The spec's engine description holds; the line numbers moved.**
    - Remarkable runs at registration: `lib/partials.js:19`.
    - `literalPartial`: `:52`. `tracingPartial`: `:74`. `partialNameFor`: `:98`. `registerPartials`: `:129-144`.
    - The `{{markdown}}` helper: `lib/handlebars-helpers.js:104`.
    - `DEFAULT_MARKDOWN`: `lib/config.js:321`.
    - The watcher's partial branch: `lib/rebuild.js:471`.
  - `partialNameFor` and the partial branch of `rebuild.js` do not filter by extension.
  - Unknown config keys pass silently through to views (`config.js:204`), so `transforms` needs explicit validation.
  - `_promises` doubles as `generate()`'s data array. An async `setup` therefore follows the `_helpersReady` pattern (`kiss.js:393, 848, 957-1011, 1516`) and is never pushed onto `_promises`.
  - No shipped `.md` partial relies on Markdown running first. The only interpolation, `examples/4-…/sourcing.md`'s `**{{model.buyer}}**`, inserts plain names.
  - The spec's touch list missed `AIKB/kiss.md:86` and `examples/5-helpers/src/partials/tasting.md`.
- _Inferred_ (to check in slice 1):
  - `lib/watcher.js`'s globs do not filter partial extensions.
  - A partial function's string output is inserted raw, so `render` needs no `SafeString`.
  - Flipping the order changes no fleet site's bytes, because no fleet `.md` partial interpolates Markdown-significant text. The fleet check will show whether this holds.

**Delegation convention:** none: one session. The operator reviews the diff, and no agent commits.

**Independent review:** Codex, on the first engine slice at a `/branch-pulse` and again at `/branch-close`. The loop is capped at three rounds; after that Claude asks before running a fourth. The threat model is set when the first round starts.

**Decisions taken at open (operator, 2026-11-13):**

- **Ship the full spec, `config.transforms` included.** It lands the registry before the freeze, rather than adding API during it.
- **No block helper.**
- **`html: false` is documented, not engineered around.** Under `markdown.html: false`, a `.md` partial's helper output is escaped. The upgrade note and GUIDE point such a partial to `.hbs` with `{{#markdown}}`.
- **The work is done here, not in a worktree.**

**Read-back (2026-11-13):**

- I skimmed the Feedback of all 68 logs.
- About ten lessons recur in three or more logs and are not retired, among them "a fix is a change: prove it", the red-first follow-ups, and worktree hygiene. That meets `/memory-consolidate`'s trigger, so I recommend running it between branches; it is not run here.
- **Two recurring pieces of work were scheduled by the operator as next branches**, in an order still to choose:
  - the watch-test flake, which is in five logs;
  - the docs backlog from clean rooms and the corpse collector, which is in five logs, together with issue #90.
- **Recording what the first `/kiss-publish` saw** recurs in two logs. That belongs to the 2.15.1 release, which `package.json` holds but npm does not yet serve (npm serves 2.15.0), not to this branch.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
