---
branch: feat/apply-fleet-findings
base: main
status: open
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
