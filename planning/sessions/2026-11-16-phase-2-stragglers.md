---
branch: chore/phase-2-stragglers
base: main
status: closed
opened: 2026-11-16
consolidated: 2026-11-16
scope: lib/check.js, test/unit/check.test.js, test/integration/**, AIKB/**, GUIDE.md, llms.txt, README.md, CHANGELOG.md, CLAUDE.md, plugins/kiss-ssg/**, .claude/skills/branch-pulse/SKILL.md, .claude/skills/branch-close/SKILL.md, .claude/skills/secrets-scan/SKILL.md, planning/**, types/check.d.ts, types/upgrade.d.ts
---

# Session — 2026-11-16: Phase 2 stragglers, inside 2.18.0

## Intent (captured at /branch-open)

**Objective:** Finish the items Phase 2 (PR #97) left open, before 2.18.0 is published, without a version bump. These are the `npm run egN` engine message, the clean room's four doc guesses, the docs sweep's leftovers, and the review range that merged unreviewed. Then change the ritual so a branch cannot reach "ready to close" with items still open.

**Success criteria:**

- [ ] **The egN message is gone, and a real site is unchanged.** `npm run eg3` prints a `kiss-ssg <version> from …` line, not `no node_modules/kiss-ssg found from here`. The clean-room site installed from a tarball still prints `kiss-ssg <version> from node_modules/kiss-ssg`. `kiss-ssg upgrade` and the `build` engine refusal behave as before (tests). The new test is red against `main`.
- [ ] **The clean room's four guesses are answered in what ships.** These are the alias form, bake ids, one model for the listing page, and `check --summary` hiding the exit code. Each is re-derived against GUIDE and `llms.txt`, and either fixed in GUIDE or the right skill, or shown to be answered already (the line quoted). `llms.txt` does not grow beyond 15,995 characters.
- [ ] **The docs sweep's leftovers are settled.**
  - GUIDE's "Waiting for the build" and v1 migration examples lead with `await kiss.complete()` under the commands, with the try/catch shown for plain `node`.
  - The `llms.txt` `.watch()` / `.close()` line names `kiss-ssg dev`.
  - The four "unsure" AIKB claims are each checked against `lib/`, and fixed or confirmed: `aikb.md`/`build-report.md` naming only `KISS_AIKB`, `model-resolver.md:26`, `kiss.md:103`, and `run-state.md`'s "50 test files".
  - `images-sweep.md` lists every import.
- [ ] **The unreviewed range is reviewed.** One Codex round over `fe87d92..2456b5e` (docs, changelog, manifests), with blocking findings fixed here.
- [ ] **The ritual blocks a close with open items.**
  - `/branch-pulse` cannot decide "ready to close", and `/branch-close` cannot write "What's deferred", until every open item is done or has been put to the operator. Open items are Amendment promises, "not fixed", "deferred" and "left alone" lines in the pulse log, and items a review or clean room reported.
  - A non-goal or a blocked item is named with its reason.
  - `test/unit/skill-code-blocks.test.js` passes.
- [ ] **Clean-room exit.** The bakery brief, run through `scripts/arms.mjs` on a tarball packed from this branch, reaches a green `kiss-ssg check`, and none of the four guesses recurs in its report.
- [ ] **Release.** No version bump: `package.json` stays 2.18.0. The 2.18.0 `CHANGELOG.md` entry is amended in place only where something a site sees changes. All six gates pass.

**Non-goals / out of scope:**

- Issue #90's convention half: the feature freeze rules it out until 3.0.
- Moving the fleet sites to `kiss-ssg build` / `kiss-ssg dev`. Sites install from npm, which serves 2.17.0, so it waits for `/kiss-publish`.
- Editing the closed Phase 2 session file: it is a record.
- A fleet check. `describeEngine` feeds only the bin's stderr line, the `build` refusal and `upgrade` (measured below), never what a build writes, so a fleet diff would show nothing. The clean room covers the installed case.

**Impact surface:** engine internals, plus tooling & docs. `describeEngine` gains the repository's own folder, with the API unchanged. The rest is GUIDE, `llms.txt`, AIKB, skills and the ritual. No bump: it ships inside the unpublished 2.18.0 (the operator's decision: "it goes in as the same version number").

**Expected shape:** planned. Every item is named, and only the size of each docs fix is open.

**Assumptions:**

- Measured (2026-11-16, the clean-room site at `scratchpad/cr/arm/exit/site`): `npx kiss-ssg build` exits 0, and its first stderr line is `kiss-ssg 2.17.1 from node_modules/kiss-ssg`. `npm run eg3` exits 0, and its fifth line is `kiss-ssg: no node_modules/kiss-ssg found from here — the script resolves the package some other way`.
- Measured (`lib/check.js:162`): `describeEngine` walks up from the script's folder looking only for `node_modules/kiss-ssg`. The examples import `kiss-ssg` through the package's own `exports` (a self-reference), so it finds none.
- Measured (grep, 2026-11-16): `describeEngine`'s answer reaches `engineLine` (`bin/kiss-ssg.js:577`), the run-script refusal (its JSDoc, `lib/run-script.js:52`) and `ownEngine` (`lib/upgrade.js:281`, bin line 228). Inferred: a self-reference answer must not change what `upgrade` or the refusal decide. Each gets a test.
- Measured (`git tag -l v2.18.0`, `git ls-remote --tags origin v2.18.0`, both empty; `npm view kiss-ssg version` is 2.17.0): 2.18.0 is untagged and unpublished, so it can still change.
- Inferred: the clean room's four guesses are doc gaps, not engine gaps. To be re-derived before any edit.

**Delegation convention:** this session (Opus) briefs, reviews and commits. Sonnet subagents may implement inside named paths. A fresh agent may run the clean room through `arms.mjs`. No subagent commits.

**Independent review:** Codex at `/branch-close`, one round over this branch's diff and one over `fe87d92..2456b5e`, blocking findings only (the operator's choice).

### Amendments

- **2026-11-16 — opened from the operator's correction after PR #97 merged:** "We shouldn't have closed or called for a pull request where they were outstanding straggling actions. Let's address those here on a new branch but it goes in as the same version number." The operator chose all four items, the ritual fix, Codex at the close and the clean-room re-run. **Hold `/kiss-publish` until this branch merges.**
- **2026-11-16 — the scope widens to `types/upgrade.d.ts`.** `npm run types` regenerates it because `ownEngine`'s type refers to `describeEngine`'s return, which gained `self`. The coreLines budget grows by the fix's lines (35655→35704) and is re-recorded in its own commit.
- **2026-11-16 — the scope widens to `.claude/skills/secrets-scan/SKILL.md`; the 2.18.0 CHANGELOG entry is amended in place.**
  - The Codex task over `fe87d92..2456b5e` found five false statements, all re-derived by Claude and fixed in `63f7187`. Three were blocking:
    - the CHANGELOG intro said `dev` exits 1;
    - the CHANGELOG said `check` no longer sets `KISS_CHECK`;
    - the secrets-scan row said a stop kills the process tree on POSIX.
  - The other two were minor: the per-failure lines, and `check.md:17`.
  - The CHANGELOG fix is what "amended in place only where something a site sees changes" allows: it corrects text a site reads through `kiss-ssg upgrade`.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-16** — Slices in: the ritual (`6b5209d`), the engine line (`8b31ce3`), the docs (`166f5c0`), budgets (`c4ad2ab`) and the GUIDE corrections (`eb8e6e9`). 0 commits behind `origin/main`; `scope-check` exit 0; `npm test` exit 0 (5271 passed, 10 skipped).
  - **Criterion 1 (egN line): met.**
    - Measured: `npm run eg3` prints `kiss-ssg 2.18.0 from ../.. (this package itself)`, and the installed clean-room site prints `kiss-ssg 2.17.1 from node_modules/kiss-ssg`.
    - Red-first: `- red-first: test/unit/check.test.js failed at main (2456b5e), 2026-11-16`.
    - `ownEngine` ignores a self answer (tested). The build gate with a self answer is exercised by `examples.test.js`, which builds every example through `bin/kiss-ssg.js build`.
  - **Criterion 2 (the four guesses): met.** Probes in a scratch site; the GUIDE lines are in `166f5c0`.
    - The alias's leading `/` is optional.
    - The listing page shares the file, and `slug=` takes the controller's slug.
    - `--summary` never changes the exit code.
    - The fifth guess, `{{active}}`, was already answered (GUIDE, and example 4's header).
  - **Criterion 3 (sweep leftovers): met.**
    - GUIDE leads with the bare await.
    - `llms.txt` names `kiss-ssg dev` (15995→15994).
    - The AIKB claims: `aikb.md` and `build-report.md` were fixed; `run-state.md` now counts 55; `model-resolver.md:26` is a past incident; `kiss.md:103` is accurate.
    - `images-sweep.md` lists every import.
  - **Criterion 5 (the ritual): met.** `/branch-pulse` Step 6 lists the open items, and `/branch-close` Step 5c blocks the close on them. `skill-code-blocks.test.js` passes.
  - **Criterion 6 (clean room): met on `c4ad2ab`.** Run through `arms.mjs` on a branch tarball, re-checked by Claude:
    - `check` exits 0 with 8 pages and 0 failed, the router holds 0 lines of failure handling, and `_redirects` has `/menu /bakes/ 301`.
    - None of the four guesses recurs, and the nav marks the current page.
    - Its one new guess, "what to call the listing", is answered by GUIDE.md:740 and now also in the `.pages()` paragraph (`eb8e6e9`).
  - **Criterion 4 (review of `fe87d92..2456b5e`): not yet.** It is due at the close, as agreed.
  - **Criterion 7 (release):** no bump, and nothing a site sees changed, so the 2.18.0 CHANGELOG entry stays as it is.
  - **Eyeball: looked, by the advisor at the operator's request** ("Can you ask the advisor? I'm on my mobile."). The advisor found a false claim, made twice, that `kiss-ssg dev` sets the exit code, and named three claims to probe. Claude measured all four: `dev` prints and keeps serving, the listing needs no `path` or `slug`, the `Sour Dough` record had to be named, and an `ok` line can come with exit 1. All four were fixed in `eb8e6e9`. The advisor's read is not confirmation; the probes are.
  - **Offer:** `describeEngine` gives the self-reference priority over `node_modules` (Node's documented order, not measured with both present); operator: keep.
  - **Open items:**
    - (1) The Codex reviews of this branch and of `fe87d92..2456b5e`: **done here**, at the close.
    - (2) The clean room ran on `c4ad2ab`, before `eb8e6e9` changed sections it read: **done here**, re-run on the final tarball before the close.
    - #90's convention half and the fleet migration: **out**, for the freeze and the release.
  - Decision: **continue**, to the clean-room re-run, then `/branch-close` when the operator asks.
- **2026-11-16** — The clean room re-ran on the final tarball (`ae87355`, `stragglers2`, $0.28, 11 turns), re-checked by Claude. `check` exits 0 with 8 pages and 0 failed, and the router has 0 lines of failure handling. It ran `check` a second time without `--summary` "to confirm the exit code", which is the new GUIDE sentence doing its job. None of the four original guesses recurs.
  - Its new guesses:
    - Business facts and `host`: not docs gaps. The audit's `host-unset` names the host.
    - "`folderMatch` … doesn't say that fits this case": answered by GUIDE.md:2356 and :2358 ("a section's nav item stays marked on every page inside it"). It chose correctly.
    - The listing id `bakes`: a documented choice.
  - **Criterion 6: met on the final tarball.**
  - **Open items:** only (1), the two Codex reviews, are left, and they are **done here** at the close. The two **out** items are as before.
  - Decision: **ready to close** once the operator asks for `/branch-close`. Its Step 7 runs the Codex reviews.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-11-16: Phase 2 stragglers, inside 2.18.0

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** The items Phase 2 (PR #97) left open, still under the unpublished 2.18.0:

- `describeEngine` reports the package's own self-reference (`8b31ce3`);
- the clean room's guesses are answered in GUIDE (`166f5c0`, `eb8e6e9`);
- the docs sweep's leftovers are done;
- `/branch-pulse` and `/branch-close` now refuse "ready to close" with open items (`6b5209d`);
- the review of `fe87d92..2456b5e` found five false statements, now fixed (`63f7187`).

## Reflect — what the session was

**The branch existed because of a correction.** PR #97 had merged with four items listed as "What's deferred". The operator said: "We shouldn't have closed or called for a pull request where they were outstanding straggling actions." The shape was planned. The open items were already in the record, and the scope was settled in one multi-select question before `/branch-open`. The two blocked items (#90's convention half, the fleet migration) were named with their reasons rather than carried.

Work ran as two Sonnet agents in parallel on separate files (the engine fix, the docs), with Claude changing the ritual in between. Two pulses followed: one after the slices, one after the clean-room re-run.

**Each review found real defects in text that had already passed the previous one.**

- The first docs agent's GUIDE text passed review by Claude.
- The advisor, reading at the operator's request, found that it said `kiss-ssg dev` sets the exit code. It doesn't (measured: "Still serving ./public…"). The advisor also named three claims to probe, and two of them were wrong as well: the listing example's `path`/`slug`, and "`ok` means exit 0".
- Codex, reviewing the range that merged unreviewed, then found the **same false `dev` claim** in the 2.18.0 changelog. It also found two more blocking errors: `check` still sets `KISS_CHECK`, and a POSIX stop is not a process-tree kill.

None of these would have been seen by a test. All were in the text a site and its agent will read first.

## Evaluate — how the human supervised the AI

**Pushback & steering: the decisive move was the operator's, after the merge.** The operator refused to let "What's deferred" stand as an outcome. The correction was specific: no close or PR with stragglers, and the fix goes in under the same version. It produced the branch, the ritual change (Step 5c, and the pulse's open-items list) and the updated memory. That is steering at the level of the process, not of one diff.

**Verification & ownership: delegated deliberately, and it held.** On mobile, the operator handed the GUIDE eyeball to the advisor ("Can you ask the advisor? I'm on my mobile."). They didn't wave it through. The advisor's read found a false claim that Claude's own diff review had passed. The operator also chose to re-run the clean room. Its second run confirmed the four guesses were gone, and the agent ran `check` a second time without `--summary` "to confirm the exit code", which is the new GUIDE sentence doing its job. The pulse records the eyeball honestly as "looked, by the advisor at the operator's request" and notes that the probes, not the read, are the confirmation.

**Where the operator meant to supervise, against where they did.** They matched. The gap of the previous branch, a PR carrying open items, was the reason for this one. This time the open-items list ran at every pulse and blocked Step 5c, and the PR's deferred section carries only the two **out** items.

**Harness leverage: good.** The session used:

- parallel subagents on disjoint files;
- the advisor as a reviewer when the operator couldn't look;
- `arms.mjs` for the clean room, twice;
- a read-only Codex `task` with the range named in the prompt, because `review --base` can only diff against HEAD.

**Competency level: Agentic engineering lead.** The operator fixed the process that let the gap through, not only the gap. They chose every item and review point up front, and delegated the one look they couldn't do to an independent reviewer instead of skipping it.

## Feedback — recommendations for next session

- **Claude — a sentence about a command's exit code is measured for every command it names.** "Under `kiss-ssg build` and `dev` … sets the exit code" was probed under `build` only. The same false claim was written twice in GUIDE and once in the changelog, and passed Claude's review each time. Run the probe under each command named, or name only the one measured. This is the existing CLAUDE.md rule ("build and measure a sentence about behaviour across every case it covers"), which was broken three times on one claim.
- **Claude — a review of docs reads the changelog with the same suspicion as GUIDE.** The 2.18.0 entry was written from a draft the operator had approved, and nothing checked it against `lib/` until Codex did. Before `/branch-close` Step 4a commits a changelog entry, give it the same fresh-agent check the docs sweep gives AIKB.
- **Operator — "ask the advisor" worked as a stand-in for your eyeball, and you said so plainly.** Keep doing that when you can't look. It is better than "declined", because it puts an independent reader on the artefact.
- **Process — `codex-companion review --base` cannot review a range that doesn't end at HEAD.** For an already-merged range, use a read-only `task` that names `git diff <a> <b>` in the prompt. That is what reviewed `fe87d92..2456b5e` here. `/branch-close` Step 7 could say so in a line.

## Verdict — did we achieve the objective?

**Brief:** finish Phase 2's open items before 2.18.0 is published, without a version bump, and change the ritual so a branch can't reach "ready to close" with items open. **Verdict: met.**

- [x] **The egN line:** `npm run eg3` prints `kiss-ssg 2.18.0 from ../.. (this package itself)`. The installed site still prints `from node_modules/kiss-ssg`. Red-first at `main`.
- [x] **The four guesses answered:** GUIDE, probed (`166f5c0`, `eb8e6e9`). `llms.txt` 15995→15994.
- [x] **The sweep's leftovers:** GUIDE leads with the bare await, `llms.txt` names `kiss-ssg dev`, the four AIKB claims are settled, and `images-sweep.md` is complete.
- [x] **The unreviewed range reviewed:** a Codex task, five findings, fixed (`63f7187`). Codex on `e6bb6bf..HEAD` was clean, and the operator's `/codex:review` of the branch was clean.
- [x] **The ritual:** `/branch-pulse` Step 6 lists open items, and `/branch-close` Step 5c blocks on them. Used at this close: nothing open but the two **out** items.
- [x] **Clean-room exit:** on the final tarball, `check` exits 0 and none of the four guesses recurs.
- [x] **Release:** 2.18.0 is unchanged and untagged. The CHANGELOG entry is corrected in place, and all six gates pass.

**What is better:**

- The 2.18.0 that ships no longer tells sites that `dev` exits 1, or that `check` stopped setting `KISS_CHECK`.
- A site's agent finds the listing, `slug=` and `--summary` answers where it reads.
- The next branch cannot reach a PR with an item it recorded but did not do.

**Out, with reasons:**

- #90's convention half: the feature freeze, until 3.0.
- The fleet migration: it waits for `/kiss-publish`.
