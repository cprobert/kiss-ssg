---
branch: fix/skipped-pages-and-record-size
base: main
status: closed
opened: 2026-11-15
scope: lib/build-report.js, lib/check.js, lib/aikb.js, lib/issue.js, lib/kiss.js, lib/kiss-page.js, lib/build-finish.js, lib/page-registry.js, AIKB/page-registry.md, bin/kiss-ssg.js, scripts/red-first.mjs, scripts/fleet-check.mjs, examples/*/AIKB/**, test/**, AIKB/build-report.md, AIKB/check.md, AIKB/aikb.md, AIKB/issue.md, AIKB/kiss.md, AIKB/kiss-page.md, AIKB/build-finish.md, AIKB/testing.md, GUIDE.md, llms.txt, README.md, types/**, CHANGELOG.md, package.json, package-lock.json, plugins/*/.claude-plugin/plugin.json, .claude-plugin/marketplace.json, planning/**
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
- **2026-11-15 — "never rendered" found, and the scope widened to fix it.** A probe of the real engine (scratchpad `never-rendered/probe.mjs`, exit 0) showed that a view with a parse error fails properly. But `generate: 0` ends `ok: true, hash: null` with no failure and keeps its id, so `{{link}}` resolves to a page that was never written. The cause: `lib/kiss-page.js:333` renders on `options.generate` being truthy, while every other reader (sitemap, llms, feed, redirects, packages, rebuild, the output-path and id claims) tests `!== false`. `generate: undefined` from a spread was therefore skipped too. Fix: `lib/page-registry.js` fails any `generate` that is not `true`, `false` or left out, and the render tests `!== false`. `lib/page-registry.js` (and its AIKB doc) joined the scope. `scripts/fleet-check.mjs` joined too: it held a second copy of the null-hash rule, which now imports `pageIdentity` from `lib/check.js`. The `compile` catch in `_getTemplate` that returns `null` is unreachable: `hbs.compile` on a string never throws, because Handlebars compiles lazily. It was left alone; a page with no hash and no skip still reads as changed. `examples/*/AIKB/**` joined the scope: the examples test holds each committed record byte-identical to a fresh one, and the new key changes two of them. No fleet site sets `generate` to anything but a boolean (grep of every v2 site, 2026-11-15: three `generate:` values in diploma-msc, all comparisons).
- **Read-back:** a lesson recurred in all three of the last logs (a claim stated before it was measured: in an `AskUserQuestion`, in an offer, and here as "fleet-check wrote nothing" before the log was read). `/memory-consolidate` was recommended, to run as its own beat between branches.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-15** — Slice one `6a5a941` plus the Codex fix `25f4acd`; 0 commits behind `origin/main`; `scope-check` clean. Criterion 1 (skipped pages): **met**. The report's `skipped` key, `pageIdentity` and `identitiesByPath` are in `lib/check.js`, and fleet-check imports the rule. `npx vitest run`: 149 files, 5,048 passed.
  - red-first: test/integration/generate-false.test.js -t "fails the page when generate" failed at main (ad7e137), 2026-11-15
  - red-first: test/integration/generate-false.test.js -t "generate is undefined" failed at main (ad7e137), 2026-11-15
  - red-first: test/unit/check.test.js -t "skipped on both sides as unchanged" failed at main (ad7e137), 2026-11-15
  - red-first: test/unit/build-report.test.js -t "generate: false as skipped" failed at main (ad7e137), 2026-11-15
  - red-first: test/unit/fleet-check.test.js -t "skipped on both sides as the same" failed at main (ad7e137), 2026-11-15
  - red-first: test/unit/check.test.js -t "hide the written page" failed at 6a5a941 (6a5a941), 2026-11-15
  - red-first: test/unit/fleet-check.test.js -t "hide the written page" failed at 6a5a941 (6a5a941), 2026-11-15. It passes at main, which over-reported (`null` is always changed), so the slice commit is the honest base, run through `KISS_BASE_BRANCH=6a5a941`.

  Criterion 2 ("never rendered"): **met**. `generate: 0`, `''`, `null`, a string, or a spread `undefined` were the case; a parse-error view already failed. Fixed at registration and in the render test (Amendment above). Criteria 3–10: **not yet** (the record slice, size, fleet, red-first, docs and close are still to come). **Review (Codex, slice one):** one finding inside the threat model. A skipped page registered after a written page at the same path replaced its identity, so a change read as unchanged. It was reproduced before the fix (both tests red on the branch), fixed, and the fix diff (`identitiesByPath`) was shown to the operator. No second round: the agreed stop is one pass per slice, plus the close. **Eyeball: deferred** to `/branch-close` Step 5a. The artefact is metacarpus's scratch copy on the branch engine, `check --summary` after `aikb`, printing `= 101 unchanged` (on 2.17.0 its three skipped handbooks showed `~`). **Offer:** failing a non-boolean `generate` rather than coercing it. The operator asked "Explain more", got the four options in a table, and chose **keep**. Decision: continue, to the record slice.

- **2026-11-15** — Record slice `0d7974e`, red-first slice `1ad8005`, and the fleet check. 0 commits behind `origin/main`; `scope-check` clean; `npx vitest run`: 149 files, 5,056 passed.
  - red-first: test/unit/aikb.test.js -t "one row per audit check" failed at main (ad7e137), 2026-11-15
  - red-first: test/unit/aikb.test.js -t "third-party origin with how many" failed at main (ad7e137), 2026-11-15
  - red-first: test/unit/issue.test.js -t "rows per check" failed at main (ad7e137), 2026-11-15
  - red-first: test/unit/red-first.test.js -t "dependencyPlan" failed at main (ad7e137), 2026-11-15
  - red-first: test/integration/markdown.test.js failed at 5b0644a (5b0644a), 2026-11-15. This is the end-to-end proof of the install path: "installing its own dependencies (npm ci)", then 10 of 16 failed on behaviour, with no `Cannot find package`.

  Criteria 3 and 4 (the record's audit and third parties): **met** (`lib/aikb.js` `recordAudit` and `recordThirdParty`). Criterion 5 (readers): **met**. `issue` counts either shape (new test plus the existing `findings` test). `check`'s diff and the redirect findings read pages, assets and ids, which the record keeps unchanged, so their existing tests still hold. The one fleet script that reads the record, pro-plumbing `scripts/design-review.mjs`, reads only `buildDir` and `buildTo` (grep of every v2 site for `last-build`). Criterion 6 (size): **partial**. Recorded on live-data copies on 2.17.0 and then on the branch: medulla 3,217,821 → 361,777 bytes (11.2%), diploma-msc 3,125,962 → 306,188 (9.8%), oxford-medical 2,919,373 → 761,637 (26.1%). Oxford misses the 15% target: what is left is its 2,826 asset rows, every one same-name (475 KB). The operator chose to **leave assets as they are** (recommended), because `check`'s diff reads that list to explain renames. Criterion 7 (fleet, `--base main`): **met**. a1k9training (20 pages, 571 files), oxford-medical (402, 3,232) and medulla (1,148, 1,175, live data) are identical. diploma-msc (live data) has 1,521 files byte-identical, and its reports differ on exactly 3 pages (`tools/deploy`, `p/all`, `ps/all`). These are `pages/internal-tools.js`'s `generate:` false-in-production pages: `null` with no mark at main, `skipped: true` on the branch, confirmed by parsing both kept reports. That is the expected marker difference. Criterion 8 (red-first, removed dependency): **met**. Criterion 9 (red-first, test-only fix): **met by the by-hand branch**. `AIKB/testing.md` gives the method and why it isn't mechanised (one case, #83; a planted condition is specific to each case). Criterion 10 (docs): **partial**. GUIDE, AIKB (aikb, issue, testing, check, build-report, page-registry, kiss-page) and types are done. `llms.txt` needs no line: the new `generate` rule fails loudly, so it is not a trap nothing reports. The CHANGELOG and upgrade note come with the close's version bump. Criterion 11 (gates, close review): **not yet**. **Eyeball: looked, by Claude.** The operator handed it back: "Is a bit too much AIKB is your domain. Does it make sense to you. It's for you!" Claude read medulla's new record (audit rows such as `title-duplicate 1145/1145`, third parties such as `i.vimeocdn.com 416`, 362 KB). Verdict: a diff of the record shows a check starting, stopping or spreading, and a new origin, without the per-finding noise, and the page rows `check` needs are unchanged. medulla's `siteUrl` is `null`, which predates this branch. **Offer:** red-first's automatic `npm ci` when the lockfiles differ: **keep**. Decision: continue. What remains is the close; it waits for the operator to ask for `/branch-close` (CLAUDE.md).

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-11-15: Skipped pages, a small record, and red-first's two gaps

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 2.17.1 on `fix/skipped-pages-and-record-size`. The skipped-page fix and `generate` validation (`6a5a941`, plus `25f4acd` for the Codex finding). The record summaries (`0d7974e`). red-first on the base's own dependencies (`1ad8005`). A docs-sweep fix (`10f062c`), the bump (`ced8f0c`), an `{any}` removed (`629a5d1`) and the budget re-record (`515e8f7`).

## Reflect — what the session was

This branch grew out of the fleet migration earlier in the same conversation. All nine sites moved to 2.17.0, each checked before and after on live CMS data where a site needed it. Five merged, and four Learna PRs are still open. Two things came out of that migration that the library should not do. metacarpus's three `generate: false` handbooks showed as `~ changed` in every diff. And oxford-medical's committed record grew by 51,000 lines. The operator named the priority plainly: "anything that we need to do with kiss to ensure that the library is solid… This is the primary concern."

The shape was **planned, with one emergent turn that served it.** The open turned three known defects into eleven criteria. The emergent turn came from the "never rendered" criterion. A probe of the real engine found that `generate: 0` (or `''`, `null`, a CMS string, a spread `undefined`) skipped the render while the page kept its id. The cause: `lib/kiss-page.js` rendered on truthiness, while every other reader tests `!== false`. That was a worse defect than the one the branch opened for. It was absorbed as a dated Amendment, with the scope widened to `lib/page-registry.js` and `scripts/fleet-check.mjs`. Before any of it, Claude corrected two of its own earlier claims. It had said fleet-check's metacarpus build "wrote nothing" (it had read the head of a log whose end showed the build). It had said the three handbooks "differ between engines" (they were `null` on both sides). Both came out on re-measurement, and PR #8's body and the fleet memory were corrected.

## Evaluate — how the human supervised the AI

**Problem framing was the operator's strongest move.** "The main thing is: is there anything we need to do with kiss to ensure that the library is solid? … Any inconsistencies in the fleet then follows." That reset the session from tidying sites to fixing the engine. Then "I'm concerned that Records can grow very large… can we address this in next" added the second defect at the moment it was measured. Both were the operator's framing, not Claude's offer. At the open, three structured choices were made in one round: one branch, counts per check, 2.17.1. The red-first gaps joined this branch, against an unmarked option set. Since no option was recommended, there was no reason to ask for.

**Pushback & steering held where it was asked for.** On the `generate` decision the operator chose "Explain more" rather than keep. That was the first use of "explain" on an offer in several branches, and it was the right one to spend it on: failing a site's build is the costliest kind of rule. The four-option table made the trade-off concrete before "keep". The operator also chose against the recommendation once (red-first on this branch), and kept every other recommendation: skip the security review, leave assets as they are, re-record the budget.

**Verification & ownership: strong mechanically, delegated by eye.** The mechanical record is thorough. Every new test was seen failing, by name. That includes the two precedence tests, run against the slice commit `6a5a941` because they pass at `main`. The fleet check ran `main` against the branch on four sites, two of them on live CMS data. diploma-msc's three-page report difference was traced to `pages/internal-tools.js` by parsing both kept reports. The sizes were measured on 2.17.0 and on the branch, side by side. The independent review caught the one defect the gates could not: a skipped page registered after a written one at the same path took its identity, so a real change read as unchanged. This was the branch's own regression, since `main` over-reported instead. It was reproduced before it was fixed, and the fix diff was shown. **Both eyeballs were handed back to Claude.** The first was deferred at the pulse, then at the close: "Hand it to Claude". The second: "Is a bit too much AIKB is your domain. Does it make sense to you. It's for you!" That is a reasonable call on an artefact written for an agent. The record is the AIKB, and the operator is right that its reader is Claude. Still, every human check on this branch was a structured answer, never a look at an output.

**Iteration discipline:** two pulses, at the slice boundaries, each with a Codex or eyeball step. The Codex round on slice one came before the record slice was built on the comparator. The `/loop` the operator started ran the remaining work and stopped itself at the close, because CLAUDE.md reserves `/branch-close` for the operator. That was the checkpoint the operator meant to hold, and it held.

**Where the human intended to supervise, and where they did.** The operator supervised the decisions closely: framing, the `generate` trade-off, record shape, budget growth. They delegated the looks. The supervision that mattered most here was a choice nobody else could make: whether failing a build on `generate: 0` is acceptable. It was made by the operator, with the alternatives in front of them.

**Competency level: Active supervisor.** Decisions were framed and owned, with an explanation asked for at the costliest one. Verification of outputs was delegated, deliberately and with a stated reason, rather than skipped.

## Feedback — recommendations for next session

- **Claude — read the end of a log before stating what a build did.** "fleet-check's plain build wrote nothing" came from `head -40` of a file that holds stdout, then stderr. It went into a memory note and an explanation before the build's own "Handbooks generated" line was read. A claim about a run's outcome comes from its exit code and its last lines, or a grep for the success line, never its first screen. (Same class as the three-log lesson the open read back: a claim stated before it was measured.)
- **Claude — a comparator change needs the "two entries, one key" case.** The first cut of `pageIdentity` kept "later entries win", which was safe while the loser was `null` and unsafe once it was `'skipped'`. When a change makes one value compare equal where it never did before, test every map that can hold two of them: here, a skipped and a written page sharing a `buildTo`.
- **Operator — when you hand a look back, say what you'd want checked.** "It's for you" is a fair answer for AIKB. "Check that a diff of it shows a new tracker" would have made Claude's look test something specific, not offer a general verdict.
- **Process — `KISS_BASE_BRANCH=<commit>` makes red-first prove a branch-made defect.** It worked here without a change to the script. If it recurs, a `--base <ref>` flag would make it visible in `--help` rather than in `AIKB/testing.md` alone.
- **Process — the fleet's CMS recipe needs no `git add -f`.** `git archive` into a folder, `get-data` there, and fleet-check copies a non-git folder with its data. It is in the fleet memory now. Use it at the next phase exit.
- **Operator — the four Learna PRs (diploma-msc #504, learna-kiss #196, medulla #127, metacarpus #8) are Phase 1's exit.** diploma-msc still needs its Max Healthcare logo spacing looked at. 2.17.1 can follow them, or replace 2.17.0 in them before they merge.

## Verdict — did we achieve the objective?

The brief: ship 2.17.1 so that a `generate: false` page stops reading as changed, `last-build.json` stops growing with every finding, and red-first covers its two gaps. **Met, with one target missed and recorded.** The objective grew once, into the `generate` validation, and that was good drift: a worse member of the same class, found by the criterion written to look for it.

- [x] **Skipped pages.** `skipped` on each report page. `pageIdentity` and `identitiesByPath` in `lib/check.js`, also used by fleet-check. Red-first by name at `main`, and at `6a5a941` for the precedence fix.
- [x] **"Never rendered".** Found by a probe of the real engine and fixed: `generate` must be a boolean or left out, and the render tests `!== false`.
- [x] **The record's audit.** One row per check, `{ check, findings, pages }`.
- [x] **The record's third parties.** `{ origin, pages }`.
- [x] **Readers.** `issue` reads both shapes. `check` and the redirect findings read keys the record keeps. The one fleet script that reads the record uses only `buildDir` and `buildTo`.
- [ ] **Size under 15% on all three.** medulla 11.2%, diploma-msc 9.8%, oxford-medical **26.1%**. What is left on oxford is 2,826 same-name asset rows. The operator chose to keep them, because `check` reads them to explain renames.
- [x] **Fleet.** Identical on a1k9training, oxford-medical and medulla. diploma-msc's 1,521 files are byte-identical, and its reports differ only by the three pages now marked skipped.
- [x] **red-first, removed dependency.** `dependencyPlan` with `npm ci`, proved against `5b0644a`.
- [x] **red-first, test-only fix.** The by-hand method is in `AIKB/testing.md`, with why it isn't mechanised.
- [x] **Docs.** GUIDE, seven AIKB docs, types and the CHANGELOG 2.17.1 upgrading note. `llms.txt` needs no line.
- [x] **Gates and review.** `npm run gates` green (all six, with the budget re-recorded at +117 core lines by the operator's choice). Codex on slice one found one finding, fixed. Codex at the close, over `ad7e137..515e8f7`: "No actionable regressions."

**What is better now:** `kiss-ssg check` stops crying wolf on skipped pages. A page whose `generate` isn't a boolean fails, naming its view, instead of disappearing behind a working link. The Learna sites' committed records drop from about 3 MB to about 330 KB at their next `aikb`. **Still open:** publishing 2.17.1 (`/kiss-publish`), the four Learna PRs, and `/memory-consolidate`, whose three-log trigger fired at the open.
