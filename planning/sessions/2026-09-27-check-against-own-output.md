---
branch: fix/check-against-reads-its-own-output
base: main
status: open
opened: 2026-09-27
---

# Session — 2026-09-27: `check --against` reads check's own output

## Intent (captured at /branch-open)

**Objective:** Make `kiss-ssg check --against <file>` accept the `{ reports, diff }` object that `check` itself prints whenever a site has a recorded knowledge base. Today `readReportsFile` (`lib/check.js`) treats that object as one report with no pages, so every page diffs as "added" — found while comparing K9-Solutions across the 2.6.0 → 2.6.2 upgrade.

**Success criteria:**

- [ ] A unit test feeds `readReportsFile` the `{ reports, diff }` shape and expects the reports array — seen red against the current code for the right reason.
- [ ] An end-to-end test: a site with a recorded knowledge base, `check`'s JSON output saved and passed back via `--against`, reports its pages as unchanged rather than added.
- [ ] `HELP`, `AIKB/check.md`, `llms.txt` and `GUIDE.md` name the fourth accepted shape wherever they list the three.
- [ ] `npm run gates` green; Codex review at close (the branch changes `lib/`).

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
