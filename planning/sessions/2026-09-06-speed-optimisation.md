---
branch: claude/library-speed-optimization-dx73qq
base: main
status: closed
opened: 2026-09-06
consolidated: 2026-09-12
---

# Session — 2026-09-06: Speed Optimisation

## Intent (captured at /branch-open)

**Objective:** Make kiss-ssg measurably faster to build — first by giving the repo a
benchmark harness it has never had, then by following the profile to fix what that
harness proves is slow.

**Success criteria:**

- [ ] A benchmark harness exists (`scripts/bench.mjs` + a fixture whose page count is a
      parameter), runnable on demand, reporting wall-clock per phase — not one opaque total.
- [ ] A baseline measured on `main`'s code is committed to this session file, so every
      later claim is a delta against a recorded number rather than an assertion.
- [ ] The three in-scope paths each have a measured before/after: cold build, dev watch
      re-render latency, and module-load/startup cost.
- [ ] A measurable improvement on the committed baseline, with each win attributed to a
      named change. No change lands on intuition alone — if the harness cannot show it,
      it does not ship.
- [ ] Zero behaviour change: `npm test` green throughout, `npm run gates` green at close,
      every example still builds to byte-identical output (example 8 still fails its one
      page by design).
- [ ] `AIKB/` docs updated for every module touched, in the same commit as the change.
- [ ] The harness is documented in `CLAUDE.md`'s Commands block, and `scripts/bench.mjs`
      has a `test/unit/` sibling per the repo's dev-tooling rule.

**Non-goals / out of scope:**

- Assets and Sass (`lib/assets.js`, `lib/sass.js`, `lib/asset-manifest.js`) — deliberately
  excluded this branch, even though asset work is often the dominant cost on real sites.
- Any public API change: no new config keys, no changed signatures, no changed defaults.
  A speed idea that needs an API is recorded here as a follow-up, not built.
- Swapping core dependencies (Handlebars, Remarkable, fs-extra) for faster alternatives.
- Micro-optimisation with no harness evidence behind it.

**Impact surface:** engine internals — `lib/` implementations change, the observable
surface does not. Consuming sites see the same methods, config shape and output; only the
clock differs. Patch bump. Obliges the `AIKB/` doc of each module touched, not
`llms.txt`/`README.md`/`types/`.

**Expected shape:** emergent — the destination (faster) is fixed, the route is not. The
harness comes first precisely because the bottleneck in a pipeline like this one is rarely
where reading the code suggests. Early code-read suspicions worth testing, not trusting:
synchronous `fs` in the per-page hot path (`lib/kiss-page.js`, `lib/model-resolver.js`,
`lib/partials.js`), serial `await` where concurrency is available, and per-page work that
could be hoisted to once-per-build.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

**2026-09-06 — the Assets and Sass exclusion is lifted, on operator authority.**

The non-goals above excluded `lib/assets.js`, `lib/sass.js` and
`lib/asset-manifest.js`, on the reasoning that asset work is "often the dominant
cost on real sites" and deserved its own branch. Profiling a real consuming site
inverted that: it is the dominant cost, and it is dominant _inside the page
loop_, which this branch already owns.

The evidence, from `learna-ltd/diploma-msc` (a production kiss-ssg site):

- The `{{sass}}` helper compiles on every render and caches nothing. Its
  `catalog.scss` costs **76ms per compile** (measured, repeat compile, real
  `loadPaths`) and emits an identical 22KB of CSS each time.
- That partial is included by all four `src/pages/catalogs/*.hbs` views, which
  `.pages({ view: 'catalogs', model: 'catalog' })` renders once per course. The
  site's public sitemap lists **111 course pages** (of 669 URLs).
- 111 × 76ms ≈ **8.4 seconds** of byte-identical recompilation in every
  production build — an order of magnitude larger than the 371ms import finding
  that reordered the branch in the first place.

Two of the four sites surveyed (`diploma-msc`, `learna-kiss`) use the helper
heavily; `medulla` uses it once and `metacarpus` not at all — so the win is
real but site-shaped, which is itself worth recording.

The operator authorised absorbing this rather than deferring it, and extended it
to `lib/assets.js` and `lib/asset-manifest.js` for anything else the profile
shows. The non-goal that stands unchanged is the public API: no new config keys,
no changed signatures. A cache that needs a config key to control is a follow-up,
not this branch.

**2026-09-06 — real-site benchmarking is done as extracted fixtures, not live builds.**

The four sites named for benchmarking (`diploma-msc`, `learna-kiss`, `medulla`,
`metacarpus`) cannot be built in this environment, for two independent reasons:
all four pin `kiss-ssg` ^1.x while this branch is 2.0.0-alpha, and none commits
its `src/models/` — content comes from Orchard CMS at build time behind OAuth2
credentials. `--site=` therefore has nothing to time. Instead their _workloads_
are extracted into the harness as fixtures: real stylesheets, real template and
partial counts, real page counts. That measures the engine change against
real-world shapes without needing either a credential or a v1→v2 migration.

## Baseline (captured at 58d9407, before any `lib/` change)

Recorded to `planning/benchmarks/baseline-main.json` — the file `--baseline=`
compares against. Machine: node v22.22.2, linux-x64,
4 cpus, 5 runs per figure, median reported.
Numbers are only comparable to another sweep on the same machine; the shape of
the findings below is what travels.

| scenario     | process | import | build | construct | re-render |
| ------------ | ------: | -----: | ----: | --------: | --------: |
| `scan@50`    |     620 |    361 |   177 |      14.8 |         — |
| `models@50`  |     667 |    376 |   206 |      15.7 |         — |
| `fanout@50`  |     615 |    365 |   161 |      14.1 |         — |
| `watch@50`   |    1150 |    383 |   214 |      22.0 |       107 |
| `scan@500`   |    1637 |    371 |  1165 |      20.6 |         — |
| `models@500` |    1852 |    378 |  1382 |      20.1 |         — |
| `fanout@500` |    1610 |    375 |  1127 |      19.0 |         — |
| `watch@500`  |    2506 |    362 |  1586 |      33.2 |       108 |

`startup` alone: 435ms process, of which
371ms is importing `lib/kiss.js`.

### What the baseline says

Five readings, in descending order of how much time they account for.

1. **Import cost is the single biggest number on any small site — 371ms.**
   A 50-page build spends 177ms building and
   361ms getting ready to build. Measured per dependency,
   it is concentrated in three eager imports: `sass` (200ms), `html-minifier-terser`
   (114ms), and the dev-server trio `connect` + `serve-static` + `livereload`
   (125ms). `lib/kiss.js` pulls in `dev-server.js` and `watcher.js` statically, and
   `assets.js` / `handlebars-helpers.js` pull in `sass.js` statically — so a
   production build with no `.scss` file and no dev server still pays for all of it,
   and so does every `npx kiss-ssg check`.

2. **Per-page cost is ~2.3ms at 500 pages** (1165ms for 500),
   rising to ~3.5ms/page at 50 where fixed overhead is amortised over fewer pages.
   Scaling is essentially linear across the range measured — no accidental
   quadratic hiding in the page loop, which is the good news the baseline had to
   rule out before anything else was worth doing.

3. **Watch re-render is ~107ms and flat** — identical at
   50 and 500 pages (107ms vs 108ms).
   Flat means the scoped re-render is genuinely scoped (the design works), and that
   the whole 107ms is fixed cost per keystroke-save, not
   per-page work. That is the number a developer feels all day.

4. **Model resolution costs ~0.43ms per page** — `models@500` is
   217ms above `scan@500` for the
   same page count, the price of one `readFileSync` and a parse per page. Real, but
   an order of magnitude below the import finding.

5. **Construction is 14.8–33.2ms** —
   emptying the build folder, registering partials, queueing the asset copy. Small,
   and not obviously worth attention yet.

### What this reorders

The suspicions logged at branch-open were sync `fs` in the page path, serial
awaits, and per-page work that could hoist. The baseline does not refute them —
reading 500 model files synchronously is finding 4 — but it puts them behind
something none of them predicted: the biggest win available is work the engine
does _before the build starts_, and it is paid by every site regardless of size.
Small sites pay proportionally more, and small sites are most of them.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

**2026-09-06 — four changes landed, all measured. Decision: continue.**

Machine note: this sweep ran on a container ~25-35% slower than the one that
recorded `baseline-main.json`, uniformly across every phase, with `lib/`
unchanged. Cross-machine percentages are therefore not comparable, and a local
before/after pair was captured instead — `planning/benchmarks/local-before.json`
and `local-after.json`. The percentages below are that pair.

| change                             | evidence                                               |
| ---------------------------------- | ------------------------------------------------------ |
| Lazy-load the four heaviest deps   | `import` 490ms → ~63ms (**-88%**)                      |
| Memoise Sass compilation           | `styled@200` build 7995ms → 2811ms (**-64.8%**)        |
| Shorten the write-settle threshold | `rerender` 108ms → 35ms (**-68%**), flat at 50 and 500 |
| Cache compiled templates per env   | 395ms → 14ms of compilation on real views              |
| Skip minification in dev           | `watch@500` build **-11.3%**, `watch@50` **-32.7%**    |
| Register layouts compiled          | `fanout@500` build **-27.1%**; replay 455ms → 172ms    |

Final sweep against the same machine's before-record (5 runs, median), every
change in place:

| scenario     | process | import |  build | rerender |
| ------------ | ------: | -----: | -----: | -------: |
| `startup`    |  -79.7% | -87.8% |      — |        — |
| `scan@50`    |  -57.2% | -87.4% |  +0.7% |        — |
| `fanout@50`  |  -62.6% | -86.9% | -25.0% |        — |
| `watch@50`   |  -63.5% | -88.2% | -42.2% |   -67.9% |
| `scan@500`   |  -52.7% | -88.2% | -41.9% |        — |
| `models@500` |  -46.1% | -87.8% | -34.5% |        — |
| `fanout@500` |  -71.0% | -87.4% | -69.3% |        — |
| `watch@500`  |  -50.8% | -87.8% | -41.6% |     -66% |

Every scenario improved end to end; none regressed. The `build` column is no
longer up at 50 pages: deferring the minifier had moved ~155ms into it, and dev
skipping minification plus the layout fix have since repaid that.

Against the captured success criteria:

- Harness exists, page count parameterised, per-phase reporting — done at
  `58d9407`, extended here with a `styled` scenario built from a real site's
  shape.
- Baseline committed — done, plus the local pair the machine change forced.
- Three in-scope paths each measured before/after — cold build ✅, watch
  re-render ✅, module-load/startup ✅.
- Every win attributed to a named change, none on intuition — ✅. Two changes
  were additionally validated by breaking them on purpose and watching the new
  test fail (`awaitWriteFinish` disabled; the template WeakMap swapped for a
  shared Map).
- Zero behaviour change — `npm test` green throughout (646→650 tests, all new),
  `npm run gates` green at each commit.
- `AIKB/` updated in the same commit as each change — ✅.
- Harness documented in `CLAUDE.md`, `scripts/bench.mjs` has a `test/unit/`
  sibling — ✅.

**2026-09-06 — dev skips minification; the Sass double-compress was tried and reverted.**

Two changes were put up together. One landed, one did not, and the one that did
not is the more useful record.

**Landed: dev no longer minifies at all.** It used to call the minifier with
every option off bar comment removal, still paying the parse and — since the
minifier is imported at first render — still paying ~155ms to load the package.
Over 9 runs: `watch@50` build **-32.7%**, `watch@500` build **-11.3%**. Mostly
the fixed import, hence proportionally larger on the smaller site. It does _not_
move the scoped re-render (~37ms, unchanged), so the save-to-refresh loop is no
faster; the win is on full dev rebuilds and dev startup. Production output is
untouched — the example suite still builds byte-identical to `main`.

**Reverted: emitting expanded Sass and letting `minifyCSS` do the compressing.**
The case looked airtight. On diploma-msc's real stylesheets the two paths land
within 0.16% (`catalog.scss` 21904b vs 21939b, `about-us.scss` +0.02%,
`faculty.scss` +0.00%), so the Sass-side compression appeared to be free work
worth ~11ms a page — and the _block_ form of the helper already relied on the
minifier, passing no `style` at all, so this only made the file form agree with
it.

Building it and measuring the whole pipeline killed it: **+19% output over 200
pages.** Sass's `compressed` style converts percentage-form colours to hex
(`rgb(80.4%,41.2%,21.6%)` → `#cd6937`); clean-css does not. The `styled` fixture
is built on `color.adjust`, so it is full of them. The three real stylesheets
contain zero, which is exactly why they showed nothing.

The lesson worth keeping: the isolated experiment (compile a stylesheet, minify
it, compare bytes) and the end-to-end build disagreed, and the end-to-end was
right. Three sampled stylesheets are not the population a published default has
to hold for.

**2026-09-06 — correction to the sweep below: it declared the cheap wins exhausted, and was wrong.**

The sweep concluded that what remained needed either a config key or workers.
Asking "are there other optimisations we've missed" one more time found the
largest single win of the branch, in a place the sweep had already looked at
twice and misread.

`handlebars-layouts`' `extend` helper compiles the layout on every page render
and never writes the compiled function back, so every page recompiled the whole
layout. Handlebars showed as 44% of a build in the very first profile, and both
earlier readings attributed it to "compiling N distinct views — inherent". It
was not inherent. Counting `hbs.compile` calls rather than reading a profile
found it in one command: a fan-out of 500 pages from ONE view called `compile`
504 times.

The lesson: a profile says which _module_ is hot, never which _call_ is
redundant. A counter answers the second question and the sweep never reached
for one. `fanout@500` build **-27.1%**, replay after a model edit **455ms →
172ms**.

**2026-09-06 — a typecheck gate, and `.scan()` assessed for removal.**

The gates go from four to five: `npm run typecheck` runs `tsc --checkJs` over
`lib/`, `scripts/` and `bin/`. TypeScript was already in the toolchain emitting
`types/` with `checkJs: false`, so the package published 18 declaration files
that nothing verified. 22 findings, all fixed: one real defect (`new Kiss()`
passed an argument to `_setupFolders()`, which takes none and always discarded
it) and 21 places where JSDoc had drifted from the code.

A full TypeScript migration was considered and rejected. It buys nothing at
runtime — TS compiles to JS — and it would cost the property `CLAUDE.md` names
first: no build step, no transpilation. Adding a compile to every edit works
against the dev-experience goal that reordered this branch. The consumer-facing
benefit (typed API) already exists via JSDoc → `types/`. The gap was never the
type _language_, only that nothing checked the types being shipped.

**`.scan()`: keep it. Deprecating it would not make anything faster.** None of
the four consuming sites calls it (0 hits each), so the question was fair. But
it is a registration method, not hot-path code: a site that never calls it pays
nothing for its existence, and removing it makes no build measurably faster. It
is also not dead — `examples/1-scan` (the reference example), `examples/7`,
kiss's own `docs.js`, and ten integration tests use it, and `llms.txt` leads
with it as the simplest way to build a site. Removing it is a breaking change
(major bump) with a real documentation and test cost, for zero measured gain.
If the intent is to steer large sites toward explicit registration, that is a
docs change, not a deprecation.

### Ruled out by measurement — do not re-attempt without new evidence

A sweep for remaining wins after the five changes landed. These all looked
plausible and are all dead; recorded so the next person does not spend the time
again.

1. **Async or parallel file reads. Dead.** The branch-open note and the
   baseline's finding 4 both suspected sync `fs` in the page hot path. Counting
   and timing every sync call during a 500-page build: 729 `readFileSync`
   (16ms), 1000 `existsSync` (2ms), 500 `statSync` (16ms) — **33ms, 2.9% of a
   1154ms build**. The page cache makes these nearly free. The `readFileUtf8`
   and `read` frames that dominate a CPU profile (24%) are Node loading its own
   module graph at startup, not the page loop — a whole-process profile
   attributes them to the build if you are not careful. Making model resolution
   async would buy nothing.
2. **Garbage collection. Not a lever.** An early reading of the profile put GC
   at 46.6%; that was a rollup bucketing every `(native)` frame together. Actual
   GC self-time is 138ms, **5.3%**.
3. **Concurrency in the render loop. Already done.** `generate()` starts every
   page's `generate()` and awaits one `Promise.all`. There is no serial await to
   remove, and since the work is CPU-bound the concurrency only overlaps writes.
4. **Caching markdown partials. Already done.** `registerPartialsFrom` renders
   `.md` once at registration, not per page. The `{{markdown}}` _helper_ takes
   page-specific content, so there is nothing to memoise.
5. **Removing redundant existence checks.** 1000 calls, 2ms. Not worth the
   churn.

### What headroom is actually left

**1. Production minification — the largest remaining item, needs a config key.**
54% of a sass-heavy build. Per page, measured in fresh processes to avoid JIT
contamination between option sets:

| option      |     cost |     what it buys |
| ----------- | -------: | ---------------: |
| `minifyCSS` | ~11-15ms | 426 bytes (1.8%) |
| `minifyJS`  |   ~4-6ms |          9 bytes |

`minifyJS` is close to free to drop for a site whose inline scripts are already
compact. Both need a config key, so both are an API addition — a minor bump and
its own branch.

**2. Multicore. Real, large, and blocked by the public API.** Per-page work is
**80-91%** of build time (fixed vs per-page, solved from the 50/500 pair:
`scan` 160ms + 2.43ms/page, `styled` 602ms + 11.69ms/page). Four cores put the
ceiling near 3x. But helpers and controllers cross the API as _functions_ —
diploma-msc registers 15 helper closures via `kiss.handlebars.registerHelper`,
and controllers are inline arrows — and a closure cannot cross a worker
boundary. Workers would have to re-execute the consumer's build script in a
"register everything, render this subset" mode. Feasible; a major feature, not
a tweak.

**3. A persistent precompiled-template cache.** Handlebars compilation is 28-44%
of a build and is inherent for N distinct views (the in-process cache only helps
fan-out). Caching precompiled templates to disk across builds would help a
developer rebuilding repeatedly and do nothing in CI, where the cache is always
cold. Low value for the complexity.

### Findings recorded, deliberately not acted on

1. **`html-minifier-terser` is 54% of a `styled` build** (1798ms of 3188ms at
   200 pages) — it re-minifies CSS that Sass already emitted with
   `style: 'compressed'`. Disabling `minifyCSS` would reclaim most of it, but
   it would change output bytes for any site that inlines unminified CSS, which
   the success criteria forbid. Needs a config key, so: follow-up, not this
   branch.
2. **Deferring the minifier moved ~155ms from `import` into `build`.** Net
   `process` is far ahead, but the phase table shows `build` up ~20% at 50
   pages. Minification is not optional, so the cost can only move, not vanish —
   unless (1) gives it somewhere to go.
3. **Site-side, not engine-side:** diploma-msc inlines the 22KB compiled
   `catalog.scss` into all 111 course pages via `{{sass}}` in a partial. That is
   22KB duplicated per page that no browser can cache across them, and it is
   what makes the minifier cost scale with page count. An external stylesheet
   would cut build time and page weight together. Worth raising with the site's
   maintainers; nothing for the engine to fix.
4. **The four named sites cannot be benchmarked against v2 at all.** Beyond the
   missing content, `generate.js` in each does `require("kiss-ssg")` and v2 is
   `"type": "module"`. A real before/after needs those sites migrated to ESM and
   to the v2 API — a project, not a measurement.

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-09-06: Speed Optimisation

_A Claude Code session is supervised collaboration: Claude generates, the human
directs and judges. The session's quality is set by how actively the human
supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** seven engine changes and a fifth gate across 20 commits
(`5238fad` lazy dependency loading, `b1f7e67` Sass memoisation, `b571fce` watch
latency, `37b24ec` template cache, `a022779` dev skips minification, `f1e436f`
layouts registered compiled, `a6278b4` the typecheck gate). End to end,
**-46% to -80%** depending on scenario; watch re-render **-68%**; a dev replay
after a model edit **455ms → 172ms**. Output byte-identical to `main`, no public
API change, version `2.0.0-alpha.4`.

## Reflect — what the session was

**Emergent, and the brief said so.** `/branch-open` captured "the destination
(faster) is fixed, the route is not", and named three suspicions to test rather
than trust: sync `fs` in the page path, serial awaits, hoistable per-page work.
All three were wrong. The baseline refuted the first (sync `fs` is 2.9% of a
build), the code refuted the second (`generate()` already awaits one
`Promise.all`), and the third was never the cost. That the brief framed them as
suspicions rather than a plan is why being wrong three times cost nothing.

The shape served the work, with one exception worth naming: the branch was never
`/branch-pulse`'d. Six Pulse-log entries exist, but every one was written by
Claude at a commit boundary rather than by the operator pausing to steer. The
formal Steer beat was skipped; what substituted was a measurement discipline —
no change was committed without a before/after — which caught drift at a finer
grain than a pulse would have. Good outcome, but by a different mechanism than
the ritual intends, and the captured success criteria went unchecked until this
Verdict.

## Evaluate — how the human supervised the AI

Three dimensions discriminated this session. The rest were unremarkable.

**Pushback & steering — the decisive dimension, and the reason the branch's
biggest win exists.** Twice Claude declared the cheap wins exhausted. The first
time it was recorded as a committed sweep (`872822c`) concluding that everything
left needed a config key or worker threads. The operator's reply was four words
of refusal to accept it: _"are there other optimisations we've missed?"_ That
question produced `f1e436f` — `handlebars-layouts` recompiling the entire layout
on every page render, the single largest cost in the engine, present in every
kiss site ever built. Claude had read "Handlebars = 44% of the build" **twice**
and filed it both times as "compiling N distinct views — inherent". It was not
inherent. The correction is committed as `aad9fc9`.

The other steer that redirected the branch: _"I want API compatibility I'm
afraid… I'm more concerned with development experience."_ That killed a
config-key direction Claude had proposed as the top remaining item and pointed
the work at the dev loop — which is the ground the layout find was standing on.
A single sentence of priority-setting was worth more than the analysis it
overruled.

**Problem framing — strong at the boundaries, and the operator used their own
process correctly.** When the profile showed the dominant cost sat inside the
excluded Sass modules, Claude stopped and put the scope question to the operator
rather than absorbing it silently. The operator answered by lifting the
exclusion _and widening it_ ("absorb it, and go further on assets") — the call
their own one-open-branch rule reserves for them, recorded as a dated Amendment.
That is the rule working as designed rather than as paperwork.

**Verification & ownership — delegated, and that is the honest gap.** The
operator did not run the benchmarks, read the diffs line by line, or open a
built site. Verification was delegated wholly to Claude and to the gates. It
happened to hold — every change was measured, two were verified by deliberately
breaking them (disabling `awaitWriteFinish`; swapping the template WeakMap for a
shared Map) to prove the new tests could fail, and the example suite was hashed
against `main` — but it held because Claude chose to do it, not because the
supervision required it. An operator who wanted assurance independent of the
agent's own account did not get one this session.

**Where the sum beat the parts.** The layout find, precisely. Claude had the
method (count `hbs.compile` calls rather than read a profile) and had twice
failed to apply it. The operator had the instinct that the seam was not mined
out and no way to prove it. Neither input alone reaches `f1e436f`. That is the
one exchange in this session that a solo effort — human or AI — does not
produce.

**Where Claude over-reached.** Three times, all recorded:

1. **Recommended a change that was wrong.** Claude argued confidently for
   dropping Sass's `compressed` output and letting `minifyCSS` do the work —
   "not a trade-off, it's waste" — on evidence from three sampled stylesheets.
   Built and measured end-to-end it produced **19% more output**: Sass converts
   percentage-form colours to hex and clean-css does not. Reverted, with the
   finding committed so nobody rediscovers it. The isolated experiment and the
   real pipeline disagreed, and the isolated one was the confident one.
2. **Misreported its own measurement.** Claude stated GC was 46.6% of a build.
   It was 5.3% — the rollup script was bucketing every native frame together.
   Corrected in the same session, but it was asserted to the operator as fact
   first.
3. **Ran ahead of an instruction.** The operator asked for real-site benchmarks
   _before_ proceeding to lazy loading; the lazy loading was already done when
   the message arrived. Disclosed rather than glossed, but the sequencing the
   operator asked for was not honoured.

**Competency level: Active supervisor.** Earned, not aspired to. The evidence
for it: a scope decision taken at the point their own process reserves for the
operator; a priority reframe that overruled and redirected Claude's technical
recommendation; and a refusal to accept a completion claim that turned out to be
premature and produced the branch's largest win. The evidence against
**Agentic engineering lead**: verification was delegated entirely, no
`/branch-pulse` was run across a 20-commit branch, and the operator did not at
any point independently check a result before accepting it.

## Feedback — recommendations for next session

**For the operator**

- **Keep asking the question that worked.** "Are there other optimisations we've
  missed?" beat a committed, confident, evidence-cited sweep. Treat an agent's
  "that's exhausted" as a hypothesis, not a finding — especially when it rests
  on a profile, which names hot modules and is silent about redundant calls.
- **Run `/branch-pulse` at least twice on a branch this size.** Twenty commits
  closed cold. It worked here because Claude measured continuously, but the
  captured success criteria sat unchecked from `/branch-open` to this Verdict.
  A pulse after the baseline and another after the Amendment would have cost
  minutes.
- **Ask for one thing to be verified independently.** Not all of it — one. "Show
  me example 1's output hashed against main" was run, but because Claude chose
  to; asking for it converts a self-report into a check.

**For Claude**

- **Do not recommend on three samples.** The Sass revert cost a full
  build-and-measure cycle. Three stylesheets from one site is not the population
  a published default must hold for, and the confidence in the recommendation
  was not supported by the sample behind it.
- **Reach for a counter before a profiler when the question is "is this work
  necessary".** A profile answers "where is time going"; it cannot answer "is
  this call redundant". One `hbs.compile` counter found in a single command what
  two profile readings missed. This is now recorded in the session file for the
  next sweep.
- **Sequence to the operator's instruction even when the work is obvious.** The
  lazy loading was right, and doing it before the requested benchmarks still
  took a decision that was not Claude's to take.

**For the partnership**

- The two changes verified by deliberately breaking them (`awaitWriteFinish`
  disabled; the template WeakMap swapped for a shared `Map`) are the pattern
  worth keeping. A test that has never been seen to fail is a guess about
  coverage. Make it fail on purpose, once, before trusting it.

## Verdict — did we achieve the objective?

**The brief:** make kiss-ssg measurably faster to build — harness first, then
follow the profile to fix what it proves is slow.

**Verdict: met, and the objective grew — good drift, formally authorised.** The
Sass and assets exclusion was lifted on operator authority once the profile put
the dominant cost inside the page loop the branch already owned, recorded as a
dated Amendment rather than absorbed silently. Scope creep would have been
taking that decision unilaterally; this was not that.

Success criteria, checked against the evidence:

- [x] **A benchmark harness exists**, page count parameterised, per-phase
      reporting — `58d9407`, extended with a `styled` scenario built from a real
      site's shape (`b1f7e67`).
- [x] **A baseline committed** — `81e3e55`, plus the local before/after pair the
      machine change forced (`planning/benchmarks/local-{before,after}.json`).
- [x] **All three in-scope paths measured before/after** — cold build ✅, watch
      re-render ✅ (108ms → 35ms), module-load/startup ✅ (490ms → 63ms).
- [x] **Every win attributed to a named change, none on intuition** — and one
      change (expanded Sass) was built, measured, found wrong and reverted,
      which is the criterion doing its job rather than being satisfied.
- [x] **Zero behaviour change** — `npm test` green throughout (654 tests, up
      from 636), `npm run gates` green at close, example 1's full output tree
      hashes byte-identical to `main`, example 8 still exits 1 by design.
- [x] **`AIKB/` updated in the same commit as every module touched.**
- [x] **Harness documented in `CLAUDE.md`; `scripts/bench.mjs` has a
      `test/unit/` sibling.**

**Measurably better now:** startup **-79.7%**, `fanout@500` end-to-end
**-71.0%** (build **-69.3%**), `watch@500` **-50.8%** with re-render
**-66%**, `models@500` **-46.1%**. Against v1 on the same fixture and the same
measurement method: **-36%** at 50 pages, **-60.5%** on a Sass-heavy 200-page
build. Worth stating plainly because it was not true before this branch — v2 on
`main` was **7.8% slower than v1** at 500 pages. v2 is faster than v1 now; it
was not when the branch opened.

**What remains open**, recorded in this file rather than half-built:

- Production minification behind a config key — 54% of a Sass-heavy build;
  `minifyCSS` costs ~11-15ms/page for 426 bytes, `minifyJS` ~4-6ms for 9. Needs
  an API addition, so a minor bump and its own branch.
- Scoped rebuilds for model and controller edits. Views, partials and layouts
  are already scoped (~38ms); a model edit still takes the full replay (172ms,
  down from 455ms). Closing it needs a third rebuild mode and model-provenance
  tracking — feature work with real staleness risk, and the operator's call.
- Multicore: 80-91% of build time is per-page work, so ~3x is on the table, but
  helpers and controllers cross the public API as _functions_ and cannot cross a
  worker boundary. Blocked by API shape, not by effort.
- Site-side, not engine-side: `diploma-msc` inlines 22KB of compiled CSS into
  all 111 course pages. That is what makes minifier cost scale with page count,
  and an external stylesheet fixes build time and page weight together.
