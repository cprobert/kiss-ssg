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

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
