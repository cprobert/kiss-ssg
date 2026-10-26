---
branch: feat/scorm-manual-default
base: main
status: open
opened: 2026-10-26
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

## Pulse log

- **2026-10-26** — criteria 1–5 met (full suite 2678 green; regression test seen red with 7 failures before the fix; `llms.txt` at 15,997; each CONTRADICTIONS pattern matched the HEAD text). Criterion 6 met by existing code (Amendment 1). Criterion 7 partial: `kiss-site-migrate` §0h written, CHANGELOG and bump wait for close. Criterion 8 met: the clean room passed `check`, and its 3 gaps were fixed (Amendment 2). Codex's stop-time review then found the resume snippet never bookmarked a view reached before `ready()`; both copies were fixed, seen red then green in a Moodle-like harness. The clean room has not been re-run on the fixed tarball. Criterion 9 not yet. No drift beyond the amendments; the surface is still public API (minor). **Eyeball: deferred** to `/branch-close` Step 5a (GUIDE.md:942, the SCORM paragraph). **Offer:** the cut of the 255/4,096 limits from `llms.txt` — kept. Decision: continue to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
