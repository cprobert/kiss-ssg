---
branch: fix/check-against-reads-its-own-output
base: main
status: closed
opened: 2026-09-27
---

# Session — 2026-09-27: `check --against` reads check's own output

## Intent (captured at /branch-open)

**Objective:** Make `kiss-ssg check --against <file>` accept the `{ reports, diff }` object that `check` itself prints whenever a site has a recorded knowledge base. Today `readReportsFile` (`lib/check.js`) treats that object as one report with no pages, so every page diffs as "added" — found while comparing K9-Solutions across the 2.6.0 → 2.6.2 upgrade.

**Success criteria:**

- [x] A unit test feeds `readReportsFile` the `{ reports, diff }` shape and expects the reports array — seen red against the current code for the right reason.
- [x] An end-to-end test: a site with a recorded knowledge base, `check`'s JSON output saved and passed back via `--against`, reports its pages as unchanged rather than added.
- [x] `HELP`, `AIKB/check.md`, `llms.txt` and `GUIDE.md` name the fourth accepted shape wherever they list the three.
- [x] `npm run gates` green; Codex review at close (the branch changes `lib/`).

**Non-goals / out of scope:** Any other change to how `--against` pairs or diffs reports; the null-hash-counts-as-changed rule (documented, and correct); the sites under `C:\Code\kiss`.

**Impact surface:** engine internals — a CLI input shape accepted that was always meant to be; patch.

**Expected shape:** planned — one function, its tests, and the docs that list its shapes.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-09-27** — criteria 1–3 met: unit test red first (the wrapper returned as one element), end-to-end test red first (`+ ./public/index.html`, `= 0 unchanged`), both green after `ba587c5`; `HELP`, `AIKB/check.md`, `llms.txt`, `GUIDE.md` name the fourth shape; full suite 1762 passed / 2 skipped. Criterion 4 (gates, Codex) is the close's. No drift. **Eyeball: looked** — operator ran this branch's bin against a fresh `check` output on the real K9-Solutions site: `ok ./public (check) — 10 pages, 0 failed, 9 assets` / `= 10 unchanged` (2.6.2 read the same shape as ten added pages). (The first attempt ran from the wrong folder because the instructions were prose, not a command to paste; it left an empty `prev.json,` in this repo, removed.) **Explained:** the wrapper is recognised by `reports` being an array alone; operator: keep it. Decision: ready to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Log — 2026-09-27: `check --against` reads check's own output

**What we shipped (2.6.3):** `ba587c5` — `readReportsFile` (`lib/check.js`) unwraps the `{ reports, diff }` object `check` prints whenever it diffs, so one check's output can be fed back as the next one's `--against`; `HELP`, `AIKB/check.md`, `llms.txt` and `GUIDE.md` name the fourth shape. `bbdccf9` + `90b28a6` — the bump and a repaired changelog entry.

**Supervision:** planned, small, and found in the field: the defect surfaced while I was comparing K9-Solutions across the 2.6.0 → 2.6.2 upgrade, and the operator's "should we fix that?" turned an aside into a branch. Both tests were red for the right reason before the fix — the end-to-end one printing exactly the K9 symptom (`+ ./public/index.html`, `= 0 unchanged`). The pulse ran as the skill: the operator ran the eyeball on the real K9 site (`= 10 unchanged` with the fix) and then, unprompted, the contrast with the published 2.6.2 (ten `+` lines, `= 0 unchanged`) — same input, only the fix different, which is the strongest evidence this branch has. The explained decision (recognise the wrapper by `reports` alone) was the operator's to keep. The operator also caught a process error in real time: rejecting a question until the instructions were clear, after my prose instruction ran from the wrong folder and left an empty `prev.json,` in the repo. **Active supervisor.**

**Feedback for next time:**

- **Claude — the "never pass prose through the shell" rule has now failed again, a third time after it was retired.** At the close I passed the changelog entry to `node -e` inside double quotes; bash ran every backtick span as a command (`check`, a stray `npx kiss-ssg check …`, a redirect) and committed the entry with those spans blanked (`bbdccf9`, repaired in `90b28a6`). Nothing else was harmed, but the rule in `CLAUDE.md` covers commit messages and long commands, not "text passed into a script". It needs sharpening to: any text that contains backticks, `$` or quotes goes into a file via the Write/Edit tool — never inline into `node -e`, `sed` or a double-quoted string. A `/memory-consolidate` candidate.
- **Claude — give the operator paste-ready commands, never prose.** Saved as a memory the same day: one `! cd /c/abs/path && …` line per command, output to `$TEMP`, expected result named.
- **Operator — the contrast run was the best check on the branch; keep asking for the "before" alongside the "after".**

**Did we achieve the objective?** **Met.**

- [x] Unit test for the `{ reports, diff }` shape, red first (the wrapper came back as one element).
- [x] End-to-end: record, check, feed the output back — red first with the K9 symptom, `= 1 unchanged` after.
- [x] `HELP`, `AIKB/check.md`, `llms.txt`, `GUIDE.md` name the fourth shape.
- [x] Gates green; Codex review: no actionable regressions, all four shapes asserted directly.

Open: nothing on this branch. The `CLAUDE.md` shell rule needs sharpening (above).
