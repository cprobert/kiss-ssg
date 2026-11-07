---
branch: fix/deferred-security-items
base: main
status: closed
opened: 2026-11-07
consolidated: 2026-11-07
---

# Session — 2026-11-07: The fourteen items deferred from the security release

## Intent (captured at /branch-open)

**Objective:** Close every item that pull request #76 (2.13.2) listed under "What's deferred", so the model-fetch path, the redaction rules and the consent docs carry no known gap that was found and left.

The fourteen, numbered as the contract numbers them (`planning/plans/2026-11-07-deferred-security-items.md`):

1. `fetch.timeout` covers the wait for headers only; a stalled body is never timed out.
2. A non-numeric `fetch.retries` makes `fetchModel` reject with `undefined`.
3. A URL kiss cannot fetch is reported as whatever error was thrown, and attempted once per retry.
4. A safe part of an error is checked by shape, not value; a replaced `fetch` could put a token in a `code`.
5. A cache write that fails still fails the page though the model was fetched.
6. A stubbed fetch returning a non-numeric `status` reads `STATUS_CODES` unguarded.
7. Two markings of kiss's own errors are never read, and the message prefix is built in two places.
8. The real-fetch tests pin Node's wording for four causes; a dropped-socket test could flake.
9. A failed model is logged and the page skipped, and the report says `ok: true` with the page missing.
10. A secret used as a query parameter's name, or in a URL's path, is shown; an http(s) URL with `@` in its password is shown as the parser split it.
11. `assets.pipeline[].run` is recorded as written in the site map, so a token typed into a command would be committed.
12. A fetch failure whose cause has no code and is not a constant cause is shown as the error's name alone (`→ TypeError`).
13. `{{markdown}}` passes raw HTML through by default, undocumented as a trap; every example sets `verbose: true`.
14. The consent fallback does not run on a host that answers every address with a page and status 200 unless it sends `nosniff`; the origin guard on `file://` is inferred, not measured.

Decisions taken at the open (operator, 2026-11-07, each the recommended option):

- **9:** a model that cannot be resolved fails the build like a failed controller does. `ok: false`, the page named. A behaviour change, so a minor bump with an `### Upgrading` note.
- **13:** the opt-out is Remarkable's own `markdown.html: false`, which kiss already passes through. The work is to document it as the CMS trap, not to add a key. The default stays.
- **The fleet check becomes a `scripts/` command on this branch** (asked for in two logs: 2026-11-06 Dependabot round 1, 2026-11-06 security hardening), and this branch's fleet criterion runs through it.
- **Delegation:** Opus agents implement, one per workstream; the main session briefs, reads every diff and runs the tests. Agents never commit.

**Success criteria:**

- [ ] Each of the fourteen has either a closing commit, named against its number, or a recorded reason it is not fixed, in this file's Verdict. "Not fixed" is allowed only for 14's 200-host half, which is a host's behaviour kiss cannot see from a `<script>` tag, and is documented.
- [ ] Every fix's regression test was seen red against the unfixed code, with the one-line mutation named in the commit or the pulse log.
- [ ] A failed model fails the build: an integration test shows `ok: false` with the page named for a missing file model, an empty model folder and a failed URL fetch; example 8 still exits 1 for the reason it did before.
- [ ] `fetch.timeout` ends a fetch whose body stalls after `200` headers, measured against a real local server that sends headers and then nothing.
- [ ] Whole-build leak test re-run on the final tree (the scratchpad `review-r2/run-e2e.mjs aikb` harness or its equivalent): no token in the log, the built files, `AIKB/` or the report, and the server saw the real header and query on every request.
- [ ] `scripts/fleet-check.mjs` exists with a `test/unit/fleet-check.test.js`, and the fleet criterion ran through it: `a1k9training` built from the packed base and the packed branch, two builds back to back, the reports compared with `diffReports` and the build folders compared byte for byte, every difference explained in the pulse log.
- [ ] Clean-room: a fresh agent given only the packed tarball's docs answers two questions from them alone: how to stop CMS Markdown rendering HTML, and what a build does when a model URL fails. Every guess it reports becomes a doc fix.
- [ ] One independent review at the close under the stop rule in the contract, its findings handled by that rule, the largest fix diff shown to the operator before any second round.
- [ ] `npm run gates` green locally and CI green on Ubuntu and Windows; `AIKB/` docs, `GUIDE.md`, `llms.txt` (under the cap) and `CHANGELOG.md` (2.14.0, with `### Upgrading`) say what the code does.

**Non-goals / out of scope:** changing how the consent head script loads its client (the 200-host limitation stays documented); any security finding outside the fourteen that comes up on the way (recorded here as an Amendment and put to the operator, never absorbed silently); Codex review (no credits); new features beyond the opt-out that already exists.

**Impact surface:** public API — a failed model now fails the build (`ok: false`), the site map's pipeline record changes shape, `redactUrl`'s output changes, and the docs gain a trap. Minor bump: 2.14.0.

**Expected shape:** planned — the fourteen are enumerated, each has a decided fix or a decided reason, and the route is one workstream per group in the contract. The fleet script is the one part whose shape may move while it is built.

**Delegation convention:** the main session writes the contract, briefs one Opus agent per workstream with the files it may touch, reads every diff before it is committed, runs the tests and the mutation check itself, and commits. Agents never commit, never run `/branch-close`, and report every place they had to guess. The contract is critiqued by one fresh-context agent before the first workstream starts.

**Contract:** `planning/plans/2026-11-07-deferred-security-items.md`

**Inherited from the read-back (all 61 logs skimmed):** "run `/branch-pulse`, never hand-write a pulse entry" is in three logs (2026-09-26, 11-05, 11-06) and not retired, so `/memory-consolidate` was recommended before this branch; the pulse is run as a skill here, after each workstream lands.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-11-07 — a finding outside the fourteen, from workstream C.** `lib/pipeline.js` prints a step's whole `run` at info (`pipeline: <name> — <run>`) and in its failure message (`pipeline step "<name>" failed (<how>): <run>`), so a token typed into a command reaches the log and the report's failure text, though item 11 keeps it out of `AIKB/`. The threat model says no secret reaches a log line. Put to the operator: fix on this branch (print the program and the step's name; the command is the author's own config), or record as a known limit. Decision (operator, 2026-11-07): fix on this branch, as item 15; the log and the failure message name the step and its program.
- **2026-11-07 — item 10 overturned at the first pulse.** The contract's fix redacted a model URL's whole query, parameter names included. The operator chose against it at the pulse's explain-or-overturn offer: names are shown and values redacted, as in 2.13.2. Reason, in the operator's words: names help identify the model (a log line or site-map row showing `?page=` versus `?type=` tells which model it was; a secret as a parameter name is not a case worth paying that for). The path sentence stays; the `llms.txt` trap line says values.
- **2026-11-07 — item 14's 200-host half becomes item 16, fixed.** The open's non-goal that a host answering every address with status 200 defeats the consent fallback unless it sends `nosniff` was Claude's call, written into the plan and later misreported as the operator's. Explained after the pulse; the operator chose to fix it: after the client file's `load` event, the inline head script checks that the client announced itself (`window.__kissConsent`) and, when it did not, treats the load as failed and tries the site root, so a 200 answer carrying HTML no longer leaves a page without its consent client.
- **2026-11-07 — version: patch 2.13.3, against the proposed minor 2.14.0.** The intent's impact surface (public API) proposed a minor. The operator chose a patch. Reason, in the operator's words: "2.13 is all about security." The changelog entry carries an `### Upgrading` note all the same, because a site can see a red build it did not see before.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-07** — first pulse, after every workstream landed (`ed4eb42` C, `c3d2f7a` E, `fd09f38` item 15, `9b30abf` B, `22365af` A, `dbb8841` D, `67c38a5` the item-10 overturn). Criterion 1 (each item closed or reasoned) met: items 1–13 and 15 fixed, 14's file:// half measured, its 200-host half recorded by decision. Criterion 2 (every fix seen red) met: each agent's red run re-done in the main session by one-line mutation for items 1, 3, 9, 10, 11 and 15 (body read outside the race; `checkUrl` dropped; a doubled push; the query dropped; `run` put back in the map; the command printed), the rest as the agents reported. Criterion 3 (a failed model fails the build) met: three lifecycle rows, `ok: false`, one failure per page; example 8 still exits 1 for its controller reason only. Criterion 4 (timeout covers the body) met: real server sends 200 and nothing, rejects within the 3 s cap. Criterion 5 (whole-build leak test) met on `dbb8841`: 0 marker lines in the log, `public/`, the report and the failures in `build` and `aikb` modes; the server saw 56/56 real headers and queries; the build now fails (13 failures, `ok: false`) where 2.13.2 said `ok: true`. Criterion 6 (fleet through the script) met: `scripts/fleet-check.mjs` with 31 unit rows; a1k9training, main `3aa5ae0` against `67c38a5`, 20 pages, 472 files, 0 differ, run twice (`22365af` and `67c38a5`). Criterion 7 (clean-room) met: both answers found in the shipped docs, no contradiction, one mislocated pointer fixed in `67c38a5`. Criteria 8–9 not yet (the close's review, gates, changelog, version). `npm test` 4698 passed on the final tree. Drift: none against the non-goals; one amendment (item 15, operator's decision) and one overturn (item 10, operator's reason recorded). **Eyeball: looked** — `GUIDE.md` § Remote models lines 314–319: "Looked, it is right". **Offer:** item 10's whole-query redaction, answered **overturn**, reason given. Decision: continue to `/branch-close`, nothing else owed on the criteria.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-11-07: The fourteen items deferred from the security release

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 2.13.3, sixteen commits over `main` (`1cda2d8` to `b14c48b`): every item pull request #76 deferred, fixed; two more found on the way (a token in a pipeline command reaching the log, and the consent fallback on a catch-all host) fixed by amendment; the fleet check as `scripts/fleet-check.mjs`; one decision overturned at the pulse and one review finding loosened by the operator's choice.

## Reflect — what the session was

The goal was framed before the branch existed: the operator asked, after the last merge, why fourteen findings had been left and whether wanting to secure the codebase was over-engineering. The honest answer to the first ("the stop rule I proposed, which cut against your standing preference not to defer small fixes") became the brief: fix all fourteen. The shape was **planned** and stayed planned: a contract enumerated each item with its fix, a fresh-context critique found eighteen flaws in it before any code (the double-counted controller failure, the pipeline command's second committed home, three workstreams' tests crossing on one redaction change), and the amended contract held through five workstreams run in parallel. Two things were emergent and both were handled through the one channel for it: workstream C's agent noticed `lib/pipeline.js` still printed a token (item 15, an amendment the operator decided), and the operator's question about the 200-host "limit" exposed that it had been Claude's call recorded as the operator's (item 16, an amendment the operator decided, and the misattribution written down).

## Evaluate — how the human supervised the AI

**Pushback & steering** is the dimension that discriminated this session, and it was strong in a way the earlier branches were not. Four times the operator went against the recommendation, each time with a reason that was asked for and written down: "Fix all eight using opus" came before the branch; at the pulse's explain-or-overturn offer the operator overturned item 10 ("names help identify the model"), a change that would have gone through unquestioned on any earlier branch; at the close the operator chose a patch over the proposed minor ("2.13 is all about security"); and when the review found that strict fetch validation refused a numeric string, the operator chose the middle option, read digits, refuse the rest, rather than the recommended "document only". Each of those changed the code or the record. The sum beat the parts on item 16: Claude had recorded a limitation as unfixable, the operator asked what it meant, the explanation showed the fix (trust `load` only when the file announced itself), and the operator chose it.

**Verification & ownership**: the eyeball happened at the pulse, warm, on the GUIDE paragraph a site author reads, and was answered "Looked, it is right". Every regression test was seen red: by the agents as reported, and six of them re-done in the main session by one-line mutation before each commit. The whole-build leak harness, the fleet check through the new script (twice), a clean-room read of the shipped docs and two close reviews under a stop rule written before any code all ran because they were criteria from the open. Codex was not available; the independent reviews were same-family fresh contexts, named as such.

**Iteration discipline** was the weak seam, and it was Claude's. The five workstreams landed in parallel and the first pulse came only after all of them, two hours in; the contract said "after each of A, B, C lands". The pulse found nothing wrong, and the overturn it produced would have been cheaper mid-branch than after every test file had been swept to the whole-query shape.

**Harness leverage** was high: a fresh-context critique of the contract, one Opus agent per workstream with named file ownership, a clean-room agent, two scoped reviews, and the skills run as skills (the pulse by `/branch-pulse`, not by hand, the lesson three logs had asked for). One miss: the agents wrote into one shared working tree, so a review of workstream C's diff had workstream E's files beside it, and committing item 15 needed a hand-made patch to stage two hunks of a file workstream B was editing. Worktrees per agent would have cost nothing and removed that.

**Competency level: agentic engineering lead.** The operator set the brief from Claude's own admission, took every structured decision with a reason, overturned a recommendation on the evidence offered, caught a misattributed decision, and chose a narrower fix than the one recommended twice. The level is earned by the four reasoned departures, not by the volume of work.

## Feedback — recommendations for next session

- **Claude — pulse after the first engine workstream lands, not after the last.** The contract said so and the session did not do it. The item-10 overturn cost a second sweep of five test files; at the first pulse it would have cost one.
- **Claude — give parallel agents their own worktrees.** Four agents in one tree meant one agent's uncommitted edits in another's review and a hand-staged patch for a shared test file. `git worktree add` per workstream, merged by the main session, is the cost of nothing.
- **Claude — never attribute a non-goal to the operator unless the operator chose it.** The 200-host item was written into the plan's non-goals by Claude and reported as "your decision". The operator caught it. A non-goal the operator did not choose says "Claude's call" in the plan.
- **Operator — keep asking what a recorded limit means.** The question about `nosniff` turned a documented limitation into a nine-line fix with a browser test. The same question is worth asking of any "recorded rather than fixed" line in a pull request.
- **Process — the fleet criterion now has a command; put the whole-build leak harness beside it.** `scripts/fleet-check.mjs` took the fleet check out of the scratchpad on its third request. The leak harness (`review-r2/run-e2e.mjs`) ran from the scratchpad for the second branch running and is the only check that proves no token reaches a file; it deserves the same promotion when it is asked for again.
- **Both — a stop rule that ends in a documented behaviour change needs the changelog read against the code before the round closes.** Round one's two findings were both "the entry does not say this"; a reviewer reading the changelog against the diff is a cheaper first round than one reading the diff alone.

## Verdict — did we achieve the objective?

**Met.** The brief was to close every item pull request #76 deferred, so the model-fetch path, the redaction rules and the consent docs carry no known gap that was found and left.

- [x] Each of the fourteen has a closing commit or a recorded reason: items 1 to 8 and 12 in `22365af` and `cfcf419`; 9 in `9b30abf`; 10 in `ed4eb42` then `67c38a5` (overturned to names shown, values redacted, the operator's reason recorded); 11 in `ed4eb42` and `fd09f38`; 13 and 14 in `dbb8841`; 14's 200-host half, first recorded, then fixed as item 16 in `51aa435`; item 15 in `fd09f38`. Nothing left recorded rather than fixed.
- [x] Every fix's regression test seen red: each agent's red run reported with its mutation, six re-done in the main session (body read outside the race; `checkUrl` dropped; a doubled push; the query dropped; `run` put back in the map; the command printed), the pipeline row, the consent fallback row and the four digit-string rows seen red by hand.
- [x] A failed model fails the build: three lifecycle rows (`ok: false`, one failure per page, the rest built); example 8 still exits 1 for its controller reason only.
- [x] The timeout covers a stalled body: a real server sends 200 and nothing; the fetch rejects inside the 3 s cap.
- [x] Whole-build leak test on `dbb8841`: 0 marker lines across log, built files, report and failures in both modes; 56 of 56 real requests; the build now fails (13 failures) where 2.13.2 said `ok: true`.
- [x] Fleet through the script: `scripts/fleet-check.mjs` with 31 unit rows; a1k9training, `main` against `22365af` and against `67c38a5`, 20 pages, 472 files, nothing differing.
- [x] Clean-room: both answers found in the shipped docs, no contradiction; one mislocated pointer fixed.
- [x] Two independent reviews at the close under the stop rule (plus a security-focused review, no findings): round one found two changed behaviours the changelog did not say, both fixed (`cfcf419`, `26b8912`); round two, scoped to those fixes, found nothing above the bar; one overstated sentence corrected (`b14c48b`). Codex unavailable, no credits, recorded as the operator's reason against the standing preference.
- [x] Gates green locally four times on the final shapes; `CHANGELOG.md` 2.13.3 with `### Upgrading`; `llms.txt` at 15,976 characters.

**Measurable impact:** a site with a missing or unfetchable model now gets a red build instead of a silent gap; a stalled API no longer hangs a build; a token typed into a pipeline command reaches no committed file, log line or message; a consent page on a catch-all host gets its controls; and the fleet check is one command. **Open:** `npm publish` (npm is on 2.13.0; `main` will be 2.13.3 after the merge); rebuild and redeploy any site using `config.consent`; `/memory-consolidate` for the pulse-by-hand lesson (three logs) and now the per-workstream pulse; the below-the-bar list in the pull request.
