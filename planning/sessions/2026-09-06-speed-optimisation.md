---
branch: claude/library-speed-optimization-dx73qq
base: main
status: open
opened: 2026-09-06
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

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->
