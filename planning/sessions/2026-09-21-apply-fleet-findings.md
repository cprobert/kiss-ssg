---
branch: feat/apply-fleet-findings
base: main
status: closed
opened: 2026-09-21
---

# Session — 2026-09-21: Apply what the 2.5.0 fleet upgrade taught

## Intent (captured at /branch-open)

**Objective:** Turn the findings of `planning/reviews/2026-09-21-fleet-upgrade-2.5.0.md` — seven
client sites moved onto the published 2.5.0 — into engine and doc changes, so the next upgrade of a
real site is caught by kiss rather than by the person doing it.

**Provenance.** Every item below was measured on a real site during the fleet run and re-derived in
the orchestrating session; the review names the site and the evidence for each. The operator's
decisions (2026-09-21): warn on the missing redirect format, but only when a redirect file would be
written; implement the per-page canonical override and withdraw the overridden page from sitemap,
llms and feed; fix the staging-path leak and gate it; the plugin pointer belongs where a new-site
agent reads it; and the bench baseline contradiction is settled in favour of the 09-06 view — a
committed record is history, not a baseline.

**Success criteria:**

- [ ] **The upgrade path is honest about a `file:` link.** `kiss-ssg check --summary` names the
      kiss-ssg it resolved (path and version) and says plainly when `node_modules/kiss-ssg` is a link,
      so a site still building against a working tree cannot report a registry version. A test asserts
      the printed line, both shapes. The `kiss-site-migrate` skill's upgrade step carries the one
      command that re-resolves a link (`npm install kiss-ssg@^<v> --save-dev`) and why a plain
      `npm install` does not, with a `skill-coverage` row; the CHANGELOG's "Upgrading?" paragraph
      carries the same sentence at close.
- [ ] **The missing-format signal is a warning, and only when it matters.** A build whose pages carry
      `aliases` and whose `redirects.format` is unset logs the existing message at `warn`; a build with
      no aliases logs nothing at any level. A test asserts the printed line and its absence, seen red
      first. `to-verify.md`'s judgement-call item is deleted as answered.
- [ ] **A page can name another URL as canonical.** A page option `canonical: '<absolute URL>'` is
      rendered verbatim by `{{canonical}}` in place of the derived URL; the page is then absent from
      `sitemap.xml`, `llms.txt` and `feed.xml`, and the report counts how many pages were withdrawn
      for that reason. A value that is not an absolute `http(s)` URL fails that page's render with a
      message naming the page and the value. Tests seen red first; `llms.txt`, `README.md` and
      `types/` updated in the same commit; a `skill-coverage` row in the skill an agent would reach
      for; measured on learna-kiss's shape (a controller-set cross-domain canonical) before close.
- [ ] **Site code never sees the staging path.** Under `KISS_CHECK`, `this.config.folders.build`
      inside a `complete()` callback is the site's build folder, exactly as it is after an atomic
      promotion (test seen red first). A gate test builds under `check` and under `'atomic'` and
      asserts the staging folder's name appears in no written file, in `report()`, in the
      `KISS_REPORT` line, in `last-build.json` or in `dependency-graph.json`. "What does this now
      swallow?" is answered in the commit message.
- [ ] **A new-site agent is told the plugins exist.** `llms.txt`'s opening section — the part an
      agent reads when it is about to write a build script — names the two plugins, the install
      commands, and that it should offer them to the site's owner; the existing paragraph at the
      knowledge-base section stays consistent with it.
- [ ] **The bench baseline sentence is settled.** `CLAUDE.md`'s bench comment no longer calls
      `planning/benchmarks/baseline-main.json` the branch's baseline: a committed record is history,
      and a comparison is against a record made from the base branch on the same machine.
- [ ] **The generated `AIKB/README.md` says what the hash is** — sha1 of the LF-normalised bytes —
      in `lib/aikb.js`'s template.
- [ ] Every touched `lib/` module's `AIKB/` doc updated in the same commit; `npm run gates` green on
      this machine (Windows) and in CI on both legs.

**Non-goals / out of scope:**

- Pushing or deploying any client site. The seven sites' local commits stay local; their site-level
  findings (diploma-msc's trailing-slash sitemap, student-handbooks' stylesheet path, learna-kiss's
  Tailwind `-i`) are site work, listed in the review, not engine work.
- Making a sibling helper module reload in dev (the standing honest-notice decision).
- An ignore pattern for `links.check` (review finding 8) — ergonomic, wants its own design.
- Detecting the `file:` link inside `npm install` itself — that is npm's behaviour; kiss reports it,
  it does not work around it.

**Impact surface:** public API — a new page option (`canonical`), a new line in `check`'s output, a
log-level change a site's log reader can observe, and a report field. Obliges `llms.txt`,
`README.md`, `types/` and the skill-coverage rows; the bump is **minor** (2.6.0).

**Expected shape:** planned — every item has a measured reproducer and a named location in `lib/`.

**Delegation convention:** one session implements, red-first per item, one commit per criterion.
Before close, one fresh-context agent reviews the diff of the canonical option and the staging fix
adversarially (new behaviour surface on `{{canonical}}`, and a fix that touches the promotion path);
if that review does not run, the close says the branch has no independent review. Agents never
commit.

**Contract:** none — one workstream.

### Amendments

**2026-09-21 — the bump is a patch (2.5.1), by the operator's decision at /branch-close.** The Intent
block above declares the surface as public API and the bump as minor (2.6.0), which is what semver
says for a new page option and a new report key. Asked at the close's Step 4a with minor as the
recommended option, the operator chose patch. Recorded here rather than by editing the Intent:
the surface finding stands, the versioning of it is the operator's call — the same reasoning 2.4.0
and 2.5.0 used, that he owns every consuming site — and the CHANGELOG entry says so in its first
paragraph. Every doc the branch wrote that said "2.6.0" now says 2.5.1.

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-09-21 (first pulse, after seven slices)** — hash wording **met** (`a3b641a`; `AIKB/aikb.md`
  had said the opposite of the code and now agrees with it); bench sentence **met** (`5d036ff`); warn
  **met** (`ed35ced`; the notice test flipped to warn and seen red first, plus a guard pinning silence
  with no aliases; every doc that said "notice" now says warning; `to-verify.md`'s item deleted);
  staging path **met** (`90bf69d`; config never repointed, an engine write root instead; three tests
  seen red first — callback under check, template under atomic, gate over every written file, the
  report, the KISS_REPORT line and last-build.json; one existing test re-aimed at the write root);
  canonical **met bar one measurement** (`cab8664`; eleven tests seen red first across the helper,
  the three readers, the report and an end-to-end build; validated at registration rather than at
  render — stricter than the criterion's wording and in its spirit, recorded here rather than
  silently; the learna-kiss-shape measurement is for the close); engine line **met** (`cab8664`; unit
  over a temp tree with a real junction, end-to-end through the bin for both wordings; on stderr in
  both modes so stdout stays the report — a design call the criterion left open); plugin pointer
  **met** (`cab8664`, llms.txt's opening); AIKB docs updated in the same commits, gates green on this
  Windows machine (1540 tests, lint, typecheck, format, pack), CI **not yet** — nothing pushed. No
  drift: the surface is the declared public API, minor bump. One observation, not a defect: this
  repo's own examples resolve the engine by package self-reference, so the line says "no
  node_modules/kiss-ssg found from here — the script resolves the package some other way", which is
  true and could later name self-reference. Three slices share one commit because the pre-commit
  formatter refused a hunk-level split of the check test; the message names all three. **Eyeball:
  looked** — the operator ran `node ../../bin/kiss-ssg.js check router.js --summary` in
  `examples/11-blog` and quoted the stderr line verbatim: "kiss-ssg: no node_modules/kiss-ssg found
  from here — the script resolves the package some other way". Decision: **continue** — measure the
  canonical option on learna-kiss's shape, push for CI's two legs, then close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-09-21: Apply what the 2.5.0 fleet upgrade taught

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** eleven commits `172c122..31ad6f6` on `feat/apply-fleet-findings`, bumped to
2.5.1: a per-page `canonical` option honoured by the helper and withdrawing the page from the three
discovery files; `config.folders.build` never repointed at the staging folder (an engine write root
instead); the missing-redirect-format signal at `warn`; `kiss-ssg check` naming on stderr which
kiss-ssg the site resolves and whether it is a link; the migrate skill carrying the npm link hazard;
llms.txt naming the plugins up front; the bench-baseline sentence settled; the AIKB hash wording
corrected. Six review findings from two Codex passes, all re-derived here before being fixed.

## Reflect — what the session was

The goal was framed before a line was written, and by an unusually strong brief: not a request but a
**measurement**. Every item on the intent file came from the fleet run earlier the same day — seven
sites, each with a named reproducer — so the objective read "make kiss catch what the person had to
catch by hand", and each criterion named the site that had proved the gap. That made the shape
**planned** end to end, and the plan held: no criterion was re-cut, the one design call the criteria
left open (where the engine line prints) was decided at the point of building and recorded in the
pulse, and the one deviation from a criterion's wording (canonical validated at registration rather
than at render, which is stricter) was named in the pulse log rather than absorbed.

What the plan did not anticipate was the size of the staging fix. The criterion asked for the
callback to see the real folder under `check`; the honest fix was to stop repointing
`config.folders.build` at all and give the engine a private write root, which touched every write
site in `lib/kiss.js` and the five writer modules. That is the CLAUDE.md steer — "where the right
shape and the compatible shape differ, take the right shape" — applied to an internal, and it paid:
the same change closed `{{config.folders.build}}` rendering the staging path under `'atomic'`,
which nobody had reported.

## Evaluate — how the human supervised the AI

Three dimensions discriminated this session.

**Verification & ownership — active, and in the right place.** The pulse-time eyeball happened
where the ritual now puts it: the operator ran `node ../../bin/kiss-ssg.js check router.js --summary`
in `examples/11-blog` while the artefact was warm and quoted the stderr line back verbatim. That is
the lesson four earlier closes deferred, finally done at the cost of one minute, and it is recorded
in the pulse log rather than asked again at the close. Every fix on the branch had a test seen red
first (twenty-one across the seven slices and the two review rounds), and the two that could not be
red-first — the no-alias guard, the URL-is-relative regression — are labelled as guards in their
comments rather than allowed to look like coverage.

**Harness leverage — the standout, and two-sided.** The operator opened a second session, pointed
it at this branch, and had it run a Codex review while this session was still building; then asked
this session to open a line to it. The exchange worked because both sides kept the re-derivation
rule: the peer relayed three findings explicitly labelled "Codex's claims, not checked", this
session read the code before accepting any, and all three held. The close's own Codex pass then
found three more — one of them the exact JSDoc-displacement hazard CLAUDE.md names, introduced by
this session's own insertion and invisible to every gate — and the re-run came back clean. Six
findings from an instrument outside the loop, none of which this session's self-check had caught:
the "agreement from the same model family is not confirmation" lesson from the last branch, made
concrete by the opposite case. The miss on this dimension is also real: the branch was pulsed once,
after seven slices, when the ritual asks for a pulse per slice boundary; the Steer beat was thin
until the review loop supplied the steering instead.

**Pushback & steering — the operator overrode the bump, and did it in the right channel.** The
intent said minor and the close recommended minor; the operator chose patch. That is a decision
the session disagreed with on semver grounds and said so in one sentence, then recorded as a dated
Amendment and in the CHANGELOG's first paragraph rather than by editing the Intent. A disagreement
with a record beats an agreement without one.

**Where the human intended to supervise versus where they actually did.** The intent to supervise
was expressed through instruments — the second session, the Codex pass, the eyeball — more than
through mid-branch questions, and it was effective: every substantive correction on this branch came
from one of those instruments, not from the operator reading the diff. The one place momentum
carried past a checkpoint was the commit split: the pre-commit formatter refused a hunk-level split
of the check test, and three slices folded into one commit under the canonical slice's message; this
session caught it and amended the message, but only because it read its own `git log` afterwards.

**Competency level: Agentic engineering lead.** Earned by the instrument design rather than the
line-by-line review: an independent session running an independent reviewer against a branch this
session could not review on its own terms, the eyeball done at the moment it was cheap, and a
versioning decision taken deliberately against the recommendation with the reasoning on the record.

## Feedback — recommendations for next session

- **Claude — pulse per slice boundary, not once per seven.** The ritual says so and the branch did
  not; the review loop supplied the steering the pulses should have. On a branch with more than
  three slices, offer the pulse after the third whatever the momentum.
- **Claude — after inserting anything between a JSDoc block and its definition, regenerate types
  and read the diff of the declaration file before committing.** The `parseArgs` signature degraded
  to `any[]` in a commit that regenerated `types/` and passed the byte-identity gate; only a reviewer
  saw it. The `types.test.js` pin now covers `parseArgs` the way it covers `registerPartials`, and the
  rule that made it findable is already in CLAUDE.md — it needs applying at the point of insertion.
- **Claude — validate by parsing AND by delimiter, and say why in the test.** `new URL` accepted
  two forms a browser resolves relatively; the fix was one regex line, but the lesson is that "does
  it parse" and "does it mean what the author meant" are different questions, and the second was
  the one that mattered.
- **Both — a second session running the reviewer is the check that worked; keep it.** Two Codex
  rounds found six defects the gates could not see and this session's self-check did not. The
  cost was one message each way. Make it the default for any branch that touches `lib/`.
- **Operator — the bump decision is on the record; the next consumer to bite is the one to
  watch.** 2.5.1 carries a new page option and report key under a patch. If a site on `^2.5.0`
  ever picks it up unexpectedly, that is the day the minor was the right call — the amendment
  says why it was not taken, so the reasoning is there to revisit.
- **Process — the pre-commit formatter cannot check a hunk-level stage, so stage by file.** A
  `-U0` partial patch of a test file produced a staged blob the formatter refused, and the fallback
  `git add -A` folded three slices into one commit. Next time a shared file blocks a per-criterion
  split, commit the shared file's whole change with the first slice that needs it and say so in the
  message, rather than staging hunks.

## Verdict — did we achieve the objective?

The brief: turn the fleet upgrade's findings into engine and doc changes so the next upgrade of a
real site is caught by kiss rather than by the person doing it. **Met**, with one measurement
stronger than the criterion asked and one bump decision recorded against the recommendation.

- [x] **The upgrade path is honest about a `file:` link.** `describeEngine`/`engineLine` in
      `lib/check.js`; stderr line in both modes; resolved from the script's folder; a link into
      `node_modules` reported neutrally, a working tree named as such. Unit tests through real
      junctions, end-to-end through the bin. The migrate skill carries the command that re-resolves
      a link, with a skill-coverage row; the CHANGELOG says the same (`cab8664`, `a38c39a`, `31ad6f6`).
- [x] **The missing-format signal is a warning, only when it matters.** `ed35ced`: the line at
      `warn`, seen red as a notice first; the no-alias guard; every doc reworded; `to-verify.md`'s
      item deleted.
- [x] **A page can name another URL as canonical.** `cab8664` plus the two review rounds: helper,
      three readers, report field and summary count, registration-time validation now requiring the
      `://` delimiter and a parsed host; measured on learna-kiss's reduced shape (a controller-set
      cross-domain canonical: the course pages render the sister URL, the sitemap lists only home,
      llms.txt omits them, the feed has zero items). Stricter than the criterion's "fails the
      page's render": it fails at registration, recorded in the pulse.
- [x] **Site code never sees the staging path.** `90bf69d`: config never repointed, an engine
      write root; three tests seen red first; the gate walks every written file, the report, the
      `KISS_REPORT` line and `last-build.json`. "What does this now swallow?" answered in the commit
      message: nothing found, one existing test re-aimed at the write root.
- [x] **A new-site agent is told the plugins exist.** llms.txt's opening (`cab8664`).
- [x] **The bench baseline sentence is settled.** `5d036ff`, the 09-06 view, operator's choice.
- [x] **The generated `AIKB/README.md` says what the hash is.** `a3b641a`, and `AIKB/aikb.md` no
      longer contradicts the code.
- [x] **AIKB docs in the same commits; gates green on this machine and in CI on both legs.** Green
      here at every commit (final: 1548 tests, lint, typecheck, format, pack); CI's two legs run on
      the PR this close opens — not yet observed at the time of writing, said plainly.

**Measurably better:** a site that names a cross-domain canonical no longer hand-rolls a helper;
a site with aliases and no format hears a warning; a `check` under any package manager says which
engine it found; a callback under `check` prints the folder the author configured. **Still open:**
CI's two legs on the PR; the 2.5.1 publish and the plugin update that follows it; and the client
sites' pushed commits, which pin `^2.5.0` and will pick 2.5.1 up on their next install.
