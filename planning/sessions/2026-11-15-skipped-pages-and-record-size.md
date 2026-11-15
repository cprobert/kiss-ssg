---
branch: fix/skipped-pages-and-record-size
base: main
status: open
opened: 2026-11-15
scope: lib/build-report.js, lib/check.js, lib/aikb.js, lib/issue.js, lib/kiss.js, lib/kiss-page.js, lib/build-finish.js, bin/kiss-ssg.js, scripts/red-first.mjs, test/**, AIKB/build-report.md, AIKB/check.md, AIKB/aikb.md, AIKB/issue.md, AIKB/kiss.md, AIKB/kiss-page.md, AIKB/build-finish.md, AIKB/testing.md, GUIDE.md, llms.txt, README.md, types/**, CHANGELOG.md, package.json, package-lock.json, plugins/*/.claude-plugin/plugin.json, .claude-plugin/marketplace.json, planning/**
---

# Session — 2026-11-15: Skipped pages read as unchanged, a record that stays small, and red-first's two gaps

## Intent (captured at /branch-open)

**Objective:** Ship 2.17.1 with three fixes. A page skipped with `generate: false` on both sides of a `check` diff stops reading as changed. `AIKB/last-build.json` stops growing with every audit finding and every page's third-party origins. `scripts/red-first.mjs` covers the two cases it cannot prove today.

**Success criteria:**

- [ ] **Skipped pages.** The build report marks a `generate: false` page as skipped. `diffReports` counts a page skipped on both sides as unchanged. A page that failed, or has `hash: null` on one side only, still counts as changed. Tests in `test/unit/check.test.js` and `test/unit/build-report.test.js` (or the integration suite), each seen failing at `main` with `node scripts/red-first.mjs`.
- [ ] **"Never rendered".** The log records when a page reports `ok: true, hash: null` without being `generate: false` (the case `lib/build-report.js:364` names), with the probe that shows it. If that state can mislead a reader of the report, it is fixed here, with a red-first test. If it cannot, the log says why.
- [ ] **The record's audit.** `last-build.json` keeps one row per audit check: its id, its finding count and the number of pages it hit, in `CHECKS` order. No per-finding list. `kiss.report()`, `err.report`, `KISS_REPORT` and `kiss-ssg check --json` keep the full findings.
- [ ] **The record's third parties.** `last-build.json` keeps the distinct third-party origins, each with a page count, instead of each page's list. The live report keeps the per-page detail.
- [ ] **Readers of the record still work.** `kiss-ssg check`'s diff against a record, the redirect findings (`build-finish.js`, which reads the record's pages and ids), and `kiss-ssg issue` (`lib/issue.js:224` counts `audit.findings`, `:635` reads `thirdParty.siteUrl`) all read the new shape, and a record in the old shape too. One test each.
- [ ] **Size, measured.** A new record from medulla, diploma-msc and oxford-medical (live CMS data for the first two), size and line count before and after, each beside the command that printed it. Target: under 15% of today's (3.1 MB, 3.1 MB, 2.9 MB).
- [ ] **Fleet.** `node scripts/fleet-check.mjs` with `--base main` on medulla and diploma-msc (live CMS data in scratch copies), oxford-medical and a1k9training. Built pages and build folders are identical. Report differences are only the new skipped marker and nothing else. Each difference is explained in the pulse log.
- [ ] **red-first: a removed dependency.** `scripts/red-first.mjs` can run a test at the base when the base needs a dependency the branch has removed (the 2026-11-14 markdown-it case), without hand-installing it. Test in `test/unit/red-first.test.js`.
- [ ] **red-first: a fix in the test.** `scripts/red-first.mjs` has a way to prove a fix that lives in the test file itself (the 2026-11-13 #83 case), or the log records why this can't be mechanised and `AIKB/testing.md` gives the by-hand method. Test for whatever is built.
- [ ] **Docs.** GUIDE.md (the report and the record), `llms.txt` (only if a trap changes), `AIKB/` for each module touched, `npm run types`. CHANGELOG 2.17.1 with an `### Upgrading` note: re-run `npx kiss-ssg aikb` and commit the smaller record, and tooling that read the record's findings reads `check --json` instead.
- [ ] **Gates and review.** `npm run gates` green. Codex reviews the first engine slice and the close.

**Non-goals / out of scope:** the fleet sites' own upgrade to 2.17.1, and committing their smaller records (that comes after the release). No change to what the audit checks, or to how findings are printed in a `check` summary. No compression or side file for the record: the full detail stays available from `check --json`. No clean-room run: no instruction a site follows changes, apart from the upgrade note. Issue #90 is not touched.

**Impact surface:** public API — the build report gains a skipped marker, and the `last-build.json` record changes shape. Both are visible to sites and their tooling. Patch bump to 2.17.1 with an upgrading note, as the operator chose.

**Expected shape:** planned — the defect and the record shape are known and the readers are listed. The "never rendered" question and the second red-first gap may turn up something.

**Assumptions:**

- Measured (2026-11-15, `lib/check.js:494` and `:519-524`): `diffReports` counts a `null` hash on either side as changed, by design.
- Measured (2026-11-15, `kiss-ssg check new-cohort.js 2026-sept` on a scratch copy of metacarpus, 2.17.0): its three `generate: false` handbooks report `{"view":"handbooks/unknown.hbs","ok":true,"hash":null,"id":null}`.
- Measured (2026-11-15, per-key sizes of each site's committed `AIKB/last-build.json`): the audit is 1.7–2.2 MB of each 2.9–3.1 MB record on medulla, diploma-msc and oxford-medical, and per-page `thirdParty` is the next largest (0.2–0.9 MB).
- Measured (2026-11-15, `lib/aikb.js:989`): the record is the report minus `duration` and the pipeline steps' timings.
- Measured (2026-11-15, grep of `lib/`): the record's readers are `lib/check.js` (pages, assets), the redirect findings through `kiss._lastBuildRecord()` (pages, ids) and `lib/issue.js` (`audit.findings`, `thirdParty.siteUrl`).
- Inferred: no fleet site's own tooling reads `audit` or `thirdParty` from `last-build.json`. To grep `C:\Code\kiss` before the upgrade note is written.
- Inferred: a patch fits the freeze, because neither change adds a capability (operator's decision, 2026-11-15).

**Delegation convention:** one session. Claude implements and reviews; no sub-agent commits. Codex is the independent review.

**Independent review:** Codex at the first engine slice (`/branch-pulse` Step 3) and at the close. Check its credit before the first slice.

### Amendments

- **2026-11-15 — red-first's two gaps joined this branch** (operator's choice at the open, over taking them on the next branch or dropping them). They recurred in two logs (2026-11-13 phase-0-leftovers, 2026-11-14 markdown-it). They are `scripts/` tooling, separate from the report work, so they come as their own slice and commit.
- **2026-11-15 — fleet sites named by the operator:** medulla, diploma-msc, oxford-medical and a1k9training. metacarpus, the one site with `generate: false` pages, was not chosen, so the skipped-page fix is proved by tests rather than by a fleet run.
- **Read-back:** a lesson recurred in all three of the last logs (a claim stated before it was measured: in an `AskUserQuestion`, in an offer, and here as "fleet-check wrote nothing" before the log was read). `/memory-consolidate` was recommended, to run as its own beat between branches.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
