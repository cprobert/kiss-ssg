---
branch: claude/fresh-build-feedback-9x9asm
base: main
status: open
opened: 2026-09-20
---

# Session — 2026-09-20: Dev Rebuild Honesty, and the Docs a Fresh Build Needed

## Intent (captured at /branch-open)

**Objective:** Stop kiss-ssg claiming a dev rebuild it cannot deliver, and close the documentation
gaps that a real conversion onto 2.4.0 found — so the next fresh build is misled by neither the
engine nor `llms.txt`.

**Provenance.** The findings come from the `Swan-Love/swan-love.github.io` conversion off SCMS
(kiss-ssg 2.4.0, 11 pages, 92 assets, merged and deployed), relayed as a written report by the
session that did it. Every finding this branch acts on was **re-derived locally** against `lib/`
before being accepted — see the measured/corrected split below. This is the "validate on a real
consuming site" recommendation (09-06, 09-10, 09-12) finally paying out.

**Measured here, not merely relayed:**

- A helper module edited under `folders.src` in dev logs `change: … 0` then `Rebuilding site:`,
  the replay runs, live reload fires — and the page still renders the **old** helper output.
  The peer left this inferred; it is now measured. Mechanism: `lib/kiss.js:2450` — the file matches
  no stack entry, so it falls through to a full replay, and ESM will not re-import a cached module.
- **The wider case, found here and not in the report:** editing the entry script itself to add a
  `.page()` logs `Changed: …/router.js:` and `Rebuilding site:`, and the new page is never built.
  `_replay()` replays the cached `_registrations`. `AIKB/watcher.md:25` states the entry watcher
  exists because "the page list itself may have changed" — a documented promise the code cannot keep.
- F6's token counts reproduce exactly: `{{#extend}}` 0/1, `{{#content}}` 0/0, `{{#block}}` 0/0.

**Corrected on re-derivation (the reason the rule exists):**

- **F1 was overstated.** For a normal layout with `src` inside the repo root, `build: '.'` _does_
  throw, via `swallowsSource` (`lib/config.js:377`). The advice the peer gave its site owner was
  right in effect; only the stated reason was wrong. The real defect is narrower: `llms.txt:101`'s
  `('.', '/')` parenthetical mislabels why, and the message hardcodes "contains the source folder"
  even when the root branch fires.
- **F3 has an existing escape hatch** the report missed: `sitemapLastmod` is already documented in
  `README.md:450`, `llms.txt:33` and `AIKB/sitemap.md:9`. The finding survives as a discoverability
  problem, not an absent capability.

**Success criteria:**

- [ ] A helper module edited under `folders.src` in dev no longer presents as a successful rebuild:
      the log says the change cannot take effect without a restart. Checked against the scratch
      fixture that today prints a bare `Rebuilding site:` and serves stale output.
- [ ] An entry-script edit that changes the page list either takes effect or says plainly that it
      cannot. Checked against the fixture where adding `.page({ view: 'second.hbs' })` today
      produces no `second.html` and no warning.
- [ ] `AIKB/watcher.md` no longer claims a capability the code does not have, and every touched
      `lib/` module's AIKB doc is updated in the same commit.
- [ ] `llms.txt` § Helpers shows a layout using `{{#block}}` and a page using
      `{{#extend}}`/`{{#content}}`, and says they come from handlebars-layouts rather than from kiss.
      Fixed-string count for each rises from 0 to at least 1.
- [ ] `llms.txt`'s `cleanBuild` paragraph states the is-or-contains-source rule and drops the
      `('.', '/')` filesystem-root claim.
- [ ] `sitemapLastmod` is reachable from `llms.txt` § `.sitemap()` as the answer to "why is my build
      not reproducible".
- [ ] One sentence states where helper modules live (`src/helpers/`) and what a dev edit to one does.
- [ ] A regression test exists for the dev-honesty behaviour and **has been seen to fail** against
      the unfixed code.
- [ ] `npm run gates` passes.

**Non-goals / out of scope:**

- **Making the edit actually live.** No process restart, no cache-busting re-import. This branch
  makes the failure honest; it does not make helper or entry-script edits take effect.
- F2 (a sibling `.css` silently overwriting compiled `.scss` — verified: `lib/assets.js:96` compiles,
  `:98` copies over the top). Real and valuable, deferred because it touches the asset manifest, where the
  `examples.test.js` self-heal problem noted on 2026-09-16 lives.

  **Correction, 2026-09-20 (this session was wrong).** I told the swan-love session that
  `report().assets` showing a single entry meant the manifest does not record sass output, so the fix
  would need a manifest redesign. It does record it. `recordEmitted` (`lib/assets.js:60`) globs the
  **source** dir and rewrites `.scss`/`.sass` to `.css` for the key, so sass output is keyed by its
  compiled name — measured here: a `.scss`-only source yields
  `{source: 'css/only.css', target: 'css/only.css'}` with no `.scss` in the build. A collision is
  therefore **two writes to one key**, the second overwriting the first, and detecting it is local to
  that loop. The originally suggested `logger.warn` is viable and the job is smaller than this non-goal
  first claimed. The peer caught this; I had inferred absence from a single entry without reading the
  loop that produced it.

- F5(b), the `/docs` dangling-reference bug — reported, not yet re-derived here.
- F4, a built-in `{{url}}` helper for external URLs — a public API addition, a different impact
  surface and a different bump.
- F8's `kiss-site-migrate` changes and the "plugins are not in the npm tarball" note — skill/plugin
  surface, separate branch.
- The bench baseline contradiction — `/memory-consolidate`'s job, flagged at this open, not this
  branch's diff.

**Impact surface:** engine internals + tooling & docs — a dev-mode notice changes observable
behaviour but adds no API: no new config key, no new method, no changed report shape. Patch bump;
obliges the touched `AIKB/` docs plus `llms.txt` and `README.md` for the documentation fixes.

**Expected shape:** planned — every finding is already measured with a reproducer, and the fix for
each is named. The one open design question (notice vs. restart) is settled by the non-goal above.

**Delegation convention:** none: one session. The evidence is already gathered in this session's
context and the branch is small, so briefing agents would cost more than it saves. If an independent
review becomes warranted before close, it is a fresh-context agent re-deriving the findings — and if
that review does not run, the close says the branch has no independent review rather than letting
this session's self-check stand in for one (2026-09-16).

### Amendments

**2026-09-20 — F5(b) absorbed (operator-authorised).** Listed as a non-goal at open
("reported, not yet re-derived here"). The swan-love session then sent a standalone
reproducer, and it has now been re-derived and **widened** here: it is not only the build
folder. Every folder the site is configured with is reported `dangling` when a note writes
it with a leading slash, while the same folder written `./x`, `x` or `x/` resolves —
measured on one record as four findings (`/docs`, `/src`, `/src/assets`, `/src/pages`) and
zero real problems. Mechanism: `lib/aikb.js:491` normalises known values through
`posixPath`, `:519` does an exact `known.has`, and `:527`'s fallback looks for a candidate
ending `/${value}` — i.e. `//docs`. In scope now: normalise the token before the lookup so
all four cases resolve, plus a regression test seen red first. The AIKB lint is what makes
`check` trustworthy, so false findings cost it credibility directly.

**2026-09-20 — the discarded pile absorbed (operator-authorised).** After the branch was validated
against the real site, the swan-love session was asked what it had _not_ reported — the findings it had
filtered out as its own fault, too small, or too embarrassing. Ten items came back. Its own meta-reading
is the valuable part and is now this branch's second theme: **eight of the ten were cases where the
documentation was correct and the author still got it wrong. The failure mode is not a missing rule, it
is a rule whose consequence is not stated beside it.** Five fixes taken, each verified here first rather
than taken on report:

- `cleanBuild: 'atomic'` degrading in dev is documented; that a dev run therefore writes a dev build
  into the published folder is not. Cost the reporter hours, found by grepping output for "livereload".
  Confirmed: `lib/kiss-page.js:206` injects the livereload `<script>` into dev output.
- `{{#isActive page …}}` reads as though `page` were a keyword. It is the page context passed
  positionally, and a data-driven nav needs `../page` inside the `{{#each}}`. `lib/handlebars-helpers.js`
  documents this in a source comment that notes two independent agents hit it — it had never reached
  `llms.txt`. (The reporter said `..`; the correct form is `../page`.)
- A non-dev build minifies, so output never diffs clean against a non-minifying generator. The rule was
  documented; the consequence for anyone migrating a site was not.
- `check` and `aikb` had no suggested `package.json` script names, so `npm run aikb` was the reporter's
  own invention and it did not run the command until prompted.
- A space in an asset filename works end to end. Measured here: manifest, `{{asset}}` and the link scan
  all handle `hand-in-hand-for syria.png` (`checked: 1, broken: []`). The reporter lost real time to
  planning a rename that was never needed — a non-defect worth one clause precisely because everyone
  assumes the opposite.

Not taken: the `{{url}}` external-URL helper (F4, a public API addition), `.scan()` vs `.page()` guidance
for a migration (a skill surface, and skills do not ship in the tarball), and the doubt over whether
`AIKB/` should be gitignored (`llms.txt` already says plainly that it is committed source).

**2026-09-20 — F2 absorbed (operator-authorised at the pulse).** The sass/css collision was a
non-goal at open, deferred because it touches the asset manifest. Two things changed. The deferral's
stated reason dissolved: the manifest does record sass output (see the correction above), so the fix is
local to `recordEmitted`'s loop and a `logger.warn` changes no report shape — the `examples.test.js`
self-heal risk that motivated the deferral does not apply. And the downstream session, after testing the
branch on the real site, ranked it **above anything in its original report**: it is the one defect nobody
caught. They deleted `layout.css` and `carousel.css` as untidy and only afterwards checked the compiled
bytes matched; had they drifted, stale CSS ships with a green build and a clean `check`, and the only
person who notices is a visitor comparing the site to last year. In scope: a warning when one emitted
path is claimed by both a sass compile and a plain copy, plus a regression test seen red first.

**2026-09-20 — scope and impact surface widened (operator-authorised).** The intent captured at open
read the branch as "dev honesty + the cheap docs fixes". The operator has restated it: the branch's
actual remit is **the swan-love correspondence itself — take value from it wherever it improves kiss,
and stop only when the two sessions have concluded**. That is broader than the captured Objective, and
it changes two recorded fields:

- **Impact surface: now public API**, not engine internals + tooling & docs. `folders.helpers` and
  registering `.txt` partials are both observable to a consuming site. **The bump is therefore minor,
  not patch**, and `/docs-sweep` now obliges `llms.txt`, `README.md` and regenerated `types/`.
- **The non-goals list is superseded** for anything the correspondence surfaced. `{{url}}` (F4),
  `.txt` partials, the `src: './src'` example and `folders.helpers` are all in scope now.

The operator's stated reason for widening rather than deferring: swan-love is a legacy site that will
not be revisited once this closes, so the value has to be extracted while the channel is open. And the
API latitude is real and deliberate — he owns every repository consuming this library and is its only
consumer, so a small breaking-shaped change costs a version bump rather than a migration.

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-09-20** — all nine success criteria met with evidence: the helper and entry-script traps
  measured in a live dev run and covered by tests **seen red first**; `{{#extend}}`/`{{#content}}`/`{{#block}}`
  each 0→1 in `llms.txt` with the documented example **built and rendered** before being written;
  `cleanBuild` and `sitemapLastmod` corrected; `AIKB/watcher.md`'s false claim retired. `npm test`
  green (1349 tests, 65 files); five gates green. Two defects of my own caught mid-branch rather than at
  close: the notice fired on data files a replay _does_ pick up (narrowed to `.js`/`.mjs`/`.cjs`), and I
  had told the downstream session the manifest does not record sass output, which was wrong.
  External validation: the swan-love session ran the branch against the real site — three `dangling`
  findings to zero, `= 11 unchanged` against its 2.4.0 baseline, notices silent on one-shot builds.
  No drift: surface is still engine internals + tooling & docs, no new config key, method or report key.
  **Eyeball: looked** — ran `npm run eg9 -- --dev`, edited `helpers/index.js`, read the notice; wording
  does its job. Decision: **record amendment** (F2 absorbed) and continue; close once F2 lands.

- **2026-09-20 (post-review remediation)** — a local `/code-review` pass and a downstream Codex
  review between them found eleven defects in this branch's own work. All eleven are fixed,
  planned in `planning/plans/2026-09-20-review-remediation.md` and worked one commit at a time
  (`7d82ac4`..`ff5b3e9`), each with a test seen red against the unfixed code wherever a test could
  be red. The ones that matter as lessons rather than as fixes:

  - **The feature built to end dishonest dev rebuilds shipped a dishonest dev rebuild.** Only the
    helpers _entry_ is cache-busted, so a sibling module the entry imports came back from the ESM
    cache — the registrar re-registered the old helper while every page re-rendered and the browser
    reloaded. Exactly the trap this branch exists to remove, one level down, and `folders.helpers`
    was exempted from the restart notice that would have caught it.
  - **A detector that only ever asks what is missing cannot see what should not be there.** The
    `pack` gate checked `REQUIRED_PACKED` and nothing else, so 75 files of example build output
    shipped in the tarball against CLAUDE.md's "never ships". The same shape twice: the asset
    collision warning was dead under `assets.hash` because the check sat after the move that made
    it unreachable.
  - **A doc is a claim, including the ones written this branch.** `llms.txt` told an agent to write
    `registerHelpers(kiss)` in the router eleven lines before telling it not to; example 9 did both.
  - **"All five gates green" was Linux.** Said repeatedly on this branch, never qualified.
    `helpersEntry` returned a native-separator path and I have no Windows leg to prove it; CI does.

  Decision: **continue** — the branch stays open until the downstream Codex review has run against
  the new tip, since that review is the only thing outside this session that can say the fixes hold.

- **2026-09-20 (second round — the remediation's own defects)** — a downstream Codex review plus a
  peer session's probe harness found six defects introduced BY the eleven fixes. All six fixed
  (`43186e2`, `0ab339c`, `3eb949b`), each re-derived here by execution before being acted on.
  The one that matters:

  - **The feature did not work in its own default configuration, and all five gates were green.**
    `folders.helpers` defaults to the relative `./helpers`; chokidar emits relative events;
    `helpersEntry` returns absolute. Every entry edit was classified as an un-reloadable sibling —
    on the branch whose entire purpose is to stop a dev rebuild lying about what it picked up.
    Reproduced locally, and confirmed by the peer on Windows and on a real site.
  - **The coverage gap is the transferable lesson.** Every test named the folder absolutely;
    `grep -rn "'./helpers'" test/` returned nothing. The tested path and the shipped path were
    different paths. A convention that ships a default needs a test that exercises the default,
    not a convenient absolute stand-in for it.
  - **The same mistake twice in one branch.** The restart notice was narrowed to `.js`/`.mjs`/`.cjs`
    in `_handleChange` earlier on this branch, because a data file read at render time DOES reload.
    I then wrote a second dispatch that demanded a restart for `labels.json`.
  - **"Pages fail loudly" was an overstatement I made and had to withdraw.** Measured: an
    argument-less `{{copyright}}` renders empty rather than throwing, and `_rebuild` swallows the
    per-page rejection so the stale file stays on disk.
  - **P7's Linux-only caveat is retired** on the peer's Windows run — the one thing this session
    could not verify for itself.

  Decision: **continue**. The peer is in a sustained verification loop at the operator's direction;
  fixes go out as they land rather than batched.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
