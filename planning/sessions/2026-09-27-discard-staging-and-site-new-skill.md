---
branch: fix/discard-staging-and-site-new-skill
base: main
status: closed
opened: 2026-09-27
---

# Session — 2026-09-27: A discard that cannot fail silently, and a skill that counts its habits

## Intent (captured at /branch-open)

**Objective:** Make `_discardStaging()` survive a transient Windows lock and never fail silently — retry the removal with Node's built-in `fs.rm` retries, clear the in-memory output claims whether or not the removal succeeds, and warn with the leftover folder's path and a manual-deletion instruction when it still fails — and correct `kiss-site-new`, which announces "Four habits" over seven and prescribes a `try`/`catch` recipe `llms.txt` does not contain where every example uses `.catch()`.

**Success criteria:**

- [x] A failing removal is reproduced in a test first (forced `EBUSY`/`ENOTEMPTY`) and seen red for each behaviour: claims left behind, and no warning.
- [x] `_discardStaging()` removes with `fs.rm({ recursive: true, force: true, maxRetries })`; a transient failure that clears within the retries leaves no folder and no warning.
- [x] After any failed removal the claims under the staging folder are cleared, and one `warn` names the folder and says to delete it by hand.
- [x] `AIKB/kiss.md` (the staging notes) updated in the same commit; Codex review at close (the branch changes `lib/`).
- [x] `kiss-site-new`: the habits count matches the list, the "all run together in example 11" claim is true or corrected, and the end-of-chain instruction matches the `.catch(reportBuildFailure)` pattern the examples use, with a pointer that resolves. A `CONTRADICTIONS` row bans the old sentence.
- [x] Clean-room: a fresh sub-agent given only the packed tarball and `kiss-site-new`, in an empty folder, builds a small site that passes `kiss-ssg check`, and reports every place the skill made it guess.
- [x] `npm run gates` green.

**Non-goals / out of scope:** Sweeping up leftover `*.kiss-staging-*` folders from earlier runs automatically; changing when or whether staging is used; rewriting `kiss-site-new` beyond the stale lines and whatever the clean-room run proves wrong; the examples' own contradictions with `llms.txt` (a separate docs branch).

**Impact surface:** engine internals — `_discardStaging` changes behaviour only on failure (a warning, not an API); plus tooling & docs (the skill). Patch.

**Expected shape:** planned — both fixes are designed; the clean-room run may widen the skill fix, which would be recorded as an Amendment.

**Delegation convention:** one session implements; sub-agents only for the clean-room run and the Codex review at close. Agents never commit.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-09-27 — `close()` absorbed (adjacent).** `close()` removes an unpromoted staging folder (a build that never called `complete()`) with the same `fs.remove` + debug-only catch the intent targeted in `_discardStaging()`. Same folder, same silence, same file: both now share `_removeStaging()`, with its own test seen red first. `_oldDir` removal in `close()` keeps its debug-only catch — it is the previous output renamed aside, a different folder with its own guard — and is not changed here.

- **2026-09-27 — the dev guard and the habits (operator's decisions, absorbed here).** The clean-room run surfaced that every example awaits `complete()` only outside `--dev`. Measured with a probe and then on example 1 itself: awaited in dev, `complete()` resolves after the first build and the server keeps serving; behind `if (!dev)`, a dev server that cannot bind its port logs the error and exits **0** instead of **1**. The guard arrived in `bbd4b16` with no recorded reason. Operator: drop it here — the `init` starter and nine example routers now await `complete()` in both modes, and `kiss-site-new` says not to guard it. And the skill's "seven habits" became **seven decisions**, pointing at `llms.txt's` five working habits instead of sharing their name (operator's choice over merging the lists). Impact surface unchanged in kind — the starter and examples ship, but no API moved; still a patch.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-09-27 — engine slice.** Criteria 1 and 3 met: four tests red first (rm not called with retries; claims left after a locked removal; no warning from the discard; no warning from `close()`), green after `05e113f`; full suite 1747 passed / 2 skipped. Criterion 2 partial by construction: the `fs.rm` call and options are tested, a lock that clears on retry is Node's own behaviour and not mockable from outside. Criterion 4 half (AIKB note in the commit; Codex at close). 5–7 not yet. Drift: `close()` only, recorded as an Amendment. **Eyeball: looked** — operator read the warning copy: "reads right". **Explained:** a leftover folder is a warning, not a build failure; operator: keep it a warning. Decision: continue to the `kiss-site-new` slice.

- **2026-09-27 — skill slice + clean-room.** Criterion 5 met (`b433b3b`, `bdcfd41`): seven habits with five truly in example 11, the `.catch(reportBuildFailure)` end of build, plus six lines the clean-room run proved wrong (llms.txt size, triggers not thresholds, `"type": "module"` and `check`/`aikb` scripts, the `if (!dev)` form, examples 1–6 and 10, the habits distinct from llms.txt's five); every new ban/coverage row seen red against the previous skill. Criterion 6 met: fresh agent, tarball + skill only, empty folder → 10-page bookshop site, `check` exit 0 first run. Not fixed here, per the non-goals (the examples' own contradictions): example 1's "about a third of the file" helper threshold, example 11's hand-written internal URLs and `/feed.xml`, `examples/README.md's` `7-versioned-outputs.js` / `9-migrated-from-v1.js` names, example 11's `11-blog.js` callout. Open question for the operator: the examples await `complete()` only when not `--dev`, while llms.txt says a dev-server bind failure rejects `complete()` — the guarded form never sees it. Eyeball: carried from the engine pulse (looked). Decision: ready to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Log — 2026-09-27: A discard that cannot fail silently, and a skill that counts its decisions

**What we shipped (2.6.2):** `05e113f` — `_discardStaging()` and `close()` share `_removeStaging()`: `fs.rm` with `maxRetries`, one warning naming a folder that outlasts the retries, and the output claims cleared in a `finally`. `b433b3b`, `bdcfd41` — `kiss-site-new` corrected from the brief and from what the clean-room run had to guess. `2ffb654` — the `init` starter and nine example routers await `complete()` in dev too, and the skill's "habits" became **decisions**. `80f891c` — `llms.txt` and `GUIDE.md` say what happens when staging will not go.

**Supervision:** planned, then widened twice by the operator's own decisions, both recorded as Amendments. The operator framed the engine fix as a question ("shall we just show a warning?"), and the answer came back as a question with the trade-off stated — retry, clear, then warn — which the operator chose. The standout moment was the operator's second message: "I didn't write this so I'm less aware of the nuance — will you analyse to satisfy yourself?" That asked for evidence instead of an opinion, and the answer was measured four ways (guarded vs awaited, free vs taken port, first with a probe and then on example 1 itself) before any recommendation — turning a clean-room aside into a real defect: behind the `if (!dev)` guard, a dev server that could not bind exited 0. The operator also asked the naming question that made "seven habits vs five habits" a design decision rather than a footnote. The engine pulse ran as the skill with its eyeball (the warning copy, **looked**: "reads right") and its offered explanation (warning, not a build failure — operator kept it a warning); the skill-slice pulse was written by hand and did not ask again. The clean-room run was the operator's choice over my "too small to earn it", and it found six stale lines in the skill plus the dev-guard defect — the second branch running where that lesson paid. Codex's adversarial review approved. **Active supervisor** on this branch: the operator asked for explanation, asked for verification rather than assertion, and decided both forks.

**Feedback for next time:**

- **Claude — do not grade a verification step "too small to earn it" when it is the one the ritual now proposes.** I recommended skipping the clean-room run for "two sentences"; it found six more wrong lines and a real exit-code defect. The cost was one background agent. Recommend running it and let the operator skip.
- **Claude — a test that passes before the fix is a finding about the test.** Twice on this branch a new test passed or failed for the wrong reason before the implementation — a mock on `fs.rm` when the code still called `fs.remove`, and a scripted edit that made `lockEverything` call itself. Both were caught only because the red run was read, not counted. Read every red failure's message before calling it red.
- **Claude — a reason stated in a doc needs a source.** I wrote that the dev guard existed "so a `--dev` run keeps serving instead of settling" before checking; there was no recorded reason, and the measurement showed the opposite. Removed before commit. When writing _why_, cite the commit, log or measurement, or write "no recorded reason".
- **Operator — "analyse to satisfy yourself" worked; keep asking it.** It is the question that turned an inherited convention into a measured defect. Pair it with "and show me the measurement".
- **Process — the examples' remaining contradictions with `llms.txt` are the next docs branch:** example 1's "about a third of the file" helper threshold, example 11's hand-written internal URLs and `/feed.xml`, `examples/README.md`'s flat `*.js` names, and example 11's `11-blog.js` callout.

**Did we achieve the objective?** **Met, and widened by two operator decisions.**

- [x] Failing removal reproduced first — four tests red for the right reasons (after one mock and one recursion were fixed in the tests themselves).
- [x] `fs.rm` with `maxRetries` — the call and options tested; a lock that clears on retry is Node's own behaviour, not mockable from outside (stated at the pulse).
- [x] Claims cleared after any failed removal, and one warning naming the folder — from the discard and from `close()`.
- [x] `AIKB/kiss.md` in the engine commit; Codex adversarial review approved after the last `lib/` change.
- [x] `kiss-site-new`: count, example-11 claim, end-of-build form and six clean-room findings fixed; bans and a coverage row, each seen red against the previous skill.
- [x] Clean-room: a fresh agent built a 10-page bookshop site from the tarball and skill alone, `check` exit 0 first run.
- [x] `npm run gates` green (test, lint, typecheck, format, pack).

Open: the examples' own contradictions (above).
