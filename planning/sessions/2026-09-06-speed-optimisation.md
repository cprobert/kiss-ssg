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

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->
