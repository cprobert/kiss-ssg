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

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
