---
branch: fix/discard-staging-and-site-new-skill
base: main
status: open
opened: 2026-09-27
---

# Session — 2026-09-27: A discard that cannot fail silently, and a skill that counts its habits

## Intent (captured at /branch-open)

**Objective:** Make `_discardStaging()` survive a transient Windows lock and never fail silently — retry the removal with Node's built-in `fs.rm` retries, clear the in-memory output claims whether or not the removal succeeds, and warn with the leftover folder's path and a manual-deletion instruction when it still fails — and correct `kiss-site-new`, which announces "Four habits" over seven and prescribes a `try`/`catch` recipe `llms.txt` does not contain where every example uses `.catch()`.

**Success criteria:**

- [ ] A failing removal is reproduced in a test first (forced `EBUSY`/`ENOTEMPTY`) and seen red for each behaviour: claims left behind, and no warning.
- [ ] `_discardStaging()` removes with `fs.rm({ recursive: true, force: true, maxRetries })`; a transient failure that clears within the retries leaves no folder and no warning.
- [ ] After any failed removal the claims under the staging folder are cleared, and one `warn` names the folder and says to delete it by hand.
- [ ] `AIKB/kiss.md` (the staging notes) updated in the same commit; Codex review at close (the branch changes `lib/`).
- [ ] `kiss-site-new`: the habits count matches the list, the "all run together in example 11" claim is true or corrected, and the end-of-chain instruction matches the `.catch(reportBuildFailure)` pattern the examples use, with a pointer that resolves. A `CONTRADICTIONS` row bans the old sentence.
- [ ] Clean-room: a fresh sub-agent given only the packed tarball and `kiss-site-new`, in an empty folder, builds a small site that passes `kiss-ssg check`, and reports every place the skill made it guess.
- [ ] `npm run gates` green.

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
