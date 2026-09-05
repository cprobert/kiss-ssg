---
branch: claude/kiss-ssg-skills-8umyo8
base: main
status: open
opened: 2026-09-05
---

# Session — 2026-09-05: Dependency-aware incremental rebuild

## Intent (captured at /branch-open)

**Objective:** Replace the watcher's two-way "matched page, else whole site" rebuild dispatch with a dependency-aware invalidation system, so an edit under `src/` rebuilds exactly the pages it can affect — written as a reviewed plan first, then implemented on this branch.

**Success criteria:**

- [ ] A plan lands in `planning/plans/` (with a `planning/specs/` design doc if the design warrants separating), and the operator approves it at a `/branch-pulse` before any `lib/` file changes.
- [ ] The plan is verified against the code as it stands, not as remembered: every claim about current behaviour cites `lib/watcher.js`, `lib/kiss.js` or the relevant `AIKB/` doc, and every proposed step names the test that will prove it.
- [ ] Editing a partial or layout rebuilds only the pages that use it — proved by a test asserting the unaffected pages' outputs are byte-identical afterwards, not merely that the affected page changed.
- [ ] Editing a model or a controller rebuilds only the pages it feeds, including `.pages()` / `.scan()` fan-out.
- [ ] Creating a page file picks it up without a process restart, and deleting one removes its output — both under `watch()`, without falling back to a whole-site `_replay()`.
- [ ] An asset or Sass change re-copies/recompiles only what changed, with the `.scss` partial case explicitly decided and documented rather than left to fall out of the implementation.
- [ ] Any edge the graph cannot resolve rebuilds the whole site **and** logs a notice naming the file it could not resolve — with a test asserting both halves, so untracked edges surface as fixable gaps rather than silent slowness.
- [ ] No dev-loop regression: `_replay()`'s orphan pruning, its sitemap re-run, and the `_generating` / `_replayQueued` coalescing still hold under the new dispatch, evidenced by the existing integration tests staying green.
- [ ] Every new or changed `lib/` module ships its `test/unit/` sibling and its `AIKB/` doc in the same commit; `npm run gates` green.

**Non-goals / out of scope:**

- Cold one-shot builds. This is watch-mode dispatch; `.generate()` / `.complete()` semantics for a fresh build are untouched, and nothing caches to disk across process restarts.
- Browser-side hot module replacement — livereload stays a full page reload.
- New SSG features: no new helpers, and no new public config surface beyond what invalidation strictly requires.
- Reworking the docs site (`src/`, `docs.js`) or the published docs output.

### Open questions the plan must answer (not decisions taken here)

- **ESM module caching.** `import()` caches by URL, so a re-imported controller or `.js` model is the old code. "Rebuild only the pages this controller feeds" is hollow until this is confronted — the plan states how it handles it (cache-busting query, or an explicit limitation), it does not leave it implicit.
- **What the graph can actually see.** Handlebars resolves `{{> partial}}` at render time, and a partial name can be dynamic. The plan must say how edges are collected and what it does with the ones it cannot see — feeding the fallback rule above.
- **Where invalidation lives.** A new `lib/` module versus growing `lib/watcher.js`, judged against the repo's one-responsibility-per-file rule.

**Impact surface:** engine internals — `lib/watcher.js` and `lib/kiss.js` change while the public API does not. If invalidation turns out to need a config key or a `watch()` option, that promotes the branch to **public API** (minor bump, `llms.txt` + `README.md`), and is recorded as an Amendment below rather than absorbed silently.

**Expected shape:** between — the destination is named (dependency-aware invalidation over four surfaces, with a safe warning fallback), but the route is emergent: the graph's shape can only be settled by finding out what Handlebars, the model resolver and the controller resolver can actually be asked.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-09-05 — branch restarted from `main`.** The designated branch name carried the ten already-merged commits of the previous session (PR #4 → `v2`, then PR #3 → `main`). `git diff HEAD origin/v2` and `git diff origin/main origin/v2` were both empty, so the branch was reset onto `origin/main` rather than stacked on merged history. `v2` and `main` are byte-identical today; the operator chose `main` as this branch's base, set locally via `git config kiss.baseBranch main`.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->
