---
branch: feat/incremental-rebuild
base: main
status: open
opened: 2026-09-08
---

# Session — 2026-09-08: Dependency-aware incremental rebuild (measure, then decide)

Restarts the work whose brief survives at
[`planning/specs/2026-09-05-incremental-rebuild-intent.md`](../specs/2026-09-05-incremental-rebuild-intent.md)
and whose design is
[`planning/specs/2026-09-05-watch-dependency-graph-design.md`](../specs/2026-09-05-watch-dependency-graph-design.md).
That brief asked to be re-run rather than reused, because its criteria predate
the asset pipeline, the trailing-slash change and `config.markdown`. This file
supersedes it; the design still stands and is read first.

## Verified at open (against the code, not the memory)

- **Rollout steps 1–4 have landed.** The serial rebuild queue exists:
  `_requestReplay()` sets a pending-replay bit and clears the target set,
  `_requestRebuild(entries)` adds scoped targets unless a replay is pending, and
  `_runRebuildQueue()` holds one in-flight slot and one pending slot
  (`lib/kiss.js:1385–1440`). `_handleChange` routes `add`/`addDir` and a page
  `unlink` to a replay, and an edited partial or layout to re-register plus
  re-render the stack (`lib/kiss.js:1443+`). `_closing` is honoured by the queue.
- **The design's step 5 is the next thing, and the harness cannot take it.**
  `npm run bench --site=<path>` (`scripts/bench.mjs:525–640`) times a whole cold
  build: the child process wall-clock and the build report's single `duration`
  (`lib/build-report.js:52`). Nothing splits registration from render, and a
  scoped rebuild emits no report line at all (`scripts/bench.mjs:483`).
- **A consumer-scale site is on this machine.** `C:\Code\kiss\diploma-msc`:
  257 `.hbs` files under `src/`, `kiss-ssg@2.0.0-alpha.5` installed. This repo
  is at `2.0.0-beta.1`. Measured as installed, the site would time an engine
  without the no-graph optimisation. `learna-kiss` (236 templates) and
  `student-handbooks` are on v1 and are not candidates.
- **Two of the brief's three open questions are answered by the design.**
  Model and controller scoping is a design non-goal, so ESM module caching of
  re-imported controllers is a replay concern (already cache-busted there) and
  becomes a _documented limitation_ of scoping, not a mechanism to build.
  Invalidation lives in a new `lib/dependency-graph.js`. The third — what edges
  Handlebars can expose — has a design (function partials that record their
  name into a per-instance sink; the current-page marker inside
  `KissPage.generate()`), verified against the installed Handlebars and
  handlebars-layouts sources on 2026-09-05. The plan re-verifies all three
  against today's code rather than re-deriving them.

## Intent (captured at /branch-open)

**Objective:** Take the measurement the design gates the dependency graph on —
registration time versus render time per rebuild, on `diploma-msc` against the
current engine — record it in the design spec, and either build the traced
partial→page graph on this branch if render dominates, or close the branch with
the numbers as its result if registration dominates.

**Success criteria:**

_Phase A — the reading (unconditional)_

- [ ] `npm run bench --site=<path>` gains a watch reading for a real site: start
      the site in dev mode, touch a partial (the scoped path: re-register
      partials, render every stack entry) and touch a model (a full replay:
      registration plus render), and time each settled rebuild — medians over
      `--runs`, reported beside the existing cold-build phases. Covered in
      `test/unit/bench.test.js`. Whatever observable a scoped rebuild must emit
      for the bench to see it settle (a report line, or a narrower hook) is an
      engine-internal change, not a public one.
- [ ] The reading is taken on `diploma-msc` with this checkout `npm link`ed into
      it; the bench's printed resolved-engine path proves which copy ran. The
      link is removed afterwards: `diploma-msc`'s working tree is untouched and
      `node_modules/kiss-ssg` is back at `2.0.0-alpha.5`.
- [ ] The numbers, the exact command, and the verdict (registration dominates /
      render dominates, with the ratio) are recorded under Rollout step 5 of
      `planning/specs/2026-09-05-watch-dependency-graph-design.md`, so anyone
      can reproduce the reading.
- [ ] The go/no-go call is made with the operator at a `/branch-pulse`, before
      any `lib/dependency-graph.js` exists.
- [ ] **No-go is a success outcome.** If registration dominates, the design's
      status line flips to closed / won't-do with the reason, the intent spec is
      marked likewise, and the branch closes carrying the instrumentation and
      the numbers.

_Phase B — the graph (only if the reading says render dominates)_

- [ ] A plan lands in `planning/plans/` before any `lib/` change and is approved
      at a `/branch-pulse`. Every claim about current behaviour cites
      `lib/kiss.js`, `lib/partials.js`, `lib/kiss-page.js` or the relevant
      `AIKB/` doc as they stand today, and every step names the test that proves
      it. The plan states, explicitly, its answer to the three open questions
      (ESM caching as a documented limitation; the edges tracing can and cannot
      see, inline partials included; `lib/dependency-graph.js` as the home).
- [ ] Editing a partial or layout re-renders only the pages that used it —
      proved by a test asserting the unaffected pages' outputs are untouched
      afterwards (byte-identical content and unchanged mtime), not merely that
      the affected page changed. The replay-equivalence test stays green.
- [ ] Any edge the graph cannot resolve (file not in the index, empty index, any
      error in graph code) falls back to step 4's every-entry rebuild **and**
      logs a notice naming the file — one test asserts both halves.
- [ ] The one documented surface that changes shape — `kiss.handlebars.partials`
      entries become functions always — is stated in `llms.txt` and `README.md`.
- [ ] The sync-render invariant (marker set for the whole synchronous render;
      pages rendered from a synchronous loop cannot interleave) is pinned by a
      test and stated in `AIKB/kiss-page.md`.

_Both phases_

- [ ] Every new or changed `lib/` module ships its `test/unit/` sibling and its
      `AIKB/` doc (and a `CLAUDE.md` table row for a new module) in the same
      commit. `npm run gates` green. The existing watch tests stay green and
      unedited.

**Non-goals / out of scope:**

- Model or controller scoping (a design non-goal: positional fan-out renumbers,
  `_failures` reset only by replay, `buildTo` dedupe). A model or controller
  edit stays a full replay.
- Phase timings in the `BuildReport`. The split is measured by the bench, not
  reported to consumers — chosen at open to keep the impact surface internal.
- Cold one-shot builds, `.generate()` / `.complete()` semantics, anything
  persisted across processes.
- Browser-side hot module replacement; livereload stays a full page reload.
- Scoping the asset pipeline or Sass; new helpers; new public config surface.
- `diploma-msc` itself: it is the measurement subject, not a deliverable. No
  upgrade to beta, no fixes to its templates, no committed change there.
- Reworking the docs site (`src/`, `docs.js`) or its output.

**Impact surface:** engine internals + tooling — `scripts/bench.mjs` grows the
watch reading; `lib/kiss.js` gains whatever a scoped rebuild must emit to be
observed; Phase B touches `lib/partials.js`, `lib/kiss-page.js`, `lib/kiss.js`
and adds `lib/dependency-graph.js`. The public API is unchanged. The version
carries a prerelease tag, so the bump is `npm version prerelease --preid beta`.
If the bench observable turns out to need a config key or a `watch()` option,
or the `BuildReport` shape changes after all, that promotes the branch to
**public API** (`llms.txt` + `README.md`) and is recorded as an Amendment.

**Expected shape:** between — planned as far as the reading (the harness change
and the site are known), then a fork whose branch is chosen by a number nobody
has seen. If it forks to the graph, the destination is designed but the route is
emergent: it is settled by what the tracing partials actually record on a
257-template site.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-09-08** — baseline pulse, one commit since `main` (the intent file). Phase A criteria 1–4 not yet (`scripts/bench.mjs` unchanged, no watch reading for `--site`; diploma-msc still on alpha.5, nothing linked; design spec step 5 still unmeasured); Phase B not applicable until the reading is in; gates/unedited-watch-tests trivially met (diff is `planning/` only). No drift: no `lib/`, `llms.txt` or `README.md` touched. Decision: continue — next slice is the bench watch reading plus the scoped-rebuild observable it needs.

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->
