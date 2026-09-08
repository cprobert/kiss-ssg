---
branch: claude/a1k9-bootstrap-tailwind-m1uwni
base: main
status: closed
opened: 2026-09-07
---

# Session — 2026-09-07: Asset Pipeline Hook

## Intent (captured at /branch-open)

**Objective:** Give kiss-ssg a generic, documented asset pipeline hook —
`config.assets.pipeline` — so a consuming site can run an external tool
(Tailwind first, anything with a command line next) before the asset copy, in
production builds and under `watch`, without kiss knowing what the tool is.

**Success criteria:**

- [ ] `config.assets.pipeline` accepts an ordered list of steps
      `{ name?, run, watch?, cwd? }`. Every `run` executes, in order, before the
      construction-time asset copy, and again before the copy on every whole-site
      `watch` rebuild. A non-zero exit fails the build: `complete()` rejects and the
      failure is named `<pipeline: name>` in `err.failures` and `report().failures`.
- [ ] In `dev: true`, a step's `watch` command (when given) is spawned once, after
      its `run` succeeds, kept alive for the session, and killed by `close()`. Its
      output goes through the logger. A watch process that dies on its own is
      logged, not a build failure.
- [ ] Each command inherits `process.env` plus `KISS_BUILD`, `KISS_ASSETS` and
      `KISS_DEV`, and runs in `cwd` (default `process.cwd()`).
- [ ] `report()` gains an additive `pipeline: [{ name, ok, duration }]` field.
- [ ] `kiss-ssg check` runs the pipeline like a build does.
- [ ] `lib/pipeline.js` has a `test/unit/pipeline.test.js` sibling; the wiring in
      `lib/kiss.js` is covered by an integration test (report field, failure path,
      dev-mode watch spawn and close).
- [ ] `examples/10-asset-pipeline.js` demonstrates the hook with a dependency-free
      `node -e` step, wired as `npm run eg10`.
- [ ] `AIKB/pipeline.md` exists and is in CLAUDE.md's table; `llms.txt`, `README.md`
      and `types/` describe the new config key; `npm run gates` is green.
- [ ] Proven on a real site: `Gaynor-Probert/a1k9training` builds its Tailwind
      stylesheet through the hook, and a template edit under `watch` reaches the
      browser (Playwright-verified from the a1k9 repo).

**Non-goals / out of scope:**

- An image pipeline, a PostCSS binding, or any tool-specific integration.
- Re-running `run` on scoped (single page / partial) re-renders; tools that must
  see template edits use `watch`.
- Changing how `copyAssets`, the manifest or `assets.hash` work.
- The version bump and CHANGELOG entry (`/branch-close`, operator-run).

**Impact surface:** public API — a new `config.assets` key and a new report
field, observable by every consuming site. Obliges `llms.txt`, `README.md`,
`types/`, and a minor (prerelease) bump at close.

**Expected shape:** planned — the shape was designed against a1k9's needs before
the branch opened; the route (new `lib/pipeline.js`, wiring at the three points
in `lib/kiss.js` where the asset copy is queued, replayed and closed) is mapped.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-09-07 — directory index URLs gain a trailing slash.** Found on `Gaynor-Probert/a1k9training` while proving the pipeline hook: a page built to `courses/index.html` canonicalised to `https://site/courses` — `toURLKey` dropped the trailing `index` segment and `toAbsoluteUrl` then trimmed the trailing slash — and the sitemap `<loc>` matched it. Netlify, GitHub Pages and nginx all serve that directory at `/courses/` and answer the bare `/courses` with a 301, so every canonical and every section-index sitemap entry pointed at a redirect, against Google's guidance that a canonical must be the URL that returns 200. a1k9training was regex-patching its own `sitemap.xml` after each build to work around it. Fixed in the engine instead: `toAbsoluteUrl` now preserves a trailing slash and turns a trailing `index(.ext)?` segment into one, and `canonical`/`lib/sitemap.js` reduce the page URL with a new `utils.toCanonicalPath` (extension only) rather than `toURLKey`. `toURLKey` and `isActive` are untouched — page identity is unchanged. **This is a behaviour change on every consuming site**: emitted canonical and `<loc>` URLs for index pages now end in `/` (and under `extensionLess: true` that is every page but the home page), so it must be called out in the CHANGELOG entry at close. Absorbed on this branch rather than split off, because the operator's brief for this branch is to make kiss meet client-site needs, and this is one of them.

## Pulse log

- **2026-09-07 — proven on a1k9training.** Tailwind v4 runs through `config.assets.pipeline` for `npm run build`, `kiss-ssg check` (reports the step) and `npm run dev`. Playwright gate `qa/dev-watch.mjs` in that repo: 9/9 — server up, hashed stylesheet served, watch spawned, an edited partial produced a new utility in the compiled CSS, the re-copied asset got a new hash, livereload showed the edit, the style applied, no process left after `close()`. One lesson folded back into the docs: Tailwind's watch needs `--watch=always` because the child has no stdin. Decision: continue; remaining criteria are the operator's close.

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-09-08: The Asset Pipeline, and the Gate That Earned Its Keep

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** `config.assets.pipeline` and `lib/pipeline.js` (`621baa8`), directory-index canonical/sitemap URLs gaining a trailing slash (`6f005aa`), the bump to `2.0.0-beta.0` (`d398e89`), and a Windows watch-tree kill fix found by the closing gates (`29100d2`). Seven commits on `main..HEAD`.

## Reflect — what the session was

The branch was **planned**, and accurately so: the intent named the route ("new `lib/pipeline.js`, wiring at the three points in `lib/kiss.js` where the asset copy is queued, replayed and closed") and that is the route it took. The shape served the work.

But the branch is really **three sessions, not one**, and that fact is what everything else hangs on. An authoring session (five commits, all timestamped `+0000` from a Linux environment) built and proved the feature. A separate session opened `feat/markdown-config` against a stale `main`. This session closed the branch, on Windows 11. The intent artefact is what let the third session pick up the first's work without reconstructing it from the diff — the strongest argument for this ritual the repo has produced so far.

Two pieces of drift, handled differently and both correctly: the trailing-slash fix was absorbed as a dated **Amendment** (right — it was found while proving the pipeline on a real site, and it fits the "make kiss meet client-site needs" brief), and the Windows defect was absorbed as a close-time fix (right — a branch cannot close red).

## Evaluate — how the human supervised the AI

**Verification & ownership — the standout dimension, and a genuinely two-sided story.** The pulse log records real verification: a Playwright gate (`qa/dev-watch.mjs`) run against `Gaynor-Probert/a1k9training`, 9/9 — server up, hashed stylesheet served, watch spawned, an edited partial producing a new utility in the compiled CSS, no process left after `close()`. That is not a summary being accepted; that is the generated site actually being looked at, on a real consuming repo.

And it still missed the defect — because **every one of those checks ran on Linux**, where `detached` plus `process.kill(-pid)` works and the bug is invisible. The pulse concluded "continue; remaining criteria are the operator's close" while the branch carried a defect its _own test suite_ would catch on another platform. Nineteen of twenty-one pipeline tests passed here; the two that failed were precisely the two requiring a grandchild process to die. `close()` hung, and five orphaned `node -e` processes were still running when I looked.

This is the clearest evidence the repo has that the **summative** gate is not ceremony. `/branch-pulse` is formative and ran `npm test` in the environment it had; `npm run gates` at close ran it in the environment that mattered. The ritual's own step ordering — gates before the reflection, "there is no value in reflecting on a branch that does not pass" — is what turned a shipped process leak into a fixed one.

**Pushback & steering — consistently active, and it changed outcomes.** Three specific moments. First, the operator did not accept my branch-state assessment, asking to "make sure that we got the latest version here" — which surfaced that the clone had been switched to another session's branch and that npm still served `alpha.5`, so none of the work reached the consuming sites regardless of what was merged. Second, they asked for a consolidation _strategy_ before authorising any action, rather than letting me start closing things. Third, they overrode my version proposal outright: I offered `alpha.6` or "cut 2.0.0", and the answer was "let's go to beta" — a third option I had not surfaced, and the better one, since it signals a settling API without promising stability.

**Learning engagement — present and purposeful.** "Can you tell me what changes we made?" used the agent to build understanding of _another session's_ work before deciding what to do with it. That is the right use of an agent on inherited code, and it made the consolidation decision informed rather than a guess.

**Harness leverage — strong on the ritual, weak on the branch discipline it prescribes.** `/branch-open`, `/branch-pulse` and `/branch-close` were all used as designed, and the close sequenced seven sub-skills correctly. Against that: **three branches were open at once**, two of them intent-only stubs, against CLAUDE.md's explicit "one open branch at a time". That is what produced the "too many moving parts" problem the operator then had to ask how to unpick. The rule was right; it just was not held.

**Where the human intended to supervise versus where they actually did.** The intended checkpoint was the pulse, and it held — it just held in the wrong environment. No checkpoint was waved through and nothing was one-shotted. The gap is not attention; it is **coverage**. The three-beat ritual silently assumes one machine, and this branch was authored on one platform and closed on another.

**Where Claude fell short.** I ran the gates before checking commit provenance. Every commit on this branch is authored `+0000` — visible in one `git log` — and that, combined with a new module calling `process.kill` behind a `process.platform === 'win32'` branch, was a predictable risk I could have flagged _before_ the gate went red rather than diagnosing after. I also offered a two-option version choice when a third was better.

**Competency level: Active supervisor**, with a caveat worth stating precisely. The _infrastructure_ here — CLAUDE.md, `AIKB/`, the three-beat ritual, the rubric, the gate battery, the intent artefacts — is **Agentic engineering lead** work, and it is what made a clean cross-session handoff possible at all. This _branch's_ supervision sat a level below the system it ran inside: real planning, real mid-branch verification, real correction, but a platform blind spot and three simultaneously open branches. The system caught what the supervision missed, which is the system doing its job.

## Feedback — recommendations for next session

**For the pair — the highest-value item.** The ritual has no platform dimension. Add one of: a `windows-latest` leg to `.github/workflows/ci.yml`'s matrix (cheapest, and catches this class permanently), or a `/branch-pulse` prompt to name the platform the evidence was gathered on. Any module touching `process.kill`, `spawn`, path separators or file locking should be treated as platform-divergent by default and gated on both. This branch is the proof case: a feature verified 9/9 on a real site still shipped a process leak.

**For the human.** Hold the one-open-branch rule; it is in CLAUDE.md for exactly the reason it bit here. When a second idea arrives mid-branch, the Amendment mechanism — used correctly for the trailing-slash fix — is the tool, not a new `/branch-open`. Concretely: run `git branch -vv` and confirm nothing else is open before running `/branch-open`.

**For Claude.** Check commit provenance (`git log --format=%ad`, author, timezone) at Step 1 of a close on inherited work, and say plainly when the authoring environment differs from the closing one — _before_ running the gates, as a risk, not after, as a diagnosis. And when offering a bounded choice, include the adjacent option rather than only the two poles: "alpha.6 or 2.0.0" omitted "beta", which was the right answer.

**Technical, for the record.** `shell: true` means the child is a shell and the tool is a grandchild. POSIX solves this with `detached` plus a `-pid` group signal; Windows has no process groups and needs `taskkill /T /F`. `AIKB/pipeline.md` had recorded the surviving grandchild as "the platform's own limitation, not one this module can paper over" — a plausible-sounding claim that was simply wrong, and the kind of thing an AIKB Non-obvious-behavior note can entrench if nobody tests the platform it describes.

## Verdict — did we achieve the objective?

**Objective met.** The brief was a generic, documented asset pipeline hook that runs external tools before the asset copy, in production builds and under watch, without kiss knowing what the tool is. That is what shipped.

- [x] Ordered `{ name?, run, watch?, cwd? }` steps; every `run` before the asset copy and again on whole-site watch rebuilds; a non-zero exit fails the build as `<pipeline: name>` — unit and integration tests green.
- [x] `dev: true` spawns `watch` once after `run` succeeds, ended by `close()`; a watch dying on its own is logged, not a failure. **True on POSIX from `621baa8`; true on Windows only from `29100d2`.**
- [x] `process.env` plus `KISS_BUILD` / `KISS_ASSETS` / `KISS_DEV`, in `cwd`.
- [x] `report()` gains an additive `pipeline: [{ name, ok, duration }]`.
- [x] `kiss-ssg check` runs the pipeline like a build does.
- [x] `test/unit/pipeline.test.js` (21) and `test/integration/pipeline.test.js` (9); the coverage gate passes.
- [x] `examples/10-asset-pipeline.js`, wired as `npm run eg10`.
- [x] `AIKB/pipeline.md` present and in the CLAUDE.md table (`test/aikb.test.js`, 92 passed); `llms.txt`, `README.md` and `types/` updated. `npm run gates`: all five green.
- [x] Proven on `Gaynor-Probert/a1k9training` — Tailwind v4 through the hook for build, check and dev; Playwright 9/9.
- [x] **Amendment delivered:** directory-index canonical and sitemap URLs now end in `/`, documented in `AIKB/utils.md`, `README.md`, `llms.txt` and the CHANGELOG as a behaviour change.

**Measurable impact.** A consuming site can run any command-line tool as a build step, with its output copied, hashed and served like any other asset, and its watch process ending with the site. a1k9training can delete the `sitemap.xml` regex patch it ran after every build. Canonical links and `<loc>` entries now name URLs that return 200 rather than 301.

**What remains open.** Publishing — `2.0.0-beta.0` is bumped but not on npm, and until it is, neither a1k9training nor diploma-msc sees any of this. CI has no Windows leg, so this class of defect is still caught only by whoever happens to close a branch on Windows. And separately from this branch, `feat/markdown-config` and `claude/kiss-ssg-skills-8umyo8` remain open as intent-only stubs awaiting the consolidation plan.
