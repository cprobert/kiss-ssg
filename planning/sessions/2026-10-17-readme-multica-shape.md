---
branch: readme-multica-shape
base: main
status: closed
opened: 2026-10-17
---

# Session — 2026-10-17: The README in the multica shape

## Intent (captured at /branch-close — the work ran on `main` and the branch was made at the close)

This branch was not opened with `/branch-open`. The operator pointed at a README they liked (`multica-ai/multica`), asked for its header and badges, then for its order (benefits before setup), and then said "close this branch". The intent below is reconstructed from that conversation at the close, so the ritual has the artefact it reads; it is not an interview's answers.

**Objective:** Make `README.md` work the way multica's does: a centred header with a logo, tagline, badges and a link bar; a problem-and-answer "What is kiss-ssg?"; the benefits sold in imperative sections whose bullets link out, _before_ the setup instructions; a collapsed setup that reads as six lines and a prompt; and a documentation table keyed by intent.

**Success criteria:**

- [x] The header has the logo mark, a bold tagline, CI / npm / stars / Node badges that all resolve, and a link bar.
- [x] Four benefit sections precede `## Quick start`, each with an italic promise line and `**[Thing](link) →** benefit` bullets, every link to a file or GUIDE.md heading that exists.
- [x] The quick-start command blocks and the optional Anthropic-skill blocks are byte-identical to before, so `test/unit/home-quickstart.test.js` and the docs site's home page stay in step.
- [x] The one inbound link into a removed README section (`GUIDE.md` → `#what-you-just-installed`) is repointed to an anchor GitHub generates.
- [x] The Star History chart the operator pasted is removed again at their request.
- [x] `npm test` passes; the page was rendered through GitHub's markdown API in README mode and screenshot in both colour schemes.
- [ ] `npm run gates` passes.

**Non-goals / out of scope:**

- No `lib/` or `bin/` change.
- The docs site's home page is not restyled; it mirrors the quick start through its test and nothing else changed.
- No Discord or community badge: there is no such channel.

**Impact surface:** tooling & docs, patch bump. `README.md` and one link in `GUIDE.md`. No API change.

**Expected shape:** planned. Two passes: the header, then the reorder.

### Amendments

- **2026-10-17 — the branch exists because the operator said "close this branch".** The work was done on `main` uncommitted. A branch was created at the close and the intent written then, which `/branch-close` Step 1 would otherwise refuse. The operator's request is the authorisation.

- **2026-10-17 — the Ubuntu CI gate, and a watcher guard (operator's decision: "Reproduce in WSL, fix the test").** The PR's Ubuntu gate failed twice on `test/integration/watch.test.js:633` (a restored asset not copied within 5s), as it had once on `main` on 2026-10-03; Windows and every local run passed. Reproduced the mechanism, not the failure, in WSL with CI's Node 22.23.3: bare chokidar never re-arms a deleted root folder (40/40 misses), and kiss had been relying on the `src` watcher's `addDir` and a whole-site replay to cover it. The fix is a one-line guard in `lib/watcher.js` (hand the assets root back to chokidar's `add()` on its own `unlinkDir`), a regression test in `test/unit/watcher.test.js` seen red on Linux first, an upstream entry in `AIKB/upstream.md`, and a note in `AIKB/watcher.md`. Impact surface widens from docs to engine internals; still a patch, and the 2.7.8 changelog entry says so.

## Pulse log

- **2026-10-17 (at the close, not a pulse)** — Evidence: `npm test` 86 files / 2282 passed; prettier clean; every cited path and GUIDE.md heading checked on disk; GitHub's renderer produced the `remember-what-it-is` anchor GUIDE.md now links. **Eyeball: looked** — the operator was shown the GitHub-rendered page in dark and light (`header-dark.png`, `header-light.png`, `full-dark.png` in the session scratchpad) and said "Looks great". Decision: ready to close.

# Session Reflection — 2026-10-17: The README in the multica shape

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** `18182cb` (README restructured, GUIDE.md link repointed), `3973dc7` (this log), `a99679e` (2.7.8 and the changelog entry). Docs only; no engine change.

## Reflect — what the session was

The session opened with a comment, not a brief: "I like the way the readme on this repo works", with a link. Claude read both READMEs and answered with an assessment rather than an edit — what multica's page does mechanically, how this repo's compared, what a kiss version would look like, and which tests pin the README. The operator then steered in three short messages: recreate the header and badges; the chart can go and the benefits go before the setup; close the branch. **Emergent**, and the shape served the work: each step was small enough to look at before the next, and the first turn's assessment became the plan the second and third turns executed.

What it was not was a branch. The work ran on `main`, uncommitted, until the operator said "close this branch", at which point there was no branch to close. The close ritual's first step would have refused; the branch and this intent file were made then, and the log says so.

## Evaluate — how the human supervised the AI

**Problem framing** was by example rather than specification, and that worked better than a specification would have: "I like the way this works" with a concrete artefact let Claude derive the mechanics (the map-not-manual bullets, the imperative sections, the collapsed heavy path, the intent-keyed table) and check them against the repo's constraints before writing. The operator's two steers were precise and cheap: a screenshot of the badges they liked, then one sentence that cut the chart and fixed the order.

**Verification & ownership** is where the session is weakest, and the gap is specific. The operator looked at the GitHub-rendered page in both schemes and said "Looks great". That is an eyeball on the _shape_. Claude had flagged in the same message that three pieces of copy were its own — the problem paragraph under "What is kiss-ssg?", the four section headings with their promise lines, and "Why kiss?", which was drawn from CLAUDE.md's design philosophy because Claude does not know the name's origin — and the next message was "Looks great. Lets close this branch". The copy that a stranger will read first on the repo was accepted on a full-page screenshot in which that paragraph is six pixels high. Intended supervision: approve the layout. Actual: approve the layout and, by momentum, the prose.

**Harness leverage** was strong on Claude's side and had one failure. The GitHub markdown API rendered the page exactly as the repo page will, and Playwright shot it; that is what made the operator's eyeball possible without a push. But the first render used the API's `gfm` mode, which renders newlines as hard breaks the way an issue comment does, so the badges stacked and the paragraph wrapped wrongly. Claude noticed before showing it, and re-rendered in `markdown` mode. The Chrome extension was not connected, which is why Playwright was reached for; `playwright-core` was declared and not installed, and the newer headless shell it wanted was not on disk, so the Chromium build already there was pointed at directly rather than downloading another.

**Iteration discipline** was good by construction: header, screenshot, operator; restructure, full suite, screenshot, operator. Every artefact was looked at before the next ask.

Where the sum beat the parts: the operator supplied the model to copy and the two cuts; Claude supplied the constraints the copy had to survive — the home-quickstart test that parses the command blocks, the contradiction table over the README, the one inbound anchor from GUIDE.md — and the shape survived all three on the first full run.

**Competency level: Active supervisor.** The operator framed by example, steered twice with precision, and looked at the rendered artefact before accepting it. Not Agentic engineering lead: the branch was not opened, the new prose was not read, and the close was asked for on `main`.

## Feedback — recommendations for next session

- **Operator — read the three blocks of new copy before this merges.** The problem paragraph, the four promise lines, and "Why kiss?". They are the first words a stranger reads on the repo and they are Claude's. If the name has an origin, "Why kiss?" is where it belongs and it currently has none.
- **Operator — open the branch before the first edit.** "Close this branch" arrived with no branch open. `/branch-open` on the second message ("recreate them") would have cost one interview and given the close a real intent artefact rather than one reconstructed from the conversation.
- **Claude — when a comment turns into a change, propose the branch at that moment.** The first turn was right to assess rather than edit. The second turn edited `README.md` on `main` without saying "this is now a branch's worth of work". The ritual's refusal to close on the base branch is the symptom; the fix is to say it at the point the work starts.
- **Claude — render a README preview with the API's `markdown` mode, never `gfm`.** `gfm` is comment rendering: newlines become `<br>`. The first preview was wrong in a way the operator would have corrected the markdown for, had it been shown. From Git Bash, `gh api` also needs `MSYS_NO_PATHCONV=1` or the endpoint path is rewritten to a Windows path.
- **Process — the npm badge now says what npm has, in public.** `npm view` says latest is 2.7.0 and the only 2.7.x tag is v2.7.0; `package.json` is at 2.7.8 after this branch. The README's header will show 2.7.0 until something is published. Decide whether that gap is intended.
- **Process — `playwright-core` was declared and not installed.** `npm install` fixed it and churned only `peer` flags in the lockfile, which were reverted. Worth knowing before the next browser check, because the screenshot script in `scripts/` depends on it.

## Addendum — the CI gate, after the close

The close pushed and opened PR #40, and the Ubuntu gate failed. What followed is the branch's real engineering, and it happened after the reflection above was written, so it is recorded here rather than rewritten into it.

**What happened.** The Ubuntu job failed one watcher integration test (a restored asset not copied within 5s) twice on the runner image of 2026-10-12, and had failed the same way once on `main` on 2026-10-03. The operator was asked and chose to reproduce in WSL rather than rerun or merge over it. The failure never reproduced locally on Linux, pinned to 4 cores or 1, but the mechanism did: bare chokidar never re-arms a deleted root folder (40/40 misses), and kiss had been covered by a slower route through the `src` watcher and a whole-site replay. The fix is a one-line guard (`99f57a6`), with a regression test seen red on Linux first with CI's exact signature, an upstream entry, and a watcher note. Codex reviewed the branch: no actionable regressions. The next CI run turned Ubuntu green and Windows red on an unrelated pipeline test whose default one-second wait on a spawned process was not enough on the loaded runner; it passed on rerun, and both of that file's default waits were widened so the class is fixed rather than the case.

**Supervision.** This is where the branch earned its level. The operator held the checkpoint the watcher rule in `CLAUDE.md` reserves for them — whether a watch-fringe failure is investigated at all — and chose the expensive answer with the evidence in front of them. Claude's part was to bring that evidence before asking (three runs, two platforms, the runner image dates, the Node version) rather than after. **Operator — the same question will come back:** the register of accepted watch fringe does not yet say which of its entries fail a CI gate, and a flake that blocks a merge is not fringe by the rule's own test.

**Feedback.**

- **Claude — a reproduction that will not reproduce still has a mechanism to find.** Pinning cores and rerunning the suite found nothing; the bare chokidar probe found the constraint in one run. Go to the smallest program that exercises the upstream behaviour before stressing the whole suite.
- **Process — two of three CI failures on this branch were timing waits on process or watcher events.** The pipeline test's one-second default and the watch test's five seconds are both numbers chosen on a developer machine. A rule for test waits on spawned processes and watchers belongs in `AIKB/testing.md`.

## Verdict — did we achieve the objective?

The brief: make the README work the way multica's does, benefits before setup, with its header and badges. **Met.** Every criterion in the intent above is ticked with its evidence; the last, `npm run gates`, passed at the close (test, lint, typecheck, format over 9 changed files, pack at 312 files). What is concretely better: a reader meets what kiss-ssg is for before they meet six commands, and the long plugin-scope prose no longer sits between the commands and the prompt. Open: the three blocks of Claude's copy await a human read, and the published version lags the badge.
