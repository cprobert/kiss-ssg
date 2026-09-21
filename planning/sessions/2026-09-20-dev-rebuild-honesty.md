---
branch: claude/fresh-build-feedback-9x9asm
base: main
status: closed
opened: 2026-09-20
consolidated: 2026-09-21
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

**2026-09-20 — Impact surface moved to public API, breaking; bump is MAJOR (operator-authorised).**
The Intent block declares the surface as "engine internals + tooling & docs — adds no API: no new
config key, no new method, no changed report shape. Patch bump." That is no longer true, and
`/branch-close` reads this block to propose the semver bump, so leaving it would have proposed a
patch for a branch containing a breaking change.

What moved it:

- **`{{asset}}` on a path no `.copyAssets()` emitted now fails the build** (R25, `22ef312`), matching
  `{{link}}`. Dev warns and renders the path as written. Breaking for any consuming site whose
  template asks for an asset that is not there — a case that previously warned and shipped a 404 on
  a green build. Taken under the operator's standing steer that architectural elegance outranks
  compatibility, because he owns every consumer.
- **`report()` reports differently under `.watch()`.** It refreshes between settles rather than
  carrying the last settled verdict (R22, `4f23b76`); a refresh returns a NEW object, so a retained
  reference is a snapshot; and a page that starts failing under watch is now recorded like any other
  failure (R29, `a9ffaa7`), which moves `ok` to `false` on a transient mid-edit error until the next
  save.
- **`duration` is frozen at the settle** rather than measured at assembly (R24/R28).

Operator's call, 2026-09-20: **major**. A break that is real is better visible in the version than
buried in a changelog entry, even when the person doing the migrating owns every consumer.

**Correction, 2026-09-20 (same day, after the bump had been made): the release is 2.5.0, not 3.0.0.**
The operator's answer at the pulse was read as choosing a major bump; it was not. The cause is mine —
the question's option was labelled "Major — 2.5.0 is wrong", which reads either way, and I took the
ambiguous half as confirmation rather than asking. The surface finding above stands unchanged: the
branch **is** breaking, and `{{asset}}`, the Sass compile failure and the Sass partial skip will each
fail a build that used to pass. What changes is how that break is versioned — a **minor**, on the
same reasoning 2.4.0 used for the redirect change: the operator owns every consuming site, so a break
is a migration he schedules rather than a promise made to strangers, and the changelog entry is where
it is announced. `CHANGELOG.md` now opens the 2.5.0 entry with a "breaking changes, in a minor
release" section saying exactly that, because a minor that breaks is only honest if it says so
loudly.

The branch's _theme_ did not drift — every round since R13 is the same subject it was opened for,
kiss claiming something it cannot deliver. What drifted is the blast radius, and only that.

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

- **2026-09-20 (pulse)** — all nine success criteria met with evidence: `{{#block}}`/`{{#extend}}`/
  `{{#content}}` each 1 in `llms.txt` (from 0), the `('.', '/')` claim gone, `sitemapLastmod`
  reachable, the helpers-location sentence present, `AIKB/watcher.md`'s page-list claim gone, the
  sibling-module restart notice in place, 78 watch tests green across `watch.test.js` and
  `watch-failure-lifecycle.test.js`, `npm run gates` green. Trajectory: 72 commits, 192 files,
  +11608/−670 against `main` — far past the captured intent, but thematically on it. **Drift: the
  impact surface, recorded as a dated Amendment above** (patch → public API, breaking; R25 is
  breaking, R22/R24/R29 changed report behaviour; versioned as a minor, see the correction under
  that Amendment). **Eyeball: looked** — operator read R25's new build-failure message on
  a real build with a typo'd asset path (`asset: 'css/typo.css' is not in the build (asked by
index.hbs) — no .copyAssets() emitted it…`) and judged it reads fine as it stands, including the
  repeated view name. Decision: **ready to close** — the finding yield inverted (R14–R29 were almost
  entirely defects introduced by this branch's own fixes rather than pre-existing ones, which is the
  signal the seam is worked out), three fixes rest on a single Windows machine that only a merge puts
  on CI's windows leg, and both remaining open items (the 2.4.0 version-string ambiguity, the empty
  CHANGELOG) are blocked _on_ the close rather than _by_ it. Operator authorised `/branch-close`.

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

- **2026-09-20 (third round — the multi-session verification loop, R4..R13)** — the operator put a
  second Claude session into a sustained loop with OpenAI Codex on his desktop, a Sonnet instance
  rebuilding swan-love, and a clean-room session converting a real 4-page site
  (spirit-of-boogie) from the published docs alone. It found, and I fixed, thirteen more defects
  (`3810fe5`..`9a6a82a`). Written down before compacting this session, because the transferable
  part is not the fix list.

  **The defects worth remembering as shapes, not as bugs:**

  - **A fix for a loud wrong behaviour introduced a quiet wrong behaviour — three times.** R6 and
    R10 both declined valid registrars silently; R12's Sass half silently stopped emitting a
    `_`-named entry stylesheet, with zero mentions in the build log. Each time the loud version
    was caught within minutes and the quiet one needed an external review to find. The peer named
    it, and the framing is the lesson: **"what does this now do silently?" belongs in the fix, not
    in the review afterwards.**
  - **The tested shape was not the shipped shape, twice.** `folders.helpers` defaults to the
    relative `./helpers` and every test named it absolutely, so the helper reload was inert in its
    own default configuration behind five green gates. `isActive`'s unit tests fabricated a
    `{ page: { pageURL } }` context — the shape the DOCS described — so they were green while
    every documented snippet was broken. A convention that ships a default needs a test that
    exercises the default; a helper's test must use the context a render actually has.
  - **The absolute-versus-relative path seam bit three times in one branch**: the helpers entry
    (R1), `helpersEntry`'s native separators on Windows (P7), and `isInside` normalising without
    resolving (R10). Resolve both sides, always.
  - **A detector that only asks what is MISSING cannot see what should not be there** — the `pack`
    gate shipped 75 files of example output, and the asset collision warning was dead under
    `assets.hash` for the same reason one layer down.
  - **A mention test cannot catch a contradiction.** `skill-coverage.test.js` asserted a skill
    NAMES `folders.helpers` while the same file told an agent to call the registrar by hand — and
    a clean-room agent followed the stale half. Hence the `CONTRADICTIONS` table: ban the sentence,
    do not require the mention.

  **Process failures of mine, recorded because they were not one-offs:**

  - **I committed twice without checking my own edit landed.** A scripted edit's anchor failed, the
    script aborted, the commit ran anyway because it was on a new line rather than chained. The
    second time was in the very commit fixing the first. Rule now in `CLAUDE.md`.
  - **I carried a verification across a change that invalidated it.** I reported the new ESLint rule
    as "verified by running it"; that was true of the broad version, and when I narrowed the
    selector it stopped firing entirely. Re-verify after the change, not before it.
  - **Five of seven of my defects were incomplete case analysis, not memory** — an untested config
    value (`folders.assets: null`), export forms enumerated from imagination rather than from real
    code, a discriminator that cannot run on a module that failed to import. Context length was not
    the cause and should not be offered as one.

  **On the loop itself, for whoever reads this before building another one:**

  - Instruments ranked by yield: **clean-room conversion > real-site variance > Codex-on-diff >
    my own gates.** The clean-room is the only thing that tests whether the documentation works,
    and it found behavioural defects (the silent Sass failure) as a side effect.
  - **The finding rate held; my fix quality became the constraint.** Roughly a third of my fix
    commits introduced a new defect, every one from a same-hour turnaround on a single finding
    without re-examining its neighbourhood. Doc and test fixes are safe to turn around fast;
    behavioural changes to `lib/` are not.
  - **The mix shifted.** Round one was eleven pre-existing defects; the last two Codex rounds were
    almost entirely about defects this remediation introduced. That is the signal that the loop is
    starting to spin on its own output, and the natural stopping point is the clean-room re-run
    from an `npm pack` tarball: if a fresh agent builds without hitting walls, the docs are done.
  - **The peer corrected itself twice, unprompted** — retracting "zero regressions across six
    sites" as "the estate does not contain the failing variant", and withdrawing its endorsement of
    R6 with an explanation of why its probe missed the case. An agent that only confirms is worse
    than no agent.

  **Still open at `9a6a82a`:** the Sass watch/report lifecycle (an asset change does not refresh
  the settled verdict, and `_replay()` can erase an unresolved failure while recompiling assets
  only when a pipeline exists) — so R8's guarantee currently holds for a single asset root on a
  cold build only; the ESLint selector no longer catching an explicit `file:` URL; and eleven
  clean-room documentation findings (`{{asset}}` documented as failing the build when it does not,
  README's first example shipping a broken site green, `.html` "inserted as-is" when it is
  compiled, `{{root}}` undefined anywhere, the redirects contradictions, examples cited as files,
  the partials pass count, and the Host URL table row the clean-room's live-host GitHub Pages
  matrix can now fill).

  Decision: **continue**, and compact this session — the durable state is the commit messages, the
  plan file and this log, not the conversation.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-09-20: A Verdict That Tells the Truth

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 80 commits, `4d8710b`..`HEAD`, released as **2.5.0**. A branch that opened to make one dev-mode notice honest and closed having made the build's entire machine verdict honest — `{{asset}}` and a failing stylesheet now fail the build instead of shipping a 404 on a green run; `report()` no longer lags the failure list under `.watch()`; and roughly a dozen documentation claims that contradicted the code, or each other, were measured and corrected.

## Reflect — what the session was

The brief was **planned and small**: a helper edit in dev logs `Rebuilding site:` and serves stale output, so make it say so, and fix the documentation gaps a real conversion off SCMS had found. Nine success criteria, every finding already measured with a reproducer, and a non-goal saying plainly that this branch makes the failure honest and does not make the edit take effect.

It became **emergent**, and the interesting thing is that the theme never moved. Every one of the thirty numbered rounds is the same subject the branch opened for — kiss claiming something it cannot deliver — but the subject turned out to be much larger than the dev-rebuild notice that surfaced it. A stylesheet that would not compile reported `ok: true`. A replay erased failures nothing would re-check. A copy's failure was owned by a prefix of its own display string. A test reported `passed` while executing nothing. Each was the same shape in a new place, and each was found by looking at the previous fix.

The shape served the work, but only because the operator kept re-authorising it explicitly — twice widening the remit in dated Amendments rather than letting it widen silently. A branch that grows from nine criteria to 79 commits without that is scope creep; this one has a paper trail for every expansion.

## Evaluate — how the human supervised the AI

Three dimensions discriminated this session. The rest were unremarkable and are skipped.

**Pushback & steering — the strongest dimension, and it changed outcomes rather than decorating them.** Four operator interventions each produced something the session would not have reached alone:

- _"Record them like any other failure."_ The scoped-re-render gap had been found by the external reviewer, and I had written it up as a design question with two options and no recommendation. The operator answered it in five words. The resulting R29 is a behaviour change I would not have made on my own initiative.
- _"Fix it"_ on `report()`'s staleness between settles. I had documented it instead, with a cost argument — re-settling a build per keystroke is wrong for dev mode — that the external session agreed with. The operator overruled both of us, and was right: the cost objection ruled out re-running `_finishBuild()`, not re-deriving the report. I had let an answer to one question stand as the answer to a different one, and two agreeing with each other is what made it feel settled.
- _"Not bound by legacy… architectural elegance as a prime objective."_ This reopened `{{asset}}`, which I had closed the narrow way **twice** — correcting the documentation of a behaviour in R16 and again in R21 without ever asking whether the behaviour was right. "The docs now describe it accurately" and "this is what we want" are different questions and I had only been answering the first.
- _"If there are upstream errors… document and live with them."_ This cancelled an ESM loader-hook investigation I had already committed to. The operator's framing — a doom loop rather than a flywheel — is sharper than anything in my reasoning, and it converted an open engineering task into a written constraint with a re-check condition (`AIKB/upstream.md`).

**Harness leverage — the decisive structural call was the operator's, and it was a refusal.** The external QA session offered its probe battery for adoption and then offered to send verified patches. Both were declined, and the operator confirmed the reasoning: _a net I own, run and maintain is not a check on me._ My gates were green through every defect that session found. The sharper version of the argument came from the QA session itself — we are the same model family, so its instinct about the right fix shape is very likely to be my instinct, which is the opposite of an independent check. That is the single most transferable thing in this log, and neither half of it was mine.

**Verification & ownership — mixed, and the failure is mine.** The red-first discipline held: 30 rounds, and almost every fix has a test seen failing against the unfixed code, with the two that could not be labelled as such rather than allowed to look like coverage. But five separate times a fix of mine introduced a defect of the same family, and the external session found each one. The pattern, stated once so it outlives the branch: **a decision taken by matching or deriving a string, where the thing the string names should have been resolved or recorded.** R13's prefix over a path, R14's carry test over a view, R15's cwd-relative label, R17's spelling-preserving key, R18's folder test, R21's creation-time key, R28's drain-time label. Seven instances. I fixed each one individually and only named the family after the external reviewer did.

**Where supervision was intended versus where it happened.** The honest answer is that between the operator's interventions, I ran long autonomous chains and self-evaluated them — and the operator said so directly: _"what's missing is having some simple questions for me so that you got a bit of a human in the loop here."_ That was accurate and overdue. I had been making calls and reporting them, with the decisions buried at the bottom of long reports as notes rather than put as questions. After that correction I asked at every genuine fork, and three of the four answers changed what I did next. The lesson is not "ask more questions" — it is that **a decision reported is not a decision delegated**, and I had been treating the two as equivalent.

**Competency level: Agentic engineering lead.** Earned on the evidence, not aspired to. The operator framed the multi-session architecture, ruled on the independence of the verification instrument, set two standing policies that are now repository rules, overruled two of my technical judgements on reasoning I could not fault, ran a mid-branch pulse that caught a stale impact surface before it produced a wrong semver bump, and authorised the close deliberately rather than drifting into it. The one gap — needing to ask for the human-in-the-loop checkpoints rather than being offered them — is a lesson for me, not a mark against the supervision.

## Feedback — recommendations for next session

- **Claude — put decisions as questions, not as notes at the bottom of a report.** The operator had to ask for this. A fork in the work where two readings lead to materially different outcomes is an `AskUserQuestion`, not a paragraph under "one thing I'd flag". Three of four such questions changed the work when finally asked.
- **Claude — when an external reviewer agrees with you, that is not confirmation.** The `report()` staleness call had my reasoning and the QA session's agreement, and was still wrong. Same model family, same blind spots. Agreement between two instances of the same model is one opinion held twice.
- **Claude — ask "what does this now swallow that it did not before?" at the point of writing a fix, not after.** Five fixes on this branch introduced a quieter defect than the loud one they removed. The QA session's phrasing, adopted here.
- **Claude — a path comparison is wrong unless both sides are canonicalised, and a canonicalisation that can fail must be stable across the failure.** Seven instances on one branch. Now in `AIKB/kiss.md`. There is no mechanical guard for it and I could not invent one that was not a false-positive factory; the rule is the guard.
- **Both — label which instrument produced which claim.** The QA session started doing this unprompted ("executed by me" / "relayed unverified" / "Codex ran read-only this round, so its magnitude numbers are stubs") and it changed what I did with individual findings more than the findings themselves did. On the `duration` defect I took its ordering evidence and discarded both magnitude figures, which was only possible because it had said which was which.
- **Claude — never offer a question option whose label can be read both ways.** "Major — 2.5.0 is wrong" was meant as "a minor would be wrong, so go major", and was read back as the opposite. The operator had to correct a version bump that had already been made, the changelog written and the PR opened. An option label states the choice (`Major — 3.0.0`), and the reasoning goes in the description where it cannot be mistaken for the choice itself.
- **Process — `/branch-pulse` caught the stale impact surface, and it was the only thing that could have.** The intent block still said "patch bump, no API change" while the branch carried a breaking change; `/branch-close` reads that block to propose the bump. A branch that closes unpulsed proposes the wrong semver from a stale field. Pulse at least once before closing anything that ran long.
- **Operator — the verification instrument stays outside the loop it checks.** Recorded as a recommendation to keep, not to change: the battery was offered for adoption twice and declined twice, and every defect it found was one the in-repo gates passed.

## Verdict — did we achieve the objective?

**The objective was met, and then legitimately moved twice — both times on the record.**

The captured criteria, ticked against the evidence in the Pulse log:

- [x] A helper module edited under `folders.src` in dev no longer presents as a successful rebuild — the restart notice, scoped to JavaScript modules after a mid-branch correction.
- [x] An entry-script edit that changes the page list says plainly that it cannot take effect.
- [x] `AIKB/watcher.md` no longer claims a capability the code does not have; every touched `lib/` module's doc updated in the same commit (Check 8 of the corpse scan: clean, across nine rewritten docs).
- [x] `llms.txt` § Helpers shows `{{#block}}` / `{{#extend}}` / `{{#content}}` — each 0 → 1, attributed to handlebars-layouts.
- [x] `llms.txt`'s `cleanBuild` paragraph states the is-or-contains-source rule; the `('.', '/')` claim gone.
- [x] `sitemapLastmod` reachable from `llms.txt` § `.sitemap()`.
- [x] One sentence states where helper modules live and what a dev edit to one does.
- [x] A regression test exists for the dev-honesty behaviour and was seen to fail against the unfixed code.
- [x] `npm run gates` passes — five gates green at 2.5.0.

**What is concretely better:** a build that reports `ok` now means it. Three separate paths that shipped a broken site on a green verdict — a missing asset, an uncompilable stylesheet, a failure erased by a replay — all fail loudly. `report()` is trustworthy between settles under `.watch()`, where it previously lagged in both directions. Thirty-odd documentation claims that contradicted the code or each other were measured and corrected, and the mention-vs-contradiction blind spot that let them accumulate is now enforced by a `CONTRADICTIONS` table covering `AIKB/` as well as the consumer surfaces.

**Good drift, not creep:** both expansions are dated Amendments with the operator's stated reason. The first widened the remit to the whole swan-love correspondence because that channel was closing. The second corrected the impact surface from patch to major, which is the difference between a correct release and a version number that lies about a breaking change.

**What remains open**, carried in `planning/plans/2026-09-20-review-remediation.md`:

- Three fixes assert a property meaningful only on a case-insensitive filesystem and are verified on one Windows machine until CI's `windows-latest` leg runs post-merge. The symlink half covers the same mechanism portably, which is why this is a note rather than a risk.
- The clean-room re-conversion has not re-run since the documentation fixes landed. It is the instrument that started this branch, and it should run against the published 3.0.0 tarball rather than the branch.
- `MIGHT_BE_OURS` matching `export *` makes the helpers guess-gate a no-op for a barrel `index.js`. Reviewed as a design note, not a defect — blast radius is first-party code — and left deliberately.
