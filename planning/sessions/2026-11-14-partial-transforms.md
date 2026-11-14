---
branch: feat/partial-transforms
base: main
status: open
opened: 2026-11-14
scope: lib/partials.js, lib/config.js, lib/kiss.js, lib/handlebars-helpers.js, lib/rebuild.js, test/**, AIKB/**, GUIDE.md, llms.txt, README.md, types/**, CHANGELOG.md, package.json, package-lock.json, plugins/**, examples/*/src/partials/**, examples/4-layouts-and-partials/router.js, examples/4-layouts-and-partials/src/**, examples/9-migrated-from-v1/AIKB/last-build.json, planning/**, src/**, .claude-plugin/**
---

# Session — 2026-11-14: Partial transforms (2.16)

## Intent (captured at /branch-open)

**Objective:** Turn `registerPartials`' fixed passes into a table of transforms keyed by extension. In that table `.md` renders per call, after Handlebars, so `{{link "x"}}` and `{{> "nav"}}` work in a `.md` partial, and a site can add its own transforms through `config.transforms`. This is Phase 1's first release (2.16) of [the roadmap to 3.0](../plans/2026-11-10-roadmap-to-3.0.md), built from [the spec](../specs/2026-10-24-partial-transforms-design.md).

**Success criteria:**

- [ ] **The `.md` defect is fixed.** `{{link "id"}}` and `{{> "nav"}}` inside a `.md` partial render correctly. A new integration test shows this, and it was seen red against `main` with `scripts/red-first.mjs`.
- [ ] **Collisions fail the build.** `foo.md` + `foo.hbs` fails the build, naming both files. The flipped test (`test/unit/partials.test.js:78`) is seen red first.
- [ ] **A site transform works.** A site's own transform (e.g. `adoc`) with an async `setup` renders, and its `render` receives `{ name, file, page, context, hash }`.
- [ ] **A failed `setup` is reported.** It is a named failure in the report, a page calling a partial of that extension fails, and the build neither hangs nor passes silently.
- [ ] **`.txt` and layouts are unchanged.** `.txt` stays literal and layouts stay `.hbs`; the existing tests stay green.
- [ ] **Scoped rebuilds still work.** A watch rebuild still re-renders a page when its `.md` partial or a custom-extension partial changes.
- [ ] **Measured before memoising.** `npm run bench` runs before and after, and the memoising decision is made from those numbers and recorded.
- [ ] **The docs are current.**
  - GUIDE (the partials section, `config.markdown` and a new `config.transforms` section), the `llms.txt` index line, `AIKB/partials.md`, `AIKB/config.md`, `AIKB/kiss.md`, README and `types/` are all updated, and the `.md` trap text is gone wherever it appeared.
  - The example prose is corrected (seven `newsletter.md`, `sourcing-note.md` and `5-helpers/…/tasting.md`), and a `CONTRADICTIONS` row bans the old sentence.
- [ ] **Fleet:** `node scripts/fleet-check.mjs <site> --base main` passes on at least one real site that has `.md` partials, with every difference explained.
- [ ] **Clean room:** a fresh agent, given only the packed tarball and the shipped docs, builds a site with a `.md` partial that uses `{{link}}`, and the site passes `kiss-ssg check`. It reports every place it had to guess.
- [ ] **Codex:** it reviewed the first engine slice (at a pulse) and the close, and no finding inside the threat model is open.
- [ ] **Gates:** `npm run gates` is green.

**Non-goals / out of scope:**

- the `{{#transform}}` block helper;
- transforms for layouts;
- Markdown pages (views);
- markdown-it (2.17);
- the freeze and wiring the budgets into the gates (later in Phase 1);
- changing the `{{markdown}}` helper;
- protecting Handlebars-inserted HTML under `markdown.html: false`.

**Impact surface:** public API — a new config key (`config.transforms`), plus three changes a site must adapt to: `.md` partials now render after Handlebars, name collisions now fail, and under `html: false` helper HTML is escaped. That makes it a minor (2.16.0) with a `### Upgrading` note.

**Expected shape:** planned — the spec, plus a re-check of it against 2.15.1, maps the route.

**Assumptions:**

- _Measured_ (2026-11-13, an Explore re-check of the spec against `lib/` at `68633b4`):
  - **The spec's engine description holds; the line numbers moved.**
    - Remarkable runs at registration: `lib/partials.js:19`.
    - `literalPartial`: `:52`. `tracingPartial`: `:74`. `partialNameFor`: `:98`. `registerPartials`: `:129-144`.
    - The `{{markdown}}` helper: `lib/handlebars-helpers.js:104`.
    - `DEFAULT_MARKDOWN`: `lib/config.js:321`.
    - The watcher's partial branch: `lib/rebuild.js:471`.
  - `partialNameFor` and the partial branch of `rebuild.js` do not filter by extension.
  - Unknown config keys pass silently through to views (`config.js:204`), so `transforms` needs explicit validation.
  - `_promises` doubles as `generate()`'s data array. An async `setup` therefore follows the `_helpersReady` pattern (`kiss.js:393, 848, 957-1011, 1516`) and is never pushed onto `_promises`.
  - No shipped `.md` partial relies on Markdown running first. The only interpolation, `examples/4-…/sourcing.md`'s `**{{model.buyer}}**`, inserts plain names.
  - The spec's touch list missed `AIKB/kiss.md:86` and `examples/5-helpers/src/partials/tasting.md`.
- _Inferred_ (to check in slice 1):
  - `lib/watcher.js`'s globs do not filter partial extensions.
  - A partial function's string output is inserted raw, so `render` needs no `SafeString`.
  - Flipping the order changes no fleet site's bytes, because no fleet `.md` partial interpolates Markdown-significant text. The fleet check will show whether this holds.

**Delegation convention:** none: one session. The operator reviews the diff, and no agent commits.

**Independent review:** Codex, on the first engine slice at a `/branch-pulse` and again at `/branch-close`. The loop is capped at three rounds; after that Claude asks before running a fourth. The threat model is set when the first round starts.

**Decisions taken at open (operator, 2026-11-13):**

- **Ship the full spec, `config.transforms` included.** It lands the registry before the freeze, rather than adding API during it.
- **No block helper.**
- **`html: false` is documented, not engineered around.** Under `markdown.html: false`, a `.md` partial's helper output is escaped. The upgrade note and GUIDE point such a partial to `.hbs` with `{{#markdown}}`.
- **The work is done here, not in a worktree.**

**Read-back (2026-11-13):**

- I skimmed the Feedback of all 68 logs.
- About ten lessons recur in three or more logs and are not retired, among them "a fix is a change: prove it", the red-first follow-ups, and worktree hygiene. That meets `/memory-consolidate`'s trigger, so I recommend running it between branches; it is not run here.
- **Two recurring pieces of work were scheduled by the operator as next branches**, in an order still to choose:
  - the watch-test flake, which is in five logs;
  - the docs backlog from clean rooms and the corpse collector, which is in five logs, together with issue #90.
- **Recording what the first `/kiss-publish` saw** recurs in two logs. That belongs to the 2.15.1 release, which `package.json` holds but npm does not yet serve (npm serves 2.15.0), not to this branch.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-11-14 — The collision rule covers a partial and a layout too.** The spec named `foo.md` + `foo.hbs`. A same-named partial and layout used to resolve silently (the layout won), which is the same class: two files, one name, one silently wins. Now it is a `<partials>` failure as well. Offered at the pulse; the operator chose **keep**. The upgrade note must say so, and the fleet check will show whether any site has such a pair.
- **2026-11-14 — `lib/rebuild.js` added to `scope:`.** Codex round 3 found that the scoped watch re-render (`rebuildEntries`) awaited the helpers but not the transforms' setups. The fix is one line in `lib/rebuild.js`, which mirrors the existing `_helpersReady` await. It is the same feature's readiness, not a new subsystem.
- **2026-11-14 — Two example files added to `scope:` (slice 2).**
  - **`examples/4-layouts-and-partials/src/pages/index.hbs`** carries the same retired sentence as the partials ("Markdown that kiss renders as it registers it"). It is a page, not a partial, so the original glob missed it.
  - **`examples/9-migrated-from-v1/AIKB/last-build.json`** is example 9's committed knowledge base. It records each page's hash, so correcting that example's `sourcing-note.md` changed one hash, and `test/integration/examples.test.js` requires the record to match. It was re-recorded with `npx kiss-ssg aikb router.js`, the one writer of that folder, and the diff is that one hash.
- **2026-11-14 — Example 4 absorbed (slice 3, from the clean room).** The operator chose both of these, on the clean room's findings.
  - **Hand-written URLs (operator: absorb it here).** Example 4 hand-wrote its internal URLs: nav `href: 'index.html'`, `<a href="stockists.html">`, and `{{root}}` prefixes that the example never supplies, so they rendered empty. That contradicts llms.txt's "Never hand-write an internal URL", in the example GUIDE names as the one to read. It predates this branch. The nav now names pages by `id`, and the header uses `{{#isActive .. href=(link id)}}`, GUIDE's recipe. The aside uses `{{link "stockists"}}`, and the stylesheet uses `/{{asset …}}` (llms.txt). `scope:` is widened to `examples/4-layouts-and-partials/router.js` and `src/**`, replacing the single `index.hbs` entry.
  - **A shipped `.md` partial that calls a helper (operator: add it here).** No shipped example showed one; `sourcing.md` now carries a `{{link "stockists"}}`.
  - **Checked:** `npm run eg4` builds; the nav marks the active page on both pages; `npx kiss-ssg check router.js` from the example's folder exits 0, with 6 internal references and none broken.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-14** — **Slice 1 (engine) landed:** `3621097`, `d04fea2`, then the review fixes `05f401d`, `69968d4` and `075d130`. The branch is level with `origin/main`.
  - **The `.md` defect is fixed — met.**
    - `test/integration/partial-transforms.test.js` covers `{{link "id"}}`, `{{> "nav"}}` and hash arguments inside a `.md` partial.
    - red-first: test/integration/partial-transforms.test.js failed at main (68633b4), 2026-11-14. All nine failed; the `.md` case failed with the original `Parse error … {{link &quot;about&quot;}}`.
  - **Collisions fail the build — met.**
    - red-first: test/unit/partials.test.js -t "reports a collision" failed at main (68633b4), 2026-11-14. Honest note: it failed there on the return shape (`first.names` undefined), so the behavioural evidence is the integration collision test, which was red at main.
  - **A site transform works — met.** An integration test covers an async `setup`, a `render` receiving `{ name, file, page, context, hash }`, and `compile: false`.
  - **A failed `setup` is reported — met.** It is a carried `<transform .adoc>` failure; the page calling the partial fails and the plain page is still written.
  - **`.txt` and layouts are unchanged — met.** The existing `.txt` and layout tests pass unchanged.
  - **Scoped rebuilds still work — met.**
    - The watch test for an `.adoc` edit shows it re-renders only its own page, in three runs out of three.
    - Inferred assumption now measured: `lib/watcher.js` ignores only the assets, helpers and build folders, never an extension.
  - **Measured before memoising — met.**
    - The first after-run overlapped the test runs and is discarded.
    - Re-run on a quiet machine, `fanout@500` with 7 runs each: base `68633b4` against branch `d04fea2` gives total −7.4% and build −7.9%.
    - **Decision: no memoisation.** Rendering per call costs less than the registration-time path did.
    - One unexplained regression: `construct` is +14% (about 13 ms), named here and not chased.
  - **Docs — partial.** The default-config blocks in `llms.txt` and GUIDE are done. `llms.txt`'s partials line is rewritten at 15,994 characters; `main` had only 5 characters of headroom. GUIDE, AIKB, the examples and the changelog are slice 2.
  - **Fleet, clean room — not yet.**
  - **Codex — the slice-1 loop is done.** Four rounds; the threat model was "correctness + contract".
    - **R1 (P2):** a file reached through both folders collided with itself.
    - **R2 (P2):** an edge in R1's fix, comparing path strings rather than files. The class was named to the operator before R3.
    - **R3 (P2):** a new class, readiness: `rebuildEntries` did not await `_transformsReady`. That was the cap; the operator chose to fix it and run a fourth round.
    - **R4:** no findings in scope.
    - Each fix was seen red on the branch first.
  - **Gates:** `npm test` passes, 148 files and 5,008 tests. Typecheck is clean.
  - **Drift:** the two Amendments above (the collision rule widened to partial vs layout; `lib/rebuild.js` added to scope). `scope-check` listed `lib/rebuild.js` before the widening.
  - **Eyeball: deferred** to `/branch-close` Step 5a (the close's eyeball). The artefact is `examples/4-layouts-and-partials/public/index.html`, the `.md` partial's "run by **Tom**" line.
  - **Offer:** the partial-vs-layout collision. Operator: **keep**.
  - **Decision: continue** to slice 2 (docs, examples, changelog).
- **2026-11-14** — **Slice 2 (docs) landed:** `4befac1`, with no `lib/` change. The branch is level with `origin/main` (0 behind).
  - **The docs are current — met, except the changelog, which lands at the close.**
    - **GUIDE:**
      - the partials paragraph has lost the trap;
      - Markdown options covers `html: false` and a later `kiss.remarkable` change;
      - a new "Partial transforms" section has its own entry in `src/models/guide.json`, and `node docs` builds (exit 0).
    - **AIKB:** `partials.md` is rewritten; `config.md`, `kiss.md`, `rebuild.md` and `upstream.md` are updated.
    - **README:** one line added.
    - **Examples:** nine partials and example 4's page are corrected.
    - **Ban:** the `CONTRADICTIONS` row bans six sentences. It was seen red on the eight example files before they were fixed.
    - **Changelog:** the 2.16.0 entry is drafted at the end of the spec. `test/unit/changelog.test.js` requires the newest entry to match `package.json`, so `/branch-close` carries it in with the bump.
  - **Measured before writing:** each new GUIDE claim was probed against the branch's engine (`scratchpad/probe-docs.mjs`):
    - inserted `*` becomes emphasis;
    - a call indented four spaces becomes a code block;
    - `kiss.remarkable.set` after construction reaches `.md` partials;
    - the `.txt` + `.hbs` pair is a collision;
    - a call outside `{{#markdown}}` keeps its markup under `html: false`, and one inside is escaped. **This corrects the open decision's ".hbs with {{#markdown}}" wording**: the call must sit outside the block.

    The GUIDE's `config.transforms` snippet also ran.

  - **Gates:** the full `npm test` failed once (1 of 5,023 tests), on example 9's knowledge base. `sourcing-note.md` changed one page hash; the base was re-recorded with `npx kiss-ssg aikb router.js`, and `examples`, `skill-coverage`, `aikb`, `changelog` and `partial-transforms` then passed (706 tests). Typecheck and Prettier are clean.
  - **No skill-coverage row:** no skill has a reason to reach for `config.transforms` yet.
  - **Drift:** one Amendment, adding two example files to `scope:`. `scope-check` exits 0. Docs only; the impact surface is unchanged.
  - **Eyeball: looked.** The operator read GUIDE § Partial transforms: "reads right". The example-4 eyeball is still deferred to `/branch-close` Step 5a.
  - **Offer:** the changelog draft in the spec rather than `CHANGELOG.md`. Operator: **keep**.
  - **Fleet, clean room, Codex at the close — not yet.**
  - **Decision: continue** to slice 3 (fleet check, clean room).
- **2026-11-14** — **Slice 3 (verify) done:** `206cf94` and `0fb9f74`. The branch is 0 commits behind `origin/main`.
  - **Fleet — met.** `a1k9training` is the only fleet site under `C:\Code\kiss` with `.md` partials. It has 19, five of which interpolate: three start with `{{image …}}`, two put `{{config.business.telephone}}` in a `tel:` href, and one inserts `{{experienceYears}}`.
    - Its `.md` partials carry no collisions, of either kind.
    - Result: `Fleet check: C:\Code\kiss\a1k9training, main (68633b4, 2.15.1) against HEAD (c7d454e, 2.15.1): identical.` That covers 20 page hashes (0 changed) and 571 build files (0 differ as bytes), with `fleet-check` exit 0. The site's tree was clean afterwards.
    - The inferred assumption "flipping the order changes no fleet site's bytes" is now measured, on this one site.
    - The other v2 fleet sites have no `.md` partials and were not built.
  - **Clean room — met.** A fresh agent, given only the packed tarball (`kiss-ssg-2.15.1.tgz` at `c7d454e`) and the shipped docs, built a three-page site in an empty folder.
    - **The result.** Its `.md` partial used `{{link "about"}}` and `{{> "callout" tone="warn"}}`, which worked first time, and `kiss-ssg check` exited 0.
    - **The built page** has `<a href="/about.html">` and the callout markup unescaped.
    - **Its guesses, re-derived before acting on any:**
      - **The standalone-call blank line — a new trap, measured.** A call alone on its line loses its newline; when the called file has no final newline, the next paragraph loses its `<p>`. Documented in `206cf94`.
      - **A wrong reference.** `AIKB/partials.md` cited a GUIDE section that does not exist. Fixed in `206cf94`.
      - **Example 4.** It hand-wrote its URLs, and no shipped `.md` partial called a helper. Absorbed in `0fb9f74`, on the operator's call (Amendment above).
    - **Not acted on:**
      - CHANGELOG 2.8.1 still states the old trap, and the changelog is history, so it stays.
      - "2.16" appears in the docs before the bump, which `/branch-close` resolves.
  - **Docs — met, apart from the changelog**, which `/branch-close` carries in from the spec's draft. The draft now includes the blank-line note.
  - **Gates:** `npm test` passes, 148 files and 5,014 tests. `scope-check` exits 0.
  - **Drift:** one Amendment, example 4 absorbed, which widens `scope:`. It is still examples and docs; the impact surface is unchanged.
  - **Eyeball: deferred** to `/branch-close` Step 5a. The artefact is `examples/4-layouts-and-partials/public/index.html`: "run by **Tom**", a working "our stockists' shelves" link, and "The bar" marked active.
  - **Offer:** example 4's stylesheet moved to `/{{asset …}}`, past the approved link fix. The cost is that the page no longer opens from disk with its CSS. Operator: **keep**.
  - **Open:** Codex at the close; `npm run gates`; the version bump to 2.16.0, with the changelog entry from the spec.
  - **Decision: ready to close.** Every criterion is met except the ones only the close can meet: Codex at the close, the gates, and the changelog with the bump. `/branch-close` runs only when the operator asks.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
