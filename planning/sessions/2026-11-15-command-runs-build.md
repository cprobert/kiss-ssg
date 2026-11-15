---
branch: feat/command-runs-build
base: main
status: open
opened: 2026-11-15
issue: 90
scope: planning/**, lib/**, bin/**, test/**, types/**, examples/**, starter/**, scripts/**, AIKB/**, plugins/kiss-ssg/**, src/**, GUIDE.md, llms.txt, README.md, CHANGELOG.md, CONTRIBUTING.md, CLAUDE.md, package.json, package-lock.json
---

# Session — 2026-11-15: Phase 2, the command line owns the process

## Intent (captured at /branch-open)

**Objective:** Deliver the roadmap's Phase 2 (2.18). `kiss-ssg build`, `dev` and `check` run a site's build script, so neither the starter nor any example carries failure boilerplate. The design is researched and written first, and the operator approves it before code is built on it.

**Success criteria:**

- [ ] **Peer research, from current docs.** A note in `planning/` answers four questions for each of Eleventy, Astro and Hugo, with the URL each answer came from: how the config or build script is loaded (in-process or as a child process; CommonJS and ESM), how an environment or mode is named, what happens when the config file is edited during dev, and the exit code and output of a failed build. This closes the roadmap's Risks row ("peer practice cited here is from memory").
- [ ] **Fleet inventory in the design.** Every v2 site's entry script, module type, positional arguments, dev spelling, and the steps before and after the build in its npm scripts (measured 2026-11-15, see Assumptions). The design states how each shape runs under the command.
- [ ] **Baselines before any engine change.** A Sonnet clean room of the bakery brief through `scripts/arms.mjs`, recording the attempts to green and the boilerplate it wrote. A fleet-check baseline of `main` (39d4e3a) on the named sites.
- [ ] **Design by Fable, critiqued, approved.** A spec in `planning/specs/` written by a Fable subagent from the research and inventory. One fresh-context adversarial read of the spec alone, then a Codex review, then the operator's approval, all before the first `lib/` or `bin/` edit. Work orders follow in `planning/plans/`, in the roadmap's shape.
- [ ] **The command runs the build.** `kiss-ssg build`, `kiss-ssg dev` and `kiss-ssg check` run any entry script, ESM or CommonJS, and pass its positional arguments through. The command sets the exit code and prints each failure. `dev` restarts when the script is edited. Each behaviour is covered end to end in `test/integration/`.
- [ ] **`node <script>` stays, and gets loud.** A build that exits without `complete()` warns and sets a failing exit code. Red-first test.
- [ ] **Mode passed directly.** The command hands its mode to the engine without env vars. `KISS_CHECK`, `KISS_AIKB` and `KISS_REPORT` keep working as aliases, with tests on both paths.
- [ ] **Four error messages, each with a red-first test.** An unknown `{{link}}` id suggests the nearest one. A failed page is reported once, not once per page linking to it. Failures name the build path, not the staging path. A missing model folder says when a same-named `.json` file exists (#90, the message half).
- [ ] **No boilerplate ships.** `grep -rl reportBuildFailure examples starter` returns nothing (15 files today: `starter/router.js` and 14 example routers). `npm run eg1 … eg15` still pass.
- [ ] **Clean-room exit.** The same Sonnet bakery brief, run on a packed tarball of the branch, reaches a green `kiss-ssg check` without writing any failure handling. Every place it guessed is reported.
- [ ] **Fleet exit.** `node scripts/fleet-check.mjs` from `main` against the branch on diploma-msc, learna-kiss, medulla, metacarpus (CMS sites, using the get-data recipe), a1k9training and oxford-medical. Byte-identical output, or each difference explained. Run through `node <script>` as now and through the new command.
- [ ] **Docs and release.** `GUIDE.md`, one index line per command in `llms.txt`, `README.md`, `npm run types`, the skills that run builds (`kiss-site-new` and any other that writes or runs a router), `CHANGELOG.md` with a `### Upgrading` note for the sites' npm scripts, version 2.18.0.

**Non-goals / out of scope:**

- Removing `node router.js`, or the `KISS_*` env vars. Both are 3.0.
- Issue #90's convention half (a record's `slug` and `name` as defaults). The freeze rules it out, and it stays an open 3.0 question.
- Phase 3's build state and stages. This phase does not restructure `lib/kiss.js`.
- Owning the sites' own steps before and after the build (`get-data`, `pagefind`, purge scripts, `firebase deploy`). They stay in the sites' npm scripts.
- Migrating fleet sites to the new command. That happens after the release, as each site's own upgrade.
- Closing Phase 1 (publishing 2.17.1, merging the four Learna PRs). It runs on the operator's time, in parallel.

**Impact surface:** public API. These are new `kiss-ssg` commands, a changed contract for the build script, and a new failing exit for `node router.js` without `complete()`. Proposed bump: minor, 2.18.0, with an upgrade note.

**Expected shape:** between. The phase's destination is fixed by the roadmap. The route (spawn or import, how a missing `complete()` is detected, how dev restarts) is what the research and design settle.

**Assumptions:**

- Measured (2026-11-15, each site's `package.json` and entry script under `C:\Code\kiss`): eight v2 sites build from `router.js`. metacarpus builds from `new-cohort.js <intake>` and `export.js`. diploma-msc, learna-kiss, medulla and metacarpus are CommonJS. The others are `"type": "module"`.
- Measured (same): the sites pass their own positional arguments (`router production|uat|staging|content`, `new-cohort <intake>`). Dev is spelled `dev` on a1k9training, pro-plumbing, diploma-msc, learna-kiss and medulla, and `--dev` on k9-solutions, swan-love and oxford-medical.
- Measured (same): sites chain steps around the build (`get-data && node router production`; oxford-medical's `node router.js && pagefind && node tools/purge-css.mjs && node tools/version-assets.mjs`; `&& firebase deploy`), so the exit code is load-bearing.
- Measured (same): learna-kiss has a second entry point, `build/watch-polling.js`, which also calls `new Kiss`.
- Measured (2026-11-15, `bin/kiss-ssg.js:133` and `:558`): `check` and `aikb` already run the site's script as a child process with `spawnSync` and `KISS_CHECK=1`.
- Measured (2026-11-15, grep): `reportBuildFailure` is in `starter/router.js` and 14 of the 15 example routers. `examples/4-layouts-and-partials/router.js` handles failure some other way, still to read. There are 15 examples, not the fourteen the roadmap counts.
- Measured (2026-11-15, `planning/reviews/2026-11-09-architecture-review.md:426` and `:429`): the clean room named the missing nearest-id suggestion and the staging path in the starter's reporter. The once-per-linking-page report is the roadmap's third message, to be found in the same review section before it is fixed.
- Inferred: `scripts/fleet-check.mjs` runs the site with `node <entry>`, so proving the new command on the fleet may need an option there. If so, it joins as an Amendment.
- Inferred: `fleet-check --base main` packs the base from git, so the baseline does not wait for 2.17.1 to be published.
- Inferred: Eleventy, Astro and Hugo each restart on a config edit rather than hot-reloading it. To be checked against their docs, not repeated.

**Delegation convention:** this session (Opus) briefs, reviews and commits. A Fable subagent writes the design spec and the work orders from the research, the inventory and the roadmap. Sonnet subagents implement the work orders inside each order's named paths. A fresh-context agent critiques the spec. No subagent commits. The operator's diff review is the checkpoint.

**Independent review:** Codex, three times: on the design spec before any code, at the first engine slice (`/branch-pulse` Step 3), and at the close. Check its credit before the design review.

### Amendments

- **2026-11-15 — scope set at the open: the whole phase, design first** (operator's choice over the recommendation of preparation and design only). Reason given: fewer, larger branches.
- **2026-11-15 — issue #90's message half joins** (operator's choice at the open). The convention half stays out (non-goal).
- **2026-11-15 — opened before Phase 1 closed** (operator's choice). 2.17.1 is unpublished and the four Learna PRs (diploma-msc #504, learna-kiss #196, medulla #127, metacarpus #8) are open. The fleet baseline packs `main` from git, so it does not wait for them.
- **2026-11-15 — the boilerplate count is 16, not 15.** `examples/4-layouts-and-partials/router.js` has the same handling inline in its `.catch`, without the name `reportBuildFailure` (read 2026-11-15), so the grep in the "no boilerplate ships" criterion misses it. That criterion is checked by reading the starter and all 15 example routers, not by the grep alone.
- **2026-11-15 — the design is approved** (`planning/specs/2026-11-15-command-runs-build.md`), after Fable's draft, a fresh-context critique (0 blocker, 1 major, 13 minor) and a Codex review (0 blocker, 3 major, 1 minor), each finding re-derived against the code and folded in. The operator took all eight § 9 decisions as recommended. Two move the intent: **"dev keeps serving the last good build" is narrowed** to the spec's § 5.3 (a script that fails to run leaves the build whole; one that runs with some failing pages leaves a mixed folder and no reload, recorded as a Known known); and **a public `Kiss.mode` joins under the freeze** as the public half of "mode passed directly", paid for by three `llms.txt` cuts, one of them line 139's list of audit findings.
- **2026-11-15 — slice 2's paths widen to `test/integration/lifecycle.test.js`.** Three of its assertions (`:92`, `:662`, `:682`) read the failure messages that spec § 5.2's one-owner rule reshapes. The work order's step 5 grep looked for the removed log lines, not the thrown messages, so it missed them. The branch's `scope:` already covers `test/**`; only the order's path list moves. The advisor's read: the approved spec mandates the change, so this needs no operator decision. The slice 5 Upgrading draft gains two lines: failure messages gain a context prefix where the cause lacked it, and `links.broken` omits links to pages that failed.
- **Read-back:** "a claim stated before it was measured" recurs in the last three logs (2026-11-14 partial transforms, 2026-11-14 markdown-it, 2026-11-15 skipped pages). That is three, the trigger, so `/memory-consolidate` is recommended as its own beat between branches. This branch holds the lesson by marking every assumption measured or inferred, and by citing a URL for every peer-research answer.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-15** — Research and baselines landed (`5ab88b4`, `39ba512`); planning-only diff (4 files), so no tests run; 0 commits behind `origin/main`; `scope-check` exit 0. Criterion 1 (peer research): **partial**, all four questions answered with sources for the three tools, except Hugo's failed-build exit code and Astro's error output, which the note names as not found. Criterion 2 (fleet inventory): partial, measured in the Assumptions and not yet in a design. Criterion 3 (baselines): **met**. The Sonnet clean room was green and wrote 9 of 55 router lines of failure boilerplate; fleet-check `main` against the branch exited 0 on all six named sites, each log's end read by Claude. Criteria 4–12: not yet. No drift: fleet-check copying `.env` into its `--out` folder was noted as out of scope and left alone. **Eyeball: looked** — the operator read "What this settles for the design" in the research note, sent with `SendUserFile`: "reads right". **Offer:** site environments settled as positional pass-through (Eleventy's split) rather than a `--mode` flag; operator: keep. Decision: continue, to the Fable design brief.
- **2026-11-15** — Design approved and committed (`fad6eeb`); planning-only diff (5 files), so no tests run; 0 commits behind `origin/main`; `scope-check` exit 0. Criterion 2 (fleet inventory): **met** in spec § 3, which gives each site's command lines. Criterion 4 (design): **partial**. The spec was critiqued (1 major, 13 minor) and Codex-reviewed (3 major, 1 minor), every finding re-derived by Claude (the IPC hang by Claude's own probe), and all eight § 9 decisions approved; the work orders are still to come. Criteria 5–12: not yet. Drift: two Amendments recorded (the narrowed "last good build"; `Kiss.mode` under the freeze), and no scope widening. **Eyeball: looked**. The operator read spec § 5.3's restart table, sent with `SendUserFile`, and said it "reads right". **Offer:** no Codex re-run on the second revision's § 4.6 (two-copy global state) and § 5.2 (one diagnostic owner per failure); operator: keep, with the slice-1 Codex review as the next independent check. Decision: continue, to Fable's work orders.
- **2026-11-15** — Work orders committed (`0d65fce`); slice 1 committed (`85083b5`, Sonnet, reviewed by Claude): 51 files changed since `main`; 0 commits behind `origin/main`; `scope-check` exit 0; `npm test` exit 0 (156 files, 5161 passed, 10 skipped, no `was built without complete()` in the output); lint, typecheck, format:check exit 0; `aikb.test.js` 327 passed. Red-first, re-run by Claude: `- red-first: test/integration/run-build.test.js failed at main (39d4e3a), 2026-11-15`; the same line for `no-complete`, `run-mode` and `two-copies`. Node 22.23.4 floor probes all matched (Sonnet, via `npx -p node@22.23.4`). Budgets: `coreLines` 34359→34961 and `claudeMdBytes` 36087→36606 worse, as the order expects, until slice 5 re-records them; `llmsTxtChars` 15949, which leaves 48 free for slice 3. Criterion 4 (design): **met**. Criterion 5 (the command runs the build): **partial**; `build`, `check`, `aikb` and `images` are done, `dev` is slice 3. Criterion 6 (`node <script>` loud): **met** (`no-complete.test.js`). Criterion 7 (mode passed directly): **met** (`run-mode.test.js`, `two-copies.test.js`). Criteria 8–12: not yet. **Codex at the first engine slice, two rounds.** Round 1 found 2 major and 1 minor: a hang after an uncaught build failure with a live handle (reproduced by Claude, fixed: close within 5 s, then exit 1) and an unbounded stop (fixed: SIGTERM then SIGKILL). The operator chose a second round against the recommendation; asked for a reason, none given. Round 2 found 1 major: a script-owned subprocess outlives a failed build. It is out of scope under the **operator's parity rule**: under the command a process tree gets what it would get under `node router.js`, and the command must return promptly with the right exit code (measured on Windows: both paths exit 1 in about 1 s). Round 1's POSIX `detached` group-kill was reverted to spec § 5.4, on the advisor's read and the operator's choice. The POSIX stop is unverified until Ubuntu CI. **Test overrun:** about 1,400 test lines against the order's 500–800, kept by the operator; slices 2–5 should expect about 1.75× on tests. **Eyeball: looked**. The operator read the real `kiss-ssg build` output on a failing page, sent with `SendUserFile`: "reads right". **Offer:** one script resolver for all five commands (a mistyped `check` script gets kiss's message, not Node's); operator: keep. Decision: continue, to slice 2.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
