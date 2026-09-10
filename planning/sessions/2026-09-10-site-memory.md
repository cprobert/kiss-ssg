---
branch: claude/skills-marketplace-aikb-concept-fs01nd
base: main
status: open
opened: 2026-09-10
---

# Session — 2026-09-10: Site memory — a build-generated AIKB, a check diff, and the `kiss-memory` plugin

## Intent (captured at /branch-open)

**Objective:** Make a kiss site carry its own memory: the engine writes the structural half of a site's knowledge base from the build (`kiss.aikb()`), `kiss-ssg check --against` makes "this change touched exactly these pages" checkable, and a second marketplace plugin (`kiss-memory`) ships the site-shaped open/pulse/close loop plus a "catch me up" briefing that reads it all back — so a developer returning after years, or a second developer joining, is briefed in minutes rather than rediscovering the site.

Full design and contract: `planning/plans/2026-09-10-site-memory.md`.

**Success criteria:**

- [ ] `kiss.aikb()` writes `AIKB/README.md` (once), `site-map.md`, `site-map.json`, `last-build.json`, byte-stable across identical builds; under `KISS_CHECK` it computes but writes nothing; the report carries `aikb: { folder, written, notes: { missing, dead } }`; the missing/dead rules hold on a fixture with one of each; example 8 commits a generated `AIKB/` with one note.
- [ ] Every generated page carries `hash` in the report; `kiss-ssg check --against <report>` prints added / removed / changed / unchanged in JSON and summary modes, pairs reports by `buildDir`, reads JSON Lines, a JSON array or a single report, and treats a missing file as a usage error; exit code unaffected.
- [ ] `plugins/kiss-memory/` with `kiss-catch-up`, `kiss-open`, `kiss-pulse`, `kiss-close`; second entry in the marketplace; version sync and the manifest test cover every plugin; the rubric copy is identity-tested; `.claude/skills/branch-open` reads back recent Feedback.
- [ ] Every new `lib/` module has a unit test and an AIKB doc in the same commit; `llms.txt`, `README.md`, `CLAUDE.md`'s table and `types/` updated; `npm run gates` green.

**Non-goals / out of scope:** a strict flag failing `check` on missing notes; note-heading enforcement; moving this repo's own skills onto the new plugin; a version bump, CHANGELOG entry or PR (the close does those when asked).

**Impact surface:** public API — a new method, a new `folders` key, two new report keys, a new `check` option, a second plugin. Obliges `llms.txt` + `README.md` + `types/`; the bump the close proposes is minor.

**Expected shape:** planned — three workstreams with a written contract; B and C concurrent, A after B; Fable reviews each diff before it is committed.

**Delegation convention:** Fable briefs, reviews and commits; agents implement, write to disk as they go and never commit.

### Amendments

## Pulse log

- **2026-09-10 (B and C landed)** — B (`6515c63`): `hash` on every generated page, `check --against` with `readReportsFile`, `diffReports`, `formatDiff`; one review change by Fable — a `KISS_REPORT` log holding several builds of one folder now pairs against the newest, pinned by a unit test. C (`4f363e6`): `plugins/kiss-memory` with four skills, `claude plugin validate --strict` clean on both plugins and the marketplace, manifest test and version sync generalised to every plugin, branch-open reads back Feedback; two edits outside the brief accepted (the `version` hook stages `plugins/*/…`, branch-close's Step 4a). README updated for both (`44ca42a`). 185 tests across the seven touched files green; full gates deferred until A lands. Criteria 2 and 3 evidenced; 1 in progress. Decision: **continue** to A; no drift.
