---
branch: codex/protect-source-folders
base: main
status: open
opened: 2026-09-21
---

# Session — 2026-09-21: Protect configured source folders

## Intent (captured at /branch-open)

**Objective:** Reject unsafe source/output configurations before construction can
create or delete files.

**Success criteria:**

- [ ] Reject `folders.src` resolving to the working project root, including aliases.
- [ ] Reject build folders equal to or containing any configured source folder.
- [ ] Reject build folders nested inside pages, assets, layouts, partials, models,
      controllers, helpers, or AIKB; permit an otherwise separate `src/public`.
- [ ] Check actual filesystem locations, including junctions/symlinks, Windows
      case differences, and non-existent descendants of existing aliases.
- [ ] Apply the guard regardless of `cleanBuild` and before filesystem mutation.
- [ ] Demonstrate regressions failing before the fix, then passing with source
      sentinel contents and directory structure preserved.
- [ ] Update configuration guidance and keep the other five review findings open
      in `TODO.md`.

**Non-goals / out of scope:** Staging ownership/liveness, atomic defaults, asset
hashing, fetch timeouts, watcher behaviour, and auxiliary-output failure policy.

**Impact surface:** Public API — previously accepted unsafe folder arrangements
will throw. No new configuration options. Release classification belongs to
branch-close; no version change or release is requested here.

**Expected shape:** Planned — config validation, filesystem preservation tests,
and documentation of the stricter contract.

**Delegation convention:** None: one session.

### Amendments

- **2026-09-23 Amendment (round five):** Address the confirmed stale link
  verdict after replay restoration and add direct coverage for registry asset
  producer retention. The integration fixture failed at `321693c`: restoration
  wrote a newly added `new.txt`, but the final report still called its link
  broken. Invalidating `_links` before rechecking makes that fixture pass;
  dev-mode link checking remains disabled. All 103 watcher integration and
  registry unit tests pass. Fable independently reports the full suite, fleet,
  performance and browser checks passing at `321693c`; those are supplied
  results, not reruns in this pass.
  Findings 3 (display paths/ids), 7 (watch anchors) and 8 (report mapper style)
  remain follow-up work; findings 4 and 5 stay with the deferred registry
  refactor. Finding 6's extra restoration copy is retained: an earlier copy
  can have been refused before the page claim was released, so skipping it
  because that owner already ran would lose the asset. Finding 2 requires no
  correction. This is a focused correction, not a claim to close every row.
  Separate operator edits remain untouched. No branch-close or push.

- **2026-09-22 — Round-two corrective pass.** Absorb Fable's eight findings on
  this branch: advisory collision reports and distinct Sass refusals; retained
  Sass fingerprints without the prior-file read; truthful orphan logs; one
  post-replay asset retry for save-all; accurate precedence warnings; typed
  registry claims; and staging-discard cleanup. Preserve advisory exit policy.
  Four boundary fixtures were observed red at `c69c2a7` before implementation
  (missing report collisions, unwanted no-op Sass refresh, missing same-batch
  replacement asset, retained staging claim). Commit both review reports with
  this pass. Benchmark changes are outside scope. Accept and document the
  measured browser reconnect window without adding a replay mechanism.

- **2026-09-22** — Operator approved addressing the watcher review finding on
  this branch: asset additions/deletions and stale output, intentionally empty
  saves, configured content outside `src`, output exclusion, and serialized
  asset/page updates. Keep ordinary edit fast paths; add filesystem regression
  tests, update docs and consuming guidance. This expands the original watcher
  non-goal explicitly; no new branch or release requested.

- **2026-09-22 (review corrections)** — Operator approved one corrective pass on
  the open branch after Fable's review: manifest-driven hashed reloads, single-output
  Sass swapping, write-time output ownership plus collision warnings, removal of
  the unused manifest writer, accurate cwd errors, explicit unlink of the test
  junction, and settled event logging. Reproductions for findings 1–3 must fail
  against the current head before implementation; no new branch or release.

- **2026-09-22 Amendment (round three):** Accepted the operator's relayed
  review and lifecycle refinement on this branch. Preserve last-good hashed
  Sass on compile failure without retaining genuinely deleted sources; track
  collisions between active producers while retaining previous-page bytes for
  the sweep; normalize collision file paths at the report boundary. Also address
  conditional copy retry, staging-discard race, cancelled empty discovery,
  registration-time page paths, shared containment, sweep simplification and
  bounded watch-copy tracking. Benchmark edits remain separate.
  Transition tests were executed against HEAD before acceptance: Sass failure,
  resolved collision, page rename, standing refusal retry, settled-promise growth,
  plain/atomic report spelling, chdir, staging-field race and cancelled empty add
  failed as expected. Check-mode spelling already passed. Two initial fixture
  setup errors were corrected before their failures were counted as evidence.
  Round-two's blanket completion statement is superseded by these transitions;
  the fleet's one-shot builds could not establish watch lifecycle correctness.
  **Verification:** Final full suite: 1,659 passed, two skipped. Type checking
  passes; lint has no errors and retains the existing example-7 warning. Types,
  module notes and consumer collision guidance are updated, with obsolete
  accumulation wording banned. Runtime evidence is this session's own; the
  supplied browser and fleet evidence was not re-executed. Findings 1-11 are
  addressed within the tested transitions; finding 12 remains the operator's
  separate benchmark work. Ready for another review, with no push or release.

- **2026-09-23 Amendment (round four):** Reproduce and correct the measured
  duplicate-output getter cost, failed-replay restoration, page-shadowed asset
  restoration, disappearing asset stat, watch-copy path anchoring and inline
  template owner disclosure. Rename the registry producer map, centralize report
  path projection, move containment tests and remove the watcher re-export.
  The sweep now owns restoration even on rejection, eliminating the queue's
  source-to-output retry reconstruction. Source-stat ENOENT, failed replay,
  default and extra asset restoration, chdir and inline owner tests failed on
  ec94a9f before acceptance. Real file symlinks require privileges unavailable
  here; the unexecuted symlink test was not accepted, and the source-stat ENOENT
  seam was observed red then green on Windows instead. Cache invalidation is checked across all route setters and promotion.
  Defer the release/warning representation refactor (8c) and volume-aware case
  identity (10); document the latter explicitly rather than folding all Darwin
  paths. Retain copy-before-render ordering (11) with sweep-owned restoration.
  Operator benchmark guidance and earlier review additions remain separate.
  **Verification:** Final suite: 1,667 passed, two skipped. Type checking and
  formatting pass; lint retains only the existing example-7 warning. The first
  full run exposed the cache bypassing a deliberately mutated private route in
  a safety test; the write boundary now independently resolves and validates
  the destination. A separate red/green check pins reload paths after chdir.
  Three-run local build medians at 2,000 pages: scan 5,000 ms before / 2,652 ms
  after / 2,566 ms main; fanout 4,088 / 1,760 / 1,758 ms. The final after record
  includes the safety recheck. Raw records and interpretation are under
  `planning/benchmarks/2026-09-23-round4*`; the isolated main worktree and its
  dependency junction were removed. No browser run, push or release in this pass.

## Pulse log

- **2026-09-21** — Started from `main`; the only working-tree change was the
  operator-requested review table in `TODO.md`, carried into this branch. Scope
  accepted in conversation. Existing feedback emphasises red-first evidence,
  platform-aware verification, and checking actual consumer shapes. No independent
  review has run.

- **2026-09-22** — All seven success criteria met: source/output guards run
  before construction mutates the filesystem, protect every configured source
  in all three cleanup modes, resolve aliases and missing descendants, and retain
  safe `src/public` layouts. A temporary checkout of the old engine failed 39
  regression cases (49 passed); the fixed full suite passed 1,595 tests with two
  skipped. Type checking passed; lint had zero errors and one unrelated existing
  unused-function warning in example 7. Documentation, consuming skills, generated
  declarations and the TODO table are updated. UNC prefix preservation was needed
  so safety checks inspect the configured network-share location.
  **Eyeball: looked** — the operator ran the requested root-source command and
  pasted: `Error: folders.src (./) must not be the project root or a filesystem root; use a dedicated source folder such as ./src`.
  This is the expected early rejection; no separate wording endorsement was given.
  No independent review has run. Separate benchmark-skill working-tree edits were
  left untouched. Decision: ready for branch-close when requested; no release or
  PR requested in this session.

- **2026-09-22 (watcher checkpoint)** — Approved amendment implemented: asset
  add/change/unlink and directory deletion/recreation; per-copy output ownership
  and manifest reconciliation; bounded empty-save delivery; external configured
  content roots; overlapping-root deduplication and output exclusion; asset work
  serialized with rendering. Eight regression checks failed against the old
  engine (one rapid-edit check already passed). Full suite: 1,607 passed, two
  skipped. Type checking passed; lint has the same existing example-7 warning.
  The example-4 build completed within its 20-second timeout and produced the
  expected site name and footer. Final review added coverage for the development
  JSON sibling: observed deletion before correcting its protected filename;
  all six reconciliation integration cases then passed, including asset-root
  recreation. README, llms, AIKB, consuming skill and generated types updated;
  watcher TODO marked implemented. No independent review ran.
  **Eyeball: pending** — asked the operator to run example 4 in dev mode, clear
  and restore its footer partial, and confirm the preview follows both saves.
  No response received yet; this remains a manual checkpoint for branch-close.
  Decision: implementation complete, browser verification outstanding.

- **2026-09-22 (Fable correction checkpoint)** — Findings 1–7 addressed.
  The three reproduction fixtures became integration tests and all failed at
  the previous head before implementation. Expanded regression checks against
  that head produced nine failures and three passing controls; the final
  KISS_REPORT deletion case also failed before its write-site registration.
  The shared output registry now covers pages and JSON siblings, sitemap, llms,
  custom feed and redirect paths, debug files and report appends. Skipped writes
  claim nothing; page deletion releases ownership; atomic promotion moves it.
  Generated output collisions warn and later asset copies yield to the owner.
  Hashable manifest URL changes decide page re-rendering; Sass byte changes
  distinguish single-stylesheet swaps from full refreshes. Smaller diagnostic,
  logging and junction-cleanup corrections landed alongside removal of record().
  Full suite: 1,631 passed, two skipped; type checking passed; lint has zero
  errors and the existing example-7 warning. Coverage advisory: every touched
  engine module has its expected unit or integration coverage, including the new
  registry. Docs, types and consuming guidance updated; obsolete guidance banned.
  Fable's independent source review was considered; execution evidence for this
  corrective pass is this session's own, not an independent runtime review.
  **Eyeball: pending** — the original example-4 footer browser check still has
  no operator response. Decision: corrections complete; ready for review, with
  that manual checkpoint carried forward. No branch-close, release or push.

---

- **2026-09-22 (round-two checkpoint)** — The four boundary regressions passed
  after being observed red at `c69c2a7`. All eight review items are addressed;
  collision reporting stays advisory. Expanded ownership, refusal, fingerprint,
  report/exit-policy and declaration-consumer checks pass. Full suite: 1,644
  passed, two skipped, including bounded example builds and reproducible example
  9/11 records updated for the appended report field. Type checking passes;
  lint has zero errors and the existing example-7 unused-variable warning.
  Original source-root, overlap, alias and preservation criteria remain met by
  the full suite; documentation/types are updated. Watcher scope and public
  report addition are covered by the Amendments; benchmark edits remain outside
  this pass. **Eyeball: supplied verification accepted** — the operator relayed
  Fable's statement, "Verified in a real browser, and the pulse log's outstanding
  eyeball is closed." This closes the original checkpoint on that supplied
  evidence, not a claim that Codex or the operator personally drove the browser.
  Fable reports thirteen passing Playwright checks at `c69c2a7`; the reconnect
  window is documented with its probe and the absence of a `main` comparison.
  Decision: corrective pass complete, ready for review. No branch-close or push.

<!-- Reflection and final verdict are reserved for branch-close. -->
