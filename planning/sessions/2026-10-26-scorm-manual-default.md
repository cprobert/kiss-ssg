---
branch: feat/scorm-manual-default
base: main
status: closed
opened: 2026-10-26
consolidated: 2026-10-26
---

# Session — 2026-10-26: SCORM bridge completes manually by default

## Intent (captured at /branch-open)

**Objective:** Make the SCORM bridge leave completion to the page by default, because in Moodle "complete on load" opens every later launch in review mode, so a page that bookmarks or saves stops recording after its first launch. Also document the trap and the Moodle behaviour, and ship the SCORM 1.2 schema files with the manifest.

Origin: a finding relayed by the internal-medicine session (branch `spike/scorm-storyline-comparison`), from that site's Moodle test ("resume does not work"). The kiss side was checked locally at `lib/scorm-bridge.js:509-519` (completes on load unless `manual`) and `:487` (writes nothing in review mode). The Moodle side was checked against `scorm_check_mode` in MOODLE_405_STABLE `mod/scorm/lib.php`, but only through a fetch tool's summary, not the raw source. The three-launch test in a real Moodle was not run here.

**Success criteria:**

- [ ] With no options, `scormBridgeScript()` never sets `cmi.core.lesson_status` to `completed` on load. A new attempt starts as `incomplete`, and completion comes only from `kissScorm.status('completed')`.
- [ ] Completion on load is still available through a named option, for sites that want it.
- [ ] A regression test for the new default is seen to fail against the unfixed code, then pass.
- [ ] `AIKB/upstream.md` has a Moodle entry: version 4.5, the source location (`scorm_check_mode`, "Force new attempt" = No → review), and how to re-check it (in the source and with a three-launch test).
- [ ] The trap is stated in `AIKB/scorm-bridge.md`, in `GUIDE.md`'s packages/bridge section and in one line of `llms.txt`. `test/aikb.test.js`'s 16,000-character cap still passes. Old instructions that the change makes wrong are banned in the `CONTRADICTIONS` table of any skill that taught them.
- [ ] `lib/package-manifest.js` ships the four SCORM 1.2 XSDs (`imscp_rootv1p1p2.xsd`, `adlcp_rootv1p2.xsd`, `imsmd_rootv1p2p1.xsd`, `ims_xml.xsd`) in each package, with an `xsi:schemaLocation` on the manifest root. Identifiers still derive from page ids.
- [ ] An upgrade note goes in `CHANGELOG.md` and in the `kiss-site-migrate` skill, with a 2.x minor bump.
- [ ] Clean-room: a fresh agent given only what ships (the packed tarball) builds, in an empty folder, a SCORM page that resumes (bookmark/save, then status('completed') when done) and passes `kiss-ssg check`. It reports every place it had to guess.
- [ ] `npm run gates` is green.

**Non-goals / out of scope:** an adaptive default (completing on load unless bookmark/save was called); a periodic 60-second commit (the bridge's 2.5 s `commitSoon` stays); changes to `cmi.interactions`; SCORM 2004; changing identifiers to match Storyline's.

**Impact surface:** public API — the bridge's default behaviour, observable by every site that packages SCORM, changes. That makes this a 2.x minor with an upgrade note.

**Expected shape:** planned — the defect, the fix and the documents to touch are all known up front.

**Delegation convention:** one session implements. Sub-agents are used only for the clean-room run and the Codex review, and agents never commit.

### Amendments

- **2026-10-26: item D was already built, and nothing changes.** `config.packages.schemas: true` (2.8.0, `cc34ddf`) already puts the SCORM 1.2 XSDs at each SCORM package's root and names them in `xsi:schemaLocation`, and tests validate every manifest against them. The fourth file, `imsmd_rootv1p2p1.xsd`, stays out, as `lib/schemas/scorm12/NOTICE.md` decided. Checked locally: the manifest's `<metadata>` holds only `<schema>`/`<schemaversion>` and no `imsmd:lom`, and the shipped XSDs `xsd:import` only `ims_xml.xsd` and `imscp_rootv1p1p2.xsd`, despite a comment in the latter saying "Imports IMS meta-data xsd". It becomes necessary only if kiss ever writes IMS metadata. The operator agreed, so criterion 6 is met by existing code.
- **2026-10-26: three gaps from the clean-room run, absorbed (operator's choice: all three).** (1) The example GUIDE calls "a short working version to start from" (example 13's milk lesson) had no resume, so it now bookmarks each view inside `kissScorm.ready()` and restores `resumed`. (2) GUIDE now says that a page's own `status('completed')` also ends resume in Moodle, by design, so completion belongs at the end of the lesson. (3) GUIDE now says that answers, a score and a status sent before `ready()` are queued, not dropped. Sibling found while editing: GUIDE's browse-mode line ("not marked complete when seen") assumed the old default. Not taken up: the README's `plugins/` link to a folder that does not ship, which predates this branch.

- **2026-10-26: example 13's milk lesson gains a quiz, the pattern for MCQs in a SCORM lesson (operator: this branch, milk lesson grows a quiz).** The pattern is taken from internal-medicine's lesson generator (`tools/generate/src/partials/` in the `spike/scorm-storyline-comparison` worktree), restyled neutral. The questions are model data (`src/models/milk.json`), drawn by a `question` partial and run by a `quiz-script` partial, plus a finish panel. The learner tries before being told. Every choice is an interaction with a stable id. Answers return on the next launch, behind a fingerprint. Nothing is scored, and the learner marks the lesson complete. One simplification over the source: no queue of its own for interactions before `ready()`, since the bridge queues them. `kiss-page-add` points to it (skill-coverage row, seen red first). The impact is still public API docs and examples, so it stays a minor.

- **2026-10-26: the version is 2.8.2, a patch, against the proposal (operator's decision at /branch-close).** Claude proposed 2.9.0, a minor, because a changed default that sites must adapt to is a minor under CLAUDE.md's rule. The operator chose a patch, and criterion 7 is met at 2.8.2. The upgrade note (`kiss-site-migrate` §0h) and the CHANGELOG entry carry the steps, retitled from 2.9.0 to 2.8.2.

## Pulse log

- **2026-10-26** — criteria 1–5 met (full suite 2678 green; regression test seen red with 7 failures before the fix; `llms.txt` at 15,997; each CONTRADICTIONS pattern matched the HEAD text). Criterion 6 met by existing code (Amendment 1). Criterion 7 partial: `kiss-site-migrate` §0h written, CHANGELOG and bump wait for close. Criterion 8 met: the clean room passed `check`, and its 3 gaps were fixed (Amendment 2). Codex's stop-time review then found the resume snippet never bookmarked a view reached before `ready()`; both copies were fixed, seen red then green in a Moodle-like harness. The clean room has not been re-run on the fixed tarball. Criterion 9 not yet. No drift beyond the amendments; the surface is still public API (minor). **Eyeball: deferred** to `/branch-close` Step 5a (GUIDE.md:942, the SCORM paragraph). **Offer:** the cut of the 255/4,096 limits from `llms.txt` — kept. Decision: continue to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-10-26: SCORM bridge completes manually by default, and a quiz pattern for SCORM lessons

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** kiss-ssg 2.8.2 on `feat/scorm-manual-default`, 14 commits from `faad840` to the bump.

- **The default** (`a0d230e`): `{{scormBridge}}` leaves completion to the page, and `complete="seen"` opts back in. The Moodle trap is written into GUIDE, `llms.txt`, AIKB and both skills.
- **Resume in example 13** (`c0238ba`, `66ad4d2`): the milk lesson restores the learner's view, including one reached before the bridge is ready.
- **The quiz** (`5782f1a`): example 13's milk lesson is now the pattern for MCQs in a SCORM lesson.
- **Three quiz fixes** (`db5f515`, `fd0d09f`, `a9bcea2`).

## Reflect — what the session was

It started **planned** and became **emergent**, and both shapes served the work.

**The planned part** came from a peer session (internal-medicine). It relayed a precise, source-cited finding: Moodle's `scorm_check_mode` opens a completed attempt in review mode, so completion on load froze resume after the first launch. It proposed options A–D. The operator picked (ii), a manual default, and D, the XSDs, in two answers, and `/branch-open` wrote that down.

**Then the branch grew in four ways**, each recorded as an Amendment:

- **D was already built.** It had shipped in 2.8.0 (`config.packages.schemas`), so nothing was needed.
- **A clean-room agent found three doc and example gaps.** The example GUIDE points to had no resume at all.
- **The operator added a feature.** Mid-branch they asked for an MCQ example, drawn from internal-medicine's generator.
- **Independent reviewers found three bugs** in the new code. All three were the same class: state handled before `kissScorm.ready()`. The resume snippet, the quiz's early-answer merge and the quiz's reset-before-ready merge each lost data written before the bridge decided. A fourth finding, from the Codex review, was keyboard focus after "Start again".

The emergent part was good drift: the MCQ example is on the same theme (a resumable SCORM lesson that reports its own completion) and in the same example.

## Evaluate — how the human supervised the AI

**Problem framing was strong, and done through the harness.** The operator routed a peer session's finding into this one, and named it before any work started. Every fork was settled in one `AskUserQuestion` answer: the default, D, the clean-room fixes, the MCQ scope and branch, and the version. Nothing was left for Claude to guess.

**Learning engagement had one real moment.** On D the operator stopped the options and asked "why are imsmd_rootv1p2p1.xsd unused". They said their instinct was to include it, but not if it did nothing. Claude checked rather than repeating `NOTICE.md`, reading the XSDs' `xsd:import`s and the manifest's `<metadata>`. The answer then decided the outcome. That is the rubric's "ask the AI to explain before accepting", and it changed what shipped.

**Pushback and steering included one override with no reason given.** The operator chose 2.8.2, a patch, against the proposed 2.9.0. The repo's rule makes a changed default that sites must adapt to a minor. The operator may be right, but the reason was not said, so the Amendment records only that it was their call. The 2026-10-13 log asked for exactly this, "when you overrule a measured result, say the reason in a sentence", and this is its second appearance.

**Verification and ownership: the human did none of it at first hand, and the system did a lot.** The eyeball was deferred twice: at the pulse to `/branch-close`, and at the close to the PR. Nobody but Claude read the GUIDE paragraph every consuming site's agent will follow, or looked at the quiz.

Against that, the verification that did happen was independent of the author, and it worked:

- **The Codex stop-time hook** caught two real bugs: navigation before `ready()` was never bookmarked, and an early answer erased saved ones.
- **The operator-typed `/codex:review`** caught the focus loss.
- **The peer session's own Codex review** found the reset-before-ready case and relayed it.
- **The clean-room agent** found the three doc and example gaps.
- **Claude saw each fix fail, then pass,** against the built page under a Moodle-like harness (and Chromium for focus) before committing it.

That was verification by design rather than by eye: real, but only machine-checked.

**Where the human intended to supervise, versus where they did:** the pulse's eyeball was the checkpoint meant to hold, and it was deferred to the close, then to the PR.

**Claude's own misses:**

- **It did not sweep the class.** Codex's first stop-hook finding was a `ready()` timing bug in the resume snippet (`66ad4d2`). Claude fixed both copies of that snippet, then wrote a quiz an hour later with the same class of bug in its own `ready()` callback. CLAUDE.md's "after the first finding, fix the class" rule asked for every `ready()` callback to be audited for "what happens to work done before this fires?" That audit would have found `db5f515`'s and `a9bcea2`'s bugs before any reviewer did.
- **It used `{{page.id}}` before checking it existed,** and caught that itself before building.
- **It told the peer session the example credits their generator.** It does not, and Claude corrected that in a follow-up message.

**Harness leverage was the session's strength:**

- cross-session messaging, both ways, including bug reports sent back to internal-medicine;
- a clean-room sub-agent given only the packed tarball;
- the Codex stop hook and `/codex:review`;
- Playwright through `npm run screenshot`, and a direct script when domino could not track focus;
- scratch harnesses that modelled Moodle's mode and entry rules.

The gap: none of those harnesses is committed. The quiz's behaviour (resume across launches, interactions, the merge, focus) is covered by no test in the suite. `examples.test.js` checks only that the page builds and holds the right calls.

**Competency level: Active supervisor.** The operator framed every fork, asked one conceptual question that changed the outcome, ran an independent review unprompted, and wired the peer session into the loop. It is not Agentic engineering lead, because the human's own verification was absent: two deferred eyeballs and an unexplained override. It is not Assisted operator, because the decisions were the operator's and they were informed ones.

## Feedback — recommendations for next session

- **Operator — the eyeball has now been deferred to the PR. Do it there, on two artefacts:** the SCORM paragraph at `GUIDE.md:942`, and the quiz screenshot `milk--1440-light.png`. Better still, the three-launch Moodle test the upgrade note describes. Every behaviour on this branch was proven against a model of Moodle, not Moodle.
- **Operator — when you choose against a proposal, give the reason in one sentence.** The patch-versus-minor call is recorded with no rationale, the second time running (after 2026-10-13). A reader of the CHANGELOG cannot tell whether 2.8.2 means "small" or "we don't treat default changes as minor".
- **Claude — after the first bug of a class, audit every sibling before writing new code of the same shape.** The class here was "work done before `kissScorm.ready()` fires". It surfaced three times (`66ad4d2`, `db5f515`, `a9bcea2`), each found by a reviewer rather than by Claude. The next `ready()` callback written should come with the question asked of it explicitly: what was done before this, and does this callback keep it?
- **Process — commit the Moodle-like harness as a test.** The scratch `milk-resume.mjs` and `milk-quiz.mjs` (scratchpad) model what matters: data kept across launches, `entry` resume after a suspend, review mode once complete, and an LMS page still loading. Folded into `test/integration/` against the built example 13 page, they would make the four quiz behaviours and the resume regression gate-checked rather than session-checked. Focus needs a real browser: either a Playwright test or a recorded note in `AIKB/testing.md`.
- **Both — the peer-session loop worked; keep it two-way.** Internal-medicine sent a precise finding, kiss sent back two bugs and fixes, and internal-medicine sent back a third that kiss's review had missed. That is review by a second codebase with the same code, and it found what neither author did.

## Verdict — did we achieve the objective?

**Brief:** make the SCORM bridge leave completion to the page by default, document the Moodle trap, and ship the SCORM 1.2 schema files.

**Verdict: met, and the objective grew in a good direction** (the quiz pattern), with one decision taken against the proposal (patch, not minor).

- [x] With no options, `scormBridgeScript()` never sets `completed` on load: a new attempt starts `incomplete` and completes only on `status('completed')`. Evidence: `test/unit/scorm-bridge.test.js`, both rendered and minified.
- [x] Completion on load is still available through a named option: `complete="seen"`, tested, and used by example 13's espresso pages.
- [x] The regression test was seen to fail, then pass: 7 failures against the unfixed bridge before `a0d230e`.
- [x] `AIKB/upstream.md` has the Moodle entry, with the version, the source location and the re-check. It says plainly that this repo saw the source only through a fetch tool's summary.
- [x] The trap is in `AIKB/scorm-bridge.md`, GUIDE and `llms.txt`, which is at 15,997 characters, under its cap. Old sentences are banned in `CONTRADICTIONS`, and each pattern matched the old text.
- [x] The XSDs: already shipped in 2.8.0 (Amendment 1). `imsmd` is left out with evidence, and the operator agreed.
- [x] The upgrade note is in `CHANGELOG.md` and `kiss-site-migrate` §0h, with the bump at **2.8.2, a patch, not the minor the criterion named** (Amendment 4, the operator's decision).
- [x] The clean room passed `kiss-ssg check` and reported its guesses. Its three gaps were fixed. It was not re-run on the fixed tarball.
- [x] `npm run gates` is green: test, lint, typecheck, format and pack, with 338 files in the tarball. The Codex review over `main...HEAD` at the close found no actionable regressions.

**What is concretely better:** a kiss SCORM page that bookmarks now resumes on every launch in Moodle, not just the first, and every agent-facing doc says why. Kiss users also get a worked, accessible MCQ pattern for SCORM lessons, with answers that survive a relaunch, choices reported as interactions, and learner-marked completion.

**Still open:**

- the operator's eyeball, deferred to the PR;
- a test in a real Moodle;
- the quiz and resume behaviours, which have no committed test (Feedback, Process);
- internal-medicine's own copy of the fixes, which waits there for a branch.
