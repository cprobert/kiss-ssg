---
branch: feat/learning-packages
base: main
status: open
opened: 2026-10-24
---

# Session — 2026-10-24: Learning packages — IMS content packages and SCORM 1.2, one per lesson

## Intent (captured at /branch-open)

**Objective:** Teach kiss to make learning resources a learning management system (Moodle first) can import — one IMS content package or SCORM 1.2 package for each group of pages, many in one build — with a small SCORM bridge so interactive pages can record formative results; driven by a real consumer, the MSc Internal Medicine programme (`C:\Code\programmes\internal-medicine`, branch `spike/moodle-packaging`), packaging its M2 lesson 1.

**Success criteria:**

- [ ] The contract (`planning/plans/2026-10-24-learning-packages.md`) is written, and critiqued by a fresh-context agent before any code; its findings are resolved in the contract, in place.
- [ ] A package writer in `lib/`, with its `AIKB/` doc and `test/unit/` test, writes one zip for each package a build declares: a page says which package it belongs to, and a build can hold many. Formats: IMS CP 1.1 and SCORM 1.2.
- [ ] The manifest lists only files in the zip, is written without the HTML minifier, and is well-formed; two identical builds write byte-identical zips; a page that links outside its package is reported.
- [ ] A SCORM 1.2 bridge ships with kiss: it finds the LMS's `API`, reports completion, and records an interaction and a score; outside an LMS it does nothing, so the same page works on the web.
- [ ] The public API is documented as `CLAUDE.md` § Rules asks: `GUIDE.md`, one line in `llms.txt`, `README.md`, `types/`, and the plugin skill that would reach for it, with its row in `test/unit/skill-coverage.test.js`.
- [ ] Clean room: a fresh sub-agent, given only the packed tarball and the docs a user reads, makes a two-lesson course of packages in an empty folder; the result passes `kiss-ssg check`, and it reports every place it had to guess.
- [ ] The consumer builds M2 lesson 1's IMS CP and SCORM packages through this branch (linked from the worktree), and the operator uploads them to a Moodle test course.
- [ ] A roadmap for kiss and learning resources (`planning/specs/2026-10-24-learning-resources-roadmap.md`): IMS CP and SCORM 1.2 here; then what Moodle teaches us, H5P, SCORM 2004 or cmi5, LTI.
- [ ] `npm run gates` is green.

**Non-goals / out of scope:** H5P in kiss (the consumer builds its H5P package itself for the spike; the roadmap weighs it); SCORM 2004, cmi5 and LTI; publishing to npm; changes to the dev watcher for packages beyond what a one-shot build needs.

**Impact surface:** public API — a new writer, a page option naming its package, and the bridge: a minor bump (2.9.0) by `CLAUDE.md` § Git workflow, proposed at close.

**Expected shape:** emergent — what Moodle keeps, and what a per-lesson package needs from the page registry, are found by building one.

**Delegation convention:** one session (Claude) briefs and builds; one fresh-context agent critiques the contract, read-only. Agents never commit; the operator reviews the diff. The operator runs a separate kiss session in `C:\Code\kiss-ssg`; this branch lives only in the worktree `C:\Code\kiss-ssg-learning-packages` and never touches that checkout.

**Contract:** `planning/plans/2026-10-24-learning-packages.md` — what kiss owns (the writer, the manifest, the zip, the bridge) and what a consuming site owns (which pages form a package, its titles, its interactive markup), and the seams between them. Amended in place with dated sections.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- 2026-10-24: After the adversarial read of the contract (its amendment holds the detail), the operator decided: packaging is a convention, not a method (a page's `package` option, with `config.packages` for the settings and `false` to turn it off); zips are stored, not deflated, with a content hash per package and a packages diff in `kiss-ssg check`; a link between member pages of a SCORM package is a finding; and each page's item and resource identifier comes from its `id`, a promise that a member page without a usable id fails the build to keep. The branch also gains `examples/13-course-packages`, because what ships is an example. Agreed by the operator.
- 2026-10-24: Sequence changed: W's IMS CP path is built first (membership, the closure, the zip and the IMS CP manifest, the report), so the operator uploads the consumer's M2 lesson 1 to Moodle sooner and the rest acts on what Moodle shows; then SCORM 1.2, the bridge, the packages diff in `check` and the example. Agreed by the operator.
- 2026-10-24: Learning packages are for anyone, not one course: kiss owns the format (membership, closure, manifests, zip, the bridge and `window.kissScorm`), the consumer owns the course, and no kiss file names the first consumer (test fixtures that borrowed its words are renamed). A pipeline step declares the files it writes into the build folder in `outputs`, and kiss claims them (Codex round 6; options weighed in the contract's amendment (3)). LTI is not pursued. Agreed by the operator.
- 2026-10-25: The `/code-review` of the branch found ten defects; they are fixed in order of severity on this branch. For `/branch-close`: the 2.9.0 `CHANGELOG.md` entry must carry the upgrade note that `package` is now a page option, packaged by default (a site whose pages already carry a `package` key changes behaviour). The `kiss-site-migrate` skill's § 0f already says it.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-24** — contract met (written, read adversarially by a fresh agent, then by Codex; two amendments, the acceptance checks rewritten as one list of 31). Z `lib/zip.js` (`64cb1c3`) and X `lib/package-manifest.js` (`dcc76b8`) built test-first, each test seen to fail against a deliberately broken module, measured: byte-identical zips across input order and a second process, read back by Python's `zipfile` and `unzip -t`; manifests well-formed under Python's strict `xml.etree`. `npm run gates` green at each. Not yet: M and W (membership and the writer), B (the bridge), docs, the example, the clean room, the consumer's Moodle upload, the roadmap. No drift beyond the recorded amendment. Decision: continue to M and W.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
