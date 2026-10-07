---
branch: fix/asset-copy-partial-record
base: main
status: closed
opened: 2026-10-03
consolidated: 2026-10-07
---

# Session — 2026-10-03: An asset copy that fails partway records what it wrote

## Intent (captured at /branch-open)

**Objective:** an asset copy that fails partway still records every output it already wrote, so a later run removes them and a `git checkout` or bulk delete during `--dev` can no longer leave a stale asset in the build until restart (`AIKB/assets.md`, Known issue, found 2026-10-02).

**Success criteria:**

- [ ] A regression test reproducing the Known issue — a copy fails partway (a source vanishing between fs-extra's unlink and copy), the asset root is then removed, and the already-written output is gone afterwards — **seen red against the unfixed code** before the fix lands.
- [ ] The fix records per file as it is written (or from the source inventory before copying), at the point the gap opens — not a reconciliation pass in the `catch` that has to agree with the main path.
- [ ] Fix the class: every emit path in `lib/assets.js` and `lib/asset-copy.js` (the copy, the Sass compile, the `assets.hash` move, the watch re-copy) is audited for "written before recorded", and each is either fixed or named in the commit as not having the gap, with the reason.
- [ ] `AIKB/assets.md`'s Known issue is replaced by the mechanism that now holds (and `AIKB/asset-copy.md` if its seam moved); the `AIKB/upstream.md` cross-reference to the unlink-first gap still reads true.
- [ ] The fleet under `C:\Code\kiss` builds identically on `main` and on the branch (a `main` worktree, junctions, `check`'s own `diffReports`, `pipeline[].duration` masked), each site's git tree clean before and after.
- [ ] `npm run gates` green, exit code read, not filtered stdout.

**Non-goals / out of scope:** working around fs-extra's every-copy unlink-first gap itself (that stays documented in `AIKB/upstream.md`, per the upstream rule); changing the copy-beats-Sass precedence; any change to `copyAssets`' return shape or to what a site can observe on a successful build.

**Impact surface:** engine internals — `lib/assets.js` (and possibly `lib/asset-copy.js`) behaviour on a failure path, API unchanged; patch bump.

**Expected shape:** planned — red test from the recorded reproduction, per-file recording, sibling audit, docs.

**Delegation convention:** none: one session. Agents never commit.

### Amendments

**2026-10-03 — absorbed at the close: a source that changes type during `--dev`.** The second-opinion review of `d36bedc` found a pre-existing member of the same family: when a source folder becomes a file of the same name, or a file becomes a folder, the copy fails on its own stale output from the previous shape (fs-extra refuses file-over-directory and directory-over-file), and that output is only removed after a copy succeeds, so every rebuild fails until restart. An empty folder kiss left behind (it never removes output directories) blocks a later file the same way. Operator chose to absorb it here rather than defer. Shape: before fs-extra's own check, the copy clears a conflicting path at a destination only when everything there is this copy's own output (or an empty folder), never a foreign file; red-first tests for both directions, with and without a registry. The close reruns from Step 1 afterwards.

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-10-03: An asset copy that fails partway records what it wrote

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 2.7.2 on `fix/asset-copy-partial-record`. An asset copy now records every output before writing it and hands what a failed run wrote to `manifest.unrecorded()` (`bf52b9f`, `8ed1af5`). A directory is never recorded for removal (`d36bedc`, `41b90a2`). A source that changes type clears its own previous output (`a225be3`). `ENOTDIR` counts as gone, and the Sass write clears the way too (`3371ed8`). Docs, version and a test fixture: `dcc1431`, `0abfd82`, `4304f7d`.

## Reflect — what the session was

The framing was tight. The defect came in with a recorded reproduction (`AIKB/assets.md`, Known issue), and the open settled the fix shape (record per file as written, not a cleanup pass when a copy fails), the fleet criterion and the surface in three structured answers. The work started **planned** and was, for its first half: red test, fix, sibling audit, docs, fleet, all inside one "Proceed".

It turned **emergent at the close**, and the close became most of the branch. Four review passes ran there (security, Codex, then two fresh-context reviewers), and three of them found a real defect. Each defect sat in a mechanism this branch had just added:

- The first fix recorded a directory for removal, which put a watch session into a permanent failure loop. Codex found it (P2).
- The guard for it had no test of its own.
- The absorbed type-change clearing failed on POSIX with `ENOTDIR`, which every Windows run hides.
- The Sass compile runs before the copy, so the clearing never reached it.

So the planned shape held for the defect we set out to fix. The _new deletion routes_ that fix created are where the design was found wanting, at the boundary rather than mid-branch.

## Evaluate — how the human supervised the AI

**Pushback & steering was the discriminating dimension, and it was strong.** The operator took Claude's recommended option at every routine fork (fix shape, fleet, surface, patch bump, security review). They went _against_ it twice, and both times the departure found what Claude's recommendation would have shipped without:

- **Fresh Claude reviewer, not "proceed and record the gap".** When Codex hit its usage limit, the operator chose a fresh-context reviewer over recording the gap. That reviewer found the untested guard and the pre-existing type-change defect.
- **Absorb, not defer.** The operator chose to absorb the type-change defect rather than defer it. The second reviewer then found `ENOTDIR` in that work, which would have failed the Ubuntu CI leg after merge had the absorbed work been reviewed less.

That is the session's real "sum beat the parts" moment. Claude's recommendations optimised for closing; the operator's two overrides optimised for being right, and each one paid.

**Learning engagement was present and well judged.** Mid-branch, the operator asked how Astro handles the same dev-watching problem. Claude answered from Astro's and Vite's source, not memory: dev serves from source and builds into an emptied folder. The operator rejected the transferable idea ("not for kiss") on design grounds: kiss's dev mode serves the real build, on purpose. They then asked about RAM disks and accepted the answer that one would not have fixed this. Those are architecture questions, not code-acceptance questions.

**Verification & ownership was delegated entirely.**

- The branch was **never pulsed**. Claude named the first pulse as due "once the failing test exists and the fix makes it pass, before the audit", then went straight through the fix, the audit, the fleet and a push without offering it. That one is on Claude.
- At the close, the eyeball was declined: "Not now".
- No diff was reviewed by the operator.

What verified this branch was the ritual's machinery: red-first tests, the gates, five fleet runs, and four agent reviews. That machinery caught a great deal. But **the human intended the ritual to hold a checkpoint mid-branch, and in practice the first human-held checkpoint was the close itself.** By then the review rounds were stacking new mechanisms onto a branch already called done.

**Iteration discipline**, read honestly: Claude ran one long, unpunctuated chain from "Proceed" to a pushed branch. It did then catch its own late-write gap (`8ed1af5`) after the push, so the chain was not unverified, but it had no human checkpoint in it.

**Harness leverage** was good on review and weak on cadence. Sub-agents were used well for fresh-context review, and the reviewers measured rather than guessed: a `git archive` copy, a WSL errno check, mutation runs. The pulse was the tool that was missing.

**Competency level: Active supervisor.** It's earned on framing and on the two overrides that changed the outcome, with verification the clear gap. Every check of this branch was done by an agent, and the human looked at none of the artefacts.

## Feedback — recommendations for next session

- **Claude — offer the pulse at the boundary you named, before continuing.** This branch's own open said when the first pulse was due, and Claude worked straight past it on a "Proceed". When a slice lands (the red test turns green), stop and offer `/branch-pulse` in one line before starting the next slice, even inside a blanket "proceed".
- **Claude — give every new deletion route its own adversarial read before committing it.** All three defects found at the close were in code that deletes: recording a directory for removal, clearing a type conflict, and a `ENOTDIR` path through that clearing. The question that finds them is the one the security reviewer asked: what does this delete, when, and on which platform does the error differ? Ask it of the diff, with a fresh-context agent, before the commit rather than at the close.
- **Claude — when a rule change breaks one fixture, sweep its siblings before committing.** The empty-folder rule broke "names the write". Claude fixed that one test and committed, and the gates then failed on `watch-failure-lifecycle.test.js:152`, the same empty-folder-obstacle pattern. One `grep` for `ensureDir` at an output path would have found it first. This is `CLAUDE.md`'s "fix the class, not the case" recurring in the test suite rather than in `lib/`.
- **Claude — a platform-sensitive error code gets a test that fails on the dev platform.** `ENOTDIR` versus `ENOENT` was invisible on Windows. The fix that works is the one this branch landed: make `fs.unlink` answer the POSIX way in the test. Reach for that emulation whenever code branches on an `error.code`.
- **Operator — take the pulse when it is offered, and the eyeball when it is asked.** The close spent four review rounds on things a mid-branch pulse with a look at `lib/assets.js` might have surfaced while they were cheap. The one look worth thirty seconds this time was the `CHANGELOG.md` 2.7.2 entry: it is the only text a site owner reads, and it makes claims (dev-only, nothing of yours deleted, empty folders removed).
- **Process — the format gate cannot see uncommitted work.** `scripts/gates.mjs` diffs against the base's committed history, so it checked one file while eight uncommitted ones went unseen ("format — 1 changed files"). Claude caught it by hand, and `lib/assets.js` did have a format issue. The gate should include working-tree and untracked changes (`git diff --name-only HEAD` plus `git ls-files --others --exclude-standard`), or say plainly that it checked only committed files.
- **Process — CI does not run on a feature-branch push.** `.github/workflows/ci.yml` triggers on pushes to `main`/`v2` and on PRs, so the real POSIX check for a platform-sensitive fix arrives only at the PR. For a branch whose fix depends on the platform, open the PR as a draft early, or add the branch pattern to `push:`.
- **Both — a rate-limited reviewer is a gap to record, not one to fill with the same model.** The fresh Claude reviewers were valuable, and they found real defects. But they are the same family as the author, and `3371ed8` has had no review beyond its tests. Re-run the Codex review on `d36bedc..HEAD` after 14:15, on the PR.

## Verdict — did we achieve the objective?

**The brief:** make an asset copy that fails partway record every output it wrote, so later runs remove them and a `git checkout` during `--dev` cannot leave a stale asset.

**Met, and the objective moved.** The type-change defect was absorbed by the operator's decision (Amendment). That was good drift: it is the same family of bug, it predated the branch, and absorbing it is what exposed the POSIX defect before merge rather than after.

- [x] **A regression test that reproduces the Known issue, seen red first.** Five unit tests failed against the unfixed code. The AIKB reproduction (a 20 ms delay injected into fs-extra) failed 5/5 runs without the fix and passed 5/5 with it.
- [x] **Records per file as written, not a cleanup pass when a copy fails.** `touched` is filled before each write; `stopped` makes sure nothing new starts writing after the failure is recorded.
- [x] **Fix the class.** All four writers are fixed (copy, Sass, hash move, stale unlink). `asset-copy.js` and `rebuild.js` write nothing themselves. The class then grew at the close: "something recorded for removal that is not a regular file", `ENOTDIR`, and a type conflict meeting a Sass write.
- [x] **The Known issue in `AIKB/assets.md` is replaced by how it works now.** `AIKB/asset-manifest.md` covers `unrecorded` and `owns`. The `AIKB/upstream.md` reference still holds.
- [x] **The fleet builds the same on `main` and the branch.** Five sites and 50 pages were identical on every `lib/` commit re-run, the last one `4304f7d`, with each site's git tree clean before and after.
- [x] **`npm run gates` passes, read by exit code.** All five gates pass locally on `4304f7d`. The Ubuntu CI leg runs on the PR.

**Measurable impact:** four ways a `--dev` session used to need a restart now recover on their own:

- a partial copy;
- a file colliding with an output folder;
- a folder replaced by a file, or a file by a folder (on all platforms);
- a stylesheet in a former file's folder.

**Still open:**

- The Codex re-review of `d36bedc..HEAD`.
- The Ubuntu CI result on the PR.
- No human has looked at any artefact.
- One known edge: a file appearing between the clearing's `readdir` and its `rmdir` stops the clearing, safely, but no test covers it.

### Addendum — after the PR opened (2026-10-03)

- **Ubuntu CI passed on the PR at `4304f7d`** (run 37114624135). That was the first real POSIX run of the `ENOTDIR` fix.
- **The operator ran `/codex:review`** once the usage limit allowed. It found one more P2 in the clearing (`site.scss` beside a folder `site.css/`): the compile wrote and claimed the stylesheet, the copy's filter then cleared it as this copy's own output in the way, and the build reported success with no stylesheet.
- **Fixed in `90f7f20`.** `ownsOutput` is false for anything in `touched`, so clearing only touches output a previous run left. The test asserts that every stylesheet reported compiled is still a file on disk, and it was seen red in all three shapes.
- **The operator then asked for a loop until green.** One round was enough:
  - gates pass;
  - the fleet is identical (50 pages);
  - Codex on the whole branch: "No actionable regressions were identified";
  - CI passed on `ubuntu-latest` and `windows-latest` at `90f7f20` (run 37116725218).
- **Feedback this confirms.** This was the fourth defect found at the close in code that deletes files, which confirms the reflection's main recommendation. It was also the operator's third override that paid: running Codex when Claude's plan had been to merge with the gap recorded.
- **Still open:** no human eyeball, and the untested `readdir`/`rmdir` edge.
