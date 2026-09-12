---
branch: feat/incremental-rebuild
base: main
status: closed
opened: 2026-09-08
consolidated: 2026-09-12
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

- **2026-09-08 — `generate: false` still reserves its output path.** Found while
  cleaning up `diploma-msc` under v2: `_preparePage` pushes every page onto
  `_stack` and dedupes on `buildTo` before `generate` is consulted, so a skipped
  page makes a real page registered later fail as `Page already processed`.
  The docs promise a skipped page writes nothing; it should not claim a path
  either. Operator chose to fix it on this branch: engine internals, patch-level,
  `lib/kiss.js` plus an integration test.
- **2026-09-08 — concurrent fresh imports of one CommonJS controller.** The
  after-reading's replay reported two failed pages that the cold build did
  not: diploma-msc registers two `.page()`s with `controller: "faculty-index.js"`,
  a watch replay loads both fresh at once, and the second `delete require.cache`
  lands while the first `import()` is still translating the CJS module — Node
  throws `ERR_INTERNAL_ASSERTION`. Pre-existing (`lib/controller-resolver.js`
  was untouched here), adjacent (the same replay seam), and it blocked a clean
  step-5 record, so it was absorbed: in-flight fresh loads are shared per
  controller path, with a child-process test that reproduces the assertion.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-09-08** — baseline pulse, one commit since `main` (the intent file). Phase A criteria 1–4 not yet (`scripts/bench.mjs` unchanged, no watch reading for `--site`; diploma-msc still on alpha.5, nothing linked; design spec step 5 still unmeasured); Phase B not applicable until the reading is in; gates/unedited-watch-tests trivially met (diff is `planning/` only). No drift: no `lib/`, `llms.txt` or `README.md` touched. Decision: continue — next slice is the bench watch reading plus the scoped-rebuild observable it needs.
- **2026-09-08** — go/no-go pulse. Phase A criteria 1–3 met (`--dev` watch reading landed with 83 green cases and gates at `3d33e4d`; reading taken on diploma-msc via junction against beta.1 and the alpha.5 install restored, later re-linked on the site's own `kiss-v2` branch at the operator's request; numbers in the design spec step 5 and `planning/benchmarks/diploma-msc-watch-2026-09-08.json`). Reading: partial 1247ms / model 2729ms / page 37.5ms on 654 pages, ratio 0.46. Operator's rule: build the mapper only if it is simple to own. A probe showed the page identity can travel through Handlebars' data frame (`template(ctx, { data: { kissPage } })` reaches function partials through nesting, `lookup` and layouts' `extend`), which removes the design's current-page marker and its sync-render invariant — the one piece of real legacy. Sized at ~70 engine lines plus a 40-line pure module. No drift: no `lib/` change yet, impact surface unchanged. Decision: **adjust course into Phase B** — plan in `planning/plans/` next, approved at a pulse before any `lib/` change; `generate: false` fix recorded as an Amendment.
- **2026-09-08** — plan approved. `planning/plans/2026-09-08-dependency-graph.md` (commit `eef1b2d`) approved by the operator for subagent-driven execution: Task 0 the `generate: false` amendment, Tasks 1–4 the graph (pure module → recording partials → data-frame render → dispatch with fallback and `dependency-graph.json`), Task 5 the after-reading. Sonnet for 0–1, Opus for 2–4, review of every diff here. Decision: continue.
- **2026-09-08** — Phase B executed and reviewed. Commits `0c06aa2` (generate:false amendment), `630b67c` (dependency-graph module), `b538c94` (recording partials + partialNameFor), `23f9138` (data-frame render), `40f1a0e` (dispatch, fallback notice, dependency-graph.json), `9422813` (amendment: shared in-flight fresh controller import), `ae9ef9a` (after-readings), `5712793`/`068ebfc`/`e563109` (final-review fix wave). Each task reviewed and approved; final whole-branch review "ready with fixes", fix wave re-reviewed 9/9 addressed. Evidence: `npm run gates` green at every commit; diploma-msc `kiss-v2` replay ok on 686 pages; narrow partial save 1247ms → 388ms, layout-wide unchanged. Rulings taken on the operator's behalf: (1) types/ regenerated for new modules beyond the plan's file lists; (2) Task 2's llms.txt:19 falsehood deferred to Task 4 and closed there; (3) Task 3's brief test fixed (`title: 'T'`); (4) Task 4's docs-site sentence and `private _graph` in types accepted; (5) the concurrent-fresh-import replay bug absorbed as an Amendment; (6) page-floor 37.5→50.8ms treated as noise. Parked for `/branch-close`'s docs sweep: the fix wave's replacement prose about an unrendered `--partial` is inverted (a never-recorded partial re-renders every page; only a recorded-then-orphaned one rebuilds nothing) in scripts/bench.mjs, CLAUDE.md and a lib/kiss.js comment; intent spec lines 11–12 stale; examples/9 `options?.data`. Decision: **ready to close** — hand to `/branch-close` when the operator says so.

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-09-08: Measure first, then build the partial-to-page graph

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** the bench's `--dev` watch reading (`b94df1e`, `3d33e4d`), the step-5 measurement (`d7409b0`, `ae9ef9a`), the `generate: false` amendment (`0c06aa2`, `e563109`), the dependency graph (`630b67c` → `40f1a0e`), the concurrent-fresh-import fix (`9422813`), the final-review fix wave and docs sweep (`5712793`, `068ebfc`, `45b9cd1`), and 2.0.0-beta.2 (`9eac360`). Alongside, diploma-msc's `kiss-v2` branch (four commits, unpushed) builds clean under v2 with the engine's own sitemap.

## Reflect — what the session was

The goal was framed unusually well before any code, because the brief was a rescue: a spec and a brief from a deleted branch, both saying "re-run `/branch-open`, do not reuse the criteria". The interview settled three real ambiguities in one round — measure-then-decide on one branch, instrument the bench rather than the report, link the site to the checkout — and the criteria were written so that "no-go" counted as success. That mattered: the branch's honest outcome at the halfway point was a number (render 46% of a replay) that the brief's own fork rule read as _stop_.

Shape: **between, as declared**. Phase A ran to plan. The fork was then taken on a rule the operator substituted at the pulse — "build it only if it is simple to own" — rather than the brief's "build it if render dominates". That is the single most consequential exchange of the session, and it produced something neither side held alone: the operator's question about legacy forced a re-examination of the design's riskiest piece (a "current page" marker with a sync-render invariant), and a twenty-line probe showed Handlebars' data frame could carry the page identity instead. The invariant vanished; the graph became small enough to say yes to. The drift was good, recorded at the pulse, and it changed the design for the better.

Two things fought the shape. The bench reading exposed that diploma-msc's dev mode crashed under v2 (an unhandled `complete()` rejection), which turned into a separate cleanup of the site — legitimate, operator-authorised, and the reason the after-reading's model row is not comparable with the before-row. And the bench harness itself needed two fixes discovered only by running it on a real site: `--entry` could not carry an argument, and a settle waited ten minutes for a dev child that had already died.

## Evaluate — how the human supervised the AI

**Pushback & steering** discriminated this session. The operator did not take the recommendation at the go/no-go pulse (won't-do) and did not overrule it either; they reframed the decision around the cost of owning the code, which was the right axis and one the brief had not named. Earlier, "make sure we're delegating to appropriate models and the highest model evaluates" set the delegation policy the whole execution then ran on. Both were steers that changed what got built, not approvals of what was offered.

**Learning engagement** was real but brief: the operator's "singing from the same hymn sheet" check corrected their own mental model (a scan, they thought; a trace at render time, in fact) and asked how added partials are handled. The explanation stood, and the design later leaned on exactly that distinction when diploma-msc turned out to select most of its partials dynamically.

**Verification & ownership** is where intention and practice diverged. The intended checkpoints — plan approved at a pulse before any `lib/` change, go/no-go taken with the operator, every diff reviewed by a fresh reviewer, a final whole-branch review on the most capable model, a Codex pass — were all held; the pulse log shows four beats. But every verification was Claude-run or subagent-run. The human did not open the diff of any task, did not run a test, and did not look at the one artefact they had asked for by name: the dependency graph "visible from a debug perspective for a human to have a little look at". `dependency-graph.json` exists, was tested, and has not been looked at by a person. The reviews were rigorous — the final one found a real gap (a consumer helper that drops the data frame) that three per-task reviews had missed — so the output is well verified; it is just not _owner_-verified.

**Iteration discipline** was strong: a pulse before the harness, a pulse at the reading, a pulse at plan approval, a pulse at the end; per-task review before the next task started; the after-reading re-run once the replay bug was fixed rather than recorded with a failed build in it. Claude's own long autonomous stretches were punctuated by those reviews rather than run to one large output.

**Harness leverage** was the session's ceiling and its floor. Ceiling: `/branch-open` and `/branch-pulse` as designed, subagent-driven development with a reviewer per task, model tiers chosen per task, the most capable model for the final review, Codex as an independent second opinion, and the bench harness built for exactly this question. Floor: three garbled shell commands (a repeated variable assignment, then a heredoc that swallowed its own delimiter) and a mistyped scratchpad path cost real minutes, and the plan omitted `npm run types` and mandated a test fixture that did not match the engine — both caught by the implementers, both avoidable.

**Where the human intended to supervise versus where they actually did:** the operator designed and ran the supervision _system_ (the three beats, the model policy, the reviews) and made every judgment call it surfaced; they did not put their own eyes on the code or the generated output at any point. That is the gap to close.

**Competency level: Agentic engineering lead**, on the evidence of a reproducible workflow — captured intent, pulses with logged evidence, delegation policy, independent review passes, a measurement harness built to settle a design question — with one dimension, Verification & ownership, sitting at Active supervisor because the owner's own verification was delegated entirely.

## Feedback — recommendations for next session

- **Operator — look at the artefact you asked for.** Run diploma-msc on `kiss-v2` with `verbose: true`, open `public/dependency-graph.json`, pick a partial you know and check its pages. Five minutes, and it is the only check on this branch that is yours rather than a reviewer's.
- **Operator — two site decisions are waiting.** The blog post whose URL loses a leading dash wants a Firebase redirect if the old URL is indexed; the "our students" page is out of the sitemap only because v1 excluded it by omission. Then, once beta.2 is published, pin the site to it — today `npm install` there would drop the link and bring the replay bug back.
- **Claude — plans must be checked against the engine, not remembered.** The plan mandated a test asserting a title the engine never produces and omitted `npm run types` for every task; a plan that the repo's own `CLAUDE.md` rules would have corrected is a plan written too fast. Next time: run each plan's test snippet once before handing it to an implementer, and put the repo's "same commit" obligations in the Global Constraints verbatim.
- **Claude — shell discipline.** Write any command longer than a line to a file first. Three garbled commands and one wrong path were pure waste, and the last one happened while writing this very section.
- **Both — verify consumer call shapes, not only library ones.** The spec proved how Handlebars and handlebars-layouts call a partial and never asked how a _site's helper_ does, on a site the spec itself said routes most partials through one. The final review caught it; the per-task reviews could not. Before changing any documented surface, grep the consumer sites under `C:\Code\kiss` for how they touch it.
- **Process — the docs sweep is the right place for the last prose fix, but say so.** The subagent workflow's "no second fix wave" rule left three inverted sentences to `/branch-close`; they were caught there. Keep the rule; record the hand-off in the pulse log as this branch did.

## Verdict — did we achieve the objective?

**Brief:** take the registration-vs-render measurement on diploma-msc, record it, and either build the traced partial→page graph if render dominates or close with the numbers.

**Verdict: met, with the fork taken on a substituted rule (good drift, recorded at the pulse).** Render did not dominate (0.46); the graph was built because the operator's rule — simple enough to own — was satisfied once the data-frame design removed the marker and its invariant.

_Phase A_

- [x] Bench watch reading — `--dev` on `--site`, 83 cases green at `3d33e4d`; no engine change was needed for the observable.
- [x] Reading on diploma-msc via link, link removed afterwards — taken against beta.1 through a junction, alpha.5 restored; the site was then re-linked permanently on its own `kiss-v2` branch at the operator's request.
- [x] Numbers, command and verdict recorded — design spec step 5, three records under `planning/benchmarks/`.
- [x] Go/no-go at a pulse before any `lib/dependency-graph.js` — commit order `d7409b0` → `7768a35` → `eef1b2d` → `f1e730f` → `630b67c`.
- [ ] No-go as a success outcome — not applicable; the go was taken.

_Phase B_

- [x] Plan in `planning/plans/` first, approved at a pulse — `eef1b2d`, `f1e730f`. Two of the three open questions are answered in the plan; the ESM-caching answer sits in this file's "Verified at open" rather than the plan text.
- [x] Only pages that used it re-render; unaffected pages untouched by content and mtime — `watch.test.js` "re-renders only the pages that rendered the edited partial"; replay-equivalence unedited and green.
- [x] Unresolvable edge → every page and a notice, one test for both halves — "falls back to every page, and says so".
- [x] `kiss.handlebars.partials` shape change stated in `llms.txt` and `README.md`, with the consumer one-liner.
- [ ] Sync-render invariant pinned and stated — superseded: the data-frame design has no such invariant, and `AIKB/kiss-page.md` states the opposite rule; the tracing and data-frame tests replace it.

_Both phases_

- [x] Every `lib/` change with its test and `AIKB/` doc in the same commit, `CLAUDE.md` row for the new module, `npm run gates` green at every commit, existing watch tests unedited.

**Measurable impact:** on a 654-page site, a save to a narrowly used partial settles in 388ms instead of 1247ms; a layout-wide partial is unchanged at the designed ceiling. Two engine bugs found and fixed on the way: a `generate: false` page claiming its path, and two registrations sharing a CommonJS controller failing every replay. diploma-msc builds clean under v2 for the first time.

**Still open:** publish beta.2 and pin the site; the two site decisions above; the deferred minors the final review triaged as leave; the docs site under `docs/` not regenerated from `src/` on this branch (`node docs` on the operator's next docs pass).
